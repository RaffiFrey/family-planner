import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assistantProposals,
  assistantRequests,
  calendarSubscriptions,
  createDb,
  files,
  googleCalendarConnections,
  notifications,
} from '@fp/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Db } from '../src/infra/database.js';
import { ObjectStorage } from '../src/infra/storage.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { AssistantService } from '../src/modules/integrations/assistant/assistant.service.js';
import {
  AssistantLlm,
  type LlmClient,
  LlmRefusalError,
  type LlmStructuredRequest,
  type LlmToolRequest,
  type LlmToolResponse,
} from '../src/modules/integrations/assistant/llm.js';
import {
  type GoogleCalendarApi,
  type GoogleEvent,
  type GoogleEventInput,
  type GoogleEventTime,
  GoogleSyncTokenExpired,
} from '../src/modules/integrations/calendar-sync/google-api.js';
import { GoogleSyncService } from '../src/modules/integrations/calendar-sync/google-sync.service.js';
import {
  FeedFetcher,
  SubscriptionsService,
} from '../src/modules/integrations/calendar-sync/subscriptions.service.js';
import { type Stack, startStack, TestClient } from './harness.js';

// ---------------------------------------------------------------- fakes

const usage = { model: 'fake-model', inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 };

class FakeLlm implements LlmClient {
  toolResponses: (Omit<LlmToolResponse, 'usage'> | Error)[] = [];
  structuredResponses: unknown[] = [];
  toolRequests: LlmToolRequest[] = [];
  structuredRequests: LlmStructuredRequest<unknown>[] = [];

  callTools(req: LlmToolRequest): Promise<LlmToolResponse> {
    this.toolRequests.push(req);
    const next = this.toolResponses.shift() ?? { toolCalls: [], text: 'Was meinst du?' };
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({ ...next, usage });
  }

  structured<T>(req: LlmStructuredRequest<T>) {
    this.structuredRequests.push(req as LlmStructuredRequest<unknown>);
    return Promise.resolve({ data: req.schema.parse(this.structuredResponses.shift()), usage });
  }
}

/** In-memory Google Calendar with a change log for incremental sync. */
class FakeGoogle implements GoogleCalendarApi {
  events = new Map<string, GoogleEvent & { extendedProperties?: unknown }>();
  log: { seq: number; id: string }[] = [];
  seq = 0;
  revoked: string[] = [];
  expireNextSyncToken = false;
  private nextId = 1;

  authUrl(p: { redirectUri: string; state: string }): string {
    return `https://accounts.example.com/auth?state=${p.state}&redirect_uri=${encodeURIComponent(p.redirectUri)}`;
  }
  exchangeCode(code: string) {
    if (code !== 'good-code') return Promise.reject(new Error('bad code'));
    return Promise.resolve({ accessToken: 'at-1', refreshToken: 'rt-secret', expiresIn: 3600 });
  }
  refreshAccessToken() {
    return Promise.resolve({ accessToken: 'at-2', refreshToken: null, expiresIn: 3600 });
  }
  revoke(token: string) {
    this.revoked.push(token);
    return Promise.resolve();
  }
  private touch(e: GoogleEvent, updated?: string) {
    e.updated = updated ?? new Date().toISOString();
    e.etag = `"${++this.seq}"`;
    this.events.set(e.id, e);
    this.log.push({ seq: this.seq, id: e.id });
  }
  /** Simulates an edit made in Google Calendar. */
  remoteUpsert(e: GoogleEvent, updated?: string) {
    this.touch({ status: 'confirmed', ...e }, updated);
  }
  listEvents(_t: string, _c: string, p: { syncToken?: string | null }) {
    if (p.syncToken && this.expireNextSyncToken) {
      this.expireNextSyncToken = false;
      return Promise.reject(new GoogleSyncTokenExpired('gone'));
    }
    const since = p.syncToken ? Number(p.syncToken) : 0;
    const ids = new Set(this.log.filter((l) => l.seq > since).map((l) => l.id));
    const items = [...this.events.values()].filter((e) => !p.syncToken || ids.has(e.id));
    return Promise.resolve({ items: structuredClone(items), nextSyncToken: String(this.seq) });
  }
  insertEvent(_t: string, _c: string, body: GoogleEventInput) {
    const e = { id: `g${this.nextId++}`, ...structuredClone(body) } as GoogleEvent;
    this.touch(e);
    return Promise.resolve(structuredClone(e));
  }
  updateEvent(_t: string, _c: string, id: string, body: GoogleEventInput) {
    const e = { ...this.events.get(id), id, ...structuredClone(body) } as GoogleEvent;
    this.touch(e);
    return Promise.resolve(structuredClone(e));
  }
  deleteEvent(_t: string, _c: string, id: string) {
    const e = this.events.get(id);
    if (e) this.touch({ ...e, status: 'cancelled' });
    return Promise.resolve();
  }
  instanceCalls = 0;
  updateInstance(
    _t: string,
    _c: string,
    recurringEventId: string,
    originalStart: GoogleEventTime,
    body: GoogleEventInput,
  ) {
    this.instanceCalls++;
    const at = new Date(originalStart.dateTime ?? `${originalStart.date ?? ''}T00:00:00Z`);
    const id = `${recurringEventId}_${at.toISOString().replace(/[-:]|\.\d{3}/g, '')}`;
    const { recurrence: _r, ...rest } = structuredClone(body);
    const e = { ...rest, id, recurringEventId, originalStartTime: originalStart } as GoogleEvent;
    this.touch(e);
    return Promise.resolve(structuredClone(e));
  }
}

// ---------------------------------------------------------------- setup

let stack: Stack;
let anna: TestClient;
let ben: TestClient;
let tina: TestClient;
let kiki: TestClient;
let mallory: TestClient;
let hh: string;
let malloryHh: string;
let annaMember: string;
let benMember: string;
let miaMember: string;
let familyCalendar: string;
let shoppingList: string;
let giro: string;
let groceries: string;
const llm = new FakeLlm();
const google = new FakeGoogle();

const base = () => `/v1/households/${hh}`;
const ab = () => `${base()}/assistant`;
const cs = () => `${base()}/calendar-sync`;

async function join(client: TestClient, role: string, name: string): Promise<string> {
  const inv = await anna.post(`${base()}/invitations`, { role });
  const res = await client.post(`/v1/invitations/${inv.body.token}/accept`, { displayName: name });
  expect(res.status).toBe(201);
  return res.body.me.id;
}

async function countNotifications(type: string): Promise<number> {
  const [row] = await stack.app
    .get(Db)
    .system.select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.householdId, hh), eq(notifications.type, type)));
  return row?.n ?? 0;
}

beforeAll(async () => {
  stack = await startStack();
  anna = await new TestClient(stack.app).signUp('anna@example.com', 'Anna');
  ben = await new TestClient(stack.app).signUp('ben@example.com', 'Ben');
  tina = await new TestClient(stack.app).signUp('tina@example.com', 'Tina');
  kiki = await new TestClient(stack.app).signUp('kiki@example.com', 'Kiki');
  mallory = await new TestClient(stack.app).signUp('mallory@example.com', 'Mallory');
  const created = await anna.post('/v1/households', { name: 'Familie Frey', displayName: 'Anna' });
  hh = created.body.household.id;
  annaMember = created.body.me.id;
  benMember = await join(ben, 'adult', 'Ben');
  await join(tina, 'teen', 'Tina');
  await join(kiki, 'child', 'Kiki');
  miaMember = (await anna.post(`${base()}/members`, { displayName: 'Mia', role: 'child' })).body.id;
  malloryHh = (await mallory.post('/v1/households', { name: 'Mallory', displayName: 'M' })).body
    .household.id;
  familyCalendar = (await anna.get(`${base()}/calendars`)).body[0].id;
  shoppingList = (await anna.get(`${base()}/lists`)).body.find(
    (l: { kind: string }) => l.kind === 'shopping',
  ).id;
  giro = (
    await anna.post(`${base()}/finance/accounts`, {
      name: 'Girokonto',
      type: 'checking',
      openingBalanceMinor: 0,
    })
  ).body.id;
  groceries = (await anna.get(`${base()}/finance/categories`)).body.find(
    (c: { key: string | null }) => c.key === 'groceries',
  ).id;
});

afterAll(async () => {
  await stack.close();
});

// ---------------------------------------------------------------- assistant

describe('assistant: plan, consent and availability', () => {
  it('requires the pro plan', async () => {
    const s = await anna.get(`${ab()}/settings`);
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ enabled: false, available: false, usedToday: 0 });
    expect((await anna.post(`${ab()}/enable`, { consent: true })).status).toBe(402);
    expect((await anna.post(`${ab()}/capture`, { text: 'Milch kaufen' })).status).toBe(402);
  });

  it('requires opt-in by an owner/admin before anything is sent', async () => {
    await stack.app
      .get(BillingService)
      .applyPlan(hh, { plan: 'pro', status: 'active', provider: 'comp' });
    const res = await anna.post(`${ab()}/capture`, { text: 'Milch kaufen' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('assistant_disabled');
    expect((await ben.post(`${ab()}/enable`, { consent: true })).status).toBe(403);
    expect((await anna.post(`${ab()}/enable`, {})).status).toBe(422);
    expect((await kiki.get(`${ab()}/settings`)).status).toBe(403);
  });

  it('answers 503 without a configured model', async () => {
    const enabled = await anna.post(`${ab()}/enable`, { consent: true });
    expect(enabled.status).toBe(201);
    expect(enabled.body).toMatchObject({
      enabled: true,
      available: false,
      consentedByMemberId: annaMember,
    });
    expect(enabled.body.consentedAt).toBeTruthy();
    const res = await anna.post(`${ab()}/capture`, { text: 'Milch kaufen' });
    expect(res.status).toBe(503);
    stack.app.get(AssistantLlm).use(llm);
    expect((await anna.get(`${ab()}/settings`)).body.available).toBe(true);
  });

  it('can be disabled again', async () => {
    const off = await anna.post(`${ab()}/disable`);
    expect(off.body.enabled).toBe(false);
    expect((await anna.post(`${ab()}/capture`, { text: 'Milch' })).status).toBe(403);
    await anna.post(`${ab()}/enable`, { consent: true });
  });
});

describe('assistant: capture → proposal → apply', () => {
  let proposalId: string;

  it('turns tool calls into validated actions with member ids', async () => {
    llm.toolResponses.push({
      text: 'Ich habe einen Termin, eine Aufgabe und zwei Einträge vorgeschlagen.',
      toolCalls: [
        {
          name: 'create_event',
          input: { title: 'Zahnarzt', date: '2026-11-03', startTime: '15:00', attendees: ['Mia'] },
        },
        {
          name: 'create_task',
          input: {
            title: 'Blumen gießen',
            repeat: { kind: 'interval', every: 3, unit: 'day' },
            rotation: ['Anna', 'Ben'],
          },
        },
        {
          name: 'add_list_items',
          input: { items: [{ text: 'Milch' }, { text: 'Eier', quantity: '10' }] },
        },
        { name: 'create_task', input: { title: 'Rasen mähen', assignee: 'Zoe' } },
        { name: 'delete_everything', input: {} },
        { name: 'create_event', input: { title: '' } },
      ],
    });
    const res = await anna.post(`${ab()}/capture`, {
      text: 'Zahnarzt mit Mia nächsten Dienstag 15 Uhr, Milch und Eier, alle 3 Tage Blumen gießen abwechselnd Anna und Ben',
    });
    expect(res.status).toBe(201);
    proposalId = res.body.id;
    expect(res.body.status).toBe('pending');
    expect(res.body.message).toContain('vorgeschlagen');
    expect(res.body.actions).toEqual([
      {
        type: 'create_event',
        calendarId: familyCalendar,
        title: 'Zahnarzt',
        description: null,
        location: null,
        start: '2026-11-03T14:00:00.000Z',
        end: '2026-11-03T15:00:00.000Z',
        allDay: false,
        timezone: 'Europe/Berlin',
        rrule: null,
        attendeeMemberIds: [miaMember],
        reminders: [],
      },
      expect.objectContaining({
        type: 'create_task',
        title: 'Blumen gießen',
        recurrence: { mode: 'floating', interval: 3, unit: 'day' },
        rotationMemberIds: [annaMember, benMember],
        assigneeMemberId: annaMember,
      }),
      {
        type: 'add_list_items',
        listId: shoppingList,
        items: [
          { text: 'Milch', quantity: null },
          { text: 'Eier', quantity: '10' },
        ],
      },
    ]);
    expect(res.body.issues.map((i: { index: number; code: string }) => [i.index, i.code])).toEqual([
      [3, 'unknown_member'],
      [4, 'unknown_tool'],
      [5, 'invalid_input'],
    ]);

    // What the model saw: static cached system prompt, tools and the household context.
    const req = llm.toolRequests.at(-1) as LlmToolRequest;
    expect(req.tools.map((t) => t.name)).toEqual([
      'create_event',
      'create_task',
      'add_list_items',
      'create_transaction',
    ]);
    const context = req.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    expect(context).toContain('Mia');
    expect(context).toContain('Anna (the user)');
    expect(context).toMatch(/Date table:\nNow: \d{4}-\d{2}-\d{2}/);
    expect(req.system).not.toContain('Mia');
  });

  it('is never applied automatically', async () => {
    const tasks = await anna.get(`${base()}/tasks`);
    expect(tasks.body.some((t: { title: string }) => t.title === 'Blumen gießen')).toBe(false);
  });

  it('keeps proposals private to their author', async () => {
    expect((await ben.get(`${ab()}/proposals/${proposalId}`)).status).toBe(404);
    expect((await ben.post(`${ab()}/proposals/${proposalId}/apply`, {})).status).toBe(404);
  });

  it('applies through the module services', async () => {
    const res = await anna.post(`${ab()}/proposals/${proposalId}/apply`, {});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('applied');
    expect(res.body.results.map((r: { type: string }) => r.type)).toEqual([
      'create_event',
      'create_task',
      'add_list_items',
    ]);
    const eventId = res.body.results[0].id;
    const event = await anna.get(`${base()}/events/${eventId}`);
    expect(event.body).toMatchObject({ title: 'Zahnarzt', attendeeMemberIds: [miaMember] });
    const task = await anna.get(`${base()}/tasks/${res.body.results[1].id}`);
    expect(task.body).toMatchObject({
      title: 'Blumen gießen',
      rotationMemberIds: [annaMember, benMember],
      assigneeMemberId: annaMember,
      recurrence: { mode: 'floating', interval: 3, unit: 'day' },
    });
    const list = await anna.get(`${base()}/lists/${shoppingList}`);
    expect(
      list.body.items.map((i: { text: string; category: string }) => [i.text, i.category]),
    ).toEqual(
      expect.arrayContaining([
        ['Milch', 'dairy'],
        ['Eier', expect.any(String)],
      ]),
    );
    expect((await anna.post(`${ab()}/proposals/${proposalId}/apply`, {})).status).toBe(409);
  });

  it('applies subsets and discards', async () => {
    llm.toolResponses.push({
      text: '',
      toolCalls: [
        { name: 'add_list_items', input: { list: 'Einkaufsliste', items: [{ text: 'Brot' }] } },
        { name: 'create_task', input: { title: 'Steuer machen', assignee: 'ich' } },
      ],
    });
    const p = (await anna.post(`${ab()}/capture`, { text: 'Brot kaufen und Steuer machen' })).body;
    const partial = await anna.post(`${ab()}/proposals/${p.id}/apply`, { actionIndexes: [1] });
    expect(partial.body).toMatchObject({
      status: 'pending',
      results: [{ index: 1, type: 'create_task' }],
    });
    const bad = await anna.post(`${ab()}/proposals/${p.id}/apply`, { actionIndexes: [7] });
    expect(bad.status).toBe(400);
    const discarded = await anna.post(`${ab()}/proposals/${p.id}/discard`);
    expect(discarded.body.status).toBe('discarded');
    expect((await anna.post(`${ab()}/proposals/${p.id}/apply`, {})).status).toBe(409);
    expect((await anna.post(`${ab()}/proposals/${p.id}/discard`)).status).toBe(409);
    expect((await anna.get(`${ab()}/proposals/${p.id}`)).body.status).toBe('discarded');
  });

  it('records transactions with account and category inference', async () => {
    llm.toolResponses.push({
      text: '',
      toolCalls: [
        {
          name: 'create_transaction',
          input: { amount: '12,49', direction: 'expense', merchant: 'Rewe', category: 'groceries' },
        },
      ],
    });
    const p = (await anna.post(`${ab()}/capture`, { text: '12,49 bei Rewe bezahlt' })).body;
    expect(p.actions[0]).toMatchObject({
      accountId: giro,
      amountMinor: -1249,
      categoryId: groceries,
      currency: 'EUR',
    });
    const applied = await anna.post(`${ab()}/proposals/${p.id}/apply`, {});
    expect(applied.body.status).toBe('applied');
    const txs = await anna.get(`${base()}/finance/transactions`);
    const items = (txs.body.items ?? txs.body) as { id: string; amountMinor: number }[];
    expect(items.find((t) => t.id === applied.body.results[0].id)?.amountMinor).toBe(-1249);
  });

  it('handles refusals and unclear notes', async () => {
    llm.toolResponses.push(new LlmRefusalError(usage));
    const refused = await anna.post(`${ab()}/capture`, { text: 'something odd' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('assistant_refused');
    const unclear = await anna.post(`${ab()}/capture`, { text: 'hmm' });
    expect(unclear.body).toMatchObject({ actions: [], message: 'Was meinst du?' });
  });
});

describe('assistant: permissions and isolation', () => {
  it('forbids children and limits teens to their modules', async () => {
    expect((await kiki.post(`${ab()}/capture`, { text: 'Milch kaufen' })).status).toBe(403);
    llm.toolResponses.push({
      text: '',
      toolCalls: [
        {
          name: 'create_transaction',
          input: { amount: '5', direction: 'expense' },
        },
      ],
    });
    const res = await tina.post(`${ab()}/capture`, { text: '5 Euro Kino' });
    expect(res.status).toBe(201);
    expect(llm.toolRequests.at(-1)?.tools.map((t) => t.name)).not.toContain('create_transaction');
    expect(res.body.issues[0].code).toBe('unknown_tool');
    expect((await tina.post(`${ab()}/receipts`, { fileId: giro })).status).toBe(403);
  });

  it('isolates households', async () => {
    const own = (await anna.get(`${ab()}/settings`)).body;
    expect(own.usedToday).toBeGreaterThan(0);
    expect((await mallory.get(`${ab()}/settings`)).status).toBe(404);
    const [p] = await stack.app.get(Db).system.select().from(assistantProposals).limit(1);
    expect(
      (await mallory.get(`/v1/households/${malloryHh}/assistant/proposals/${p?.id}`)).status,
    ).toBe(404);
    expect(
      (await mallory.get(`/v1/households/${malloryHh}/assistant/settings`)).body,
    ).toMatchObject({
      enabled: false,
      usedToday: 0,
    });
  });
});

describe('assistant: receipts, insights, meals', () => {
  it('extracts a receipt image into a transaction proposal', async () => {
    const owner = createDb(stack.ownerUrl, { max: 1 });
    const mk = async (status: 'ready' | 'scanning') => {
      const [f] = await owner.db
        .insert(files)
        .values({
          householdId: hh,
          name: 'bon.png',
          sizeBytes: 1000,
          mimeType: 'image/png',
          storageKey: `${hh}/${crypto.randomUUID()}`,
          status,
          ownerMemberId: annaMember,
        })
        .returning({ id: files.id });
      return (f as { id: string }).id;
    };
    const ready = await mk('ready');
    const scanning = await mk('scanning');
    await owner.close();
    const spy = vi
      .spyOn(stack.app.get(ObjectStorage), 'getBuffer')
      .mockResolvedValue(Buffer.from('fake-png'));
    llm.structuredResponses.push({
      merchant: 'REWE Markt',
      date: '2026-10-23',
      total: '23,47',
      currency: 'EUR',
      lineItems: [
        { description: 'Milch', quantity: 2, amount: '2,58' },
        { description: '???', quantity: null, amount: 'x' },
      ],
      categoryKey: 'groceries',
    });
    const res = await anna.post(`${ab()}/receipts`, { fileId: ready });
    expect(res.status).toBe(201);
    expect(res.body.receipt).toMatchObject({
      merchant: 'REWE Markt',
      date: '2026-10-23',
      totalMinor: 2347,
      suggestedCategoryKey: 'groceries',
      lineItems: [{ description: 'Milch', quantity: 2, amountMinor: 258 }],
    });
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.proposal).toMatchObject({
      kind: 'receipt',
      actions: [
        {
          type: 'create_transaction',
          accountId: giro,
          amountMinor: -2347,
          categoryId: groceries,
          bookingDate: '2026-10-23',
        },
      ],
    });
    const sent = llm.structuredRequests.at(-1)?.content[0];
    expect(sent).toEqual({
      type: 'image',
      mediaType: 'image/png',
      data: Buffer.from('fake-png').toString('base64'),
    });
    expect((await anna.post(`${ab()}/receipts`, { fileId: scanning })).status).toBe(409);
    expect((await anna.post(`${ab()}/receipts`, { fileId: crypto.randomUUID() })).status).toBe(404);
    spy.mockRestore();
  });

  it('summarises spending from aggregates only', async () => {
    llm.structuredResponses.push({
      text: 'Ihr habt diesen Monat vor allem für Lebensmittel ausgegeben.',
      tips: ['Wochenplan', 'Angebote', 'Vorrat', 'zu viel'],
    });
    const res = await anna.post(`${ab()}/insights`, { months: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ currency: 'EUR', totalExpenseMinor: 1249 });
    expect(res.body.months).toHaveLength(2);
    expect(res.body.tips).toHaveLength(3);
    expect(res.body.highlights[0]).toMatchObject({ kind: 'top_category', amountMinor: 1249 });
    const sent = JSON.stringify(llm.structuredRequests.at(-1)?.content);
    expect(sent).not.toContain('Rewe'); // no payees or raw transactions leave the server
    expect(sent).not.toContain(giro);
  });

  it('suggests meals with pantry matching', async () => {
    const idea = (title: string) => ({
      title,
      description: 'Lecker',
      prepMinutes: 20,
      ingredients: [
        { name: 'Spaghetti', quantity: '400 g' },
        { name: 'Speck', quantity: null },
      ],
      steps: ['Kochen'],
    });
    llm.structuredResponses.push({ ideas: [idea('A'), idea('B'), idea('C'), idea('D')] });
    const res = await anna.post(`${ab()}/meals`, { ingredients: ['Spaghetti', 'Eier', 'eier'] });
    expect(res.status).toBe(201);
    expect(res.body.ideas).toHaveLength(3);
    expect(res.body.ideas[0].missing).toEqual(['Speck']);
    expect(res.body.ideas[0].ingredients[0].inPantry).toBe(true);
    const sent = llm.structuredRequests.at(-1)?.content[0];
    expect(sent?.type === 'text' && sent.text).toContain('- Eier');
  });
});

describe('assistant: quota, audit log and retention', () => {
  it('logs metadata of every call without contents', async () => {
    const rows = await stack.app
      .get(Db)
      .system.select()
      .from(assistantRequests)
      .where(eq(assistantRequests.householdId, hh));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.map((r) => r.status)).toContain('refused');
    expect(rows.find((r) => r.kind === 'receipt')).toMatchObject({
      model: 'fake-model',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 80,
    });
    expect(Object.keys(rows[0] as object)).not.toContain('prompt');
  });

  it('enforces the daily limit per household', async () => {
    const service = stack.app.get(AssistantService);
    const used = (await anna.get(`${ab()}/settings`)).body.usedToday as number;
    service.dailyLimit = used;
    const res = await anna.post(`${ab()}/meals`, { ingredients: ['Reis'] });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('assistant_quota');
    service.dailyLimit = 100;
  });

  it('deletes prompt contents after 30 days', async () => {
    const db = stack.app.get(Db);
    const [old] = await db.system
      .update(assistantProposals)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(assistantProposals.householdId, hh))
      .returning({ id: assistantProposals.id });
    const before = await db.system.select().from(assistantProposals);
    const result = await stack.app.get(AssistantService).purgeExpired();
    expect(result.proposals).toBe(before.length);
    expect(old).toBeDefined();
    expect(await db.system.select().from(assistantProposals)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- ICS subscriptions

describe('calendar sync: ICS subscriptions', () => {
  let server: Server;
  let feedUrl: string;
  let feed = '';
  let etag = '"1"';
  let failing = false;
  let requests: { inm: string | undefined }[] = [];
  let subscriptionId: string;
  let subCalendar: string;

  const vevents = (extra: string[] = []) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Schule//DE',
      'BEGIN:VEVENT',
      'UID:schwimmen@schule',
      'DTSTART;TZID=Europe/Berlin:20261104T150000',
      'DTEND;TZID=Europe/Berlin:20261104T160000',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'EXDATE;TZID=Europe/Berlin:20261111T150000',
      'SUMMARY:Schwimmen',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:schwimmen@schule',
      'RECURRENCE-ID;TZID=Europe/Berlin:20261118T150000',
      'DTSTART;TZID=Europe/Berlin:20261118T170000',
      'DTEND;TZID=Europe/Berlin:20261118T180000',
      'SUMMARY:Schwimmen (Hallenbad Nord)',
      'END:VEVENT',
      ...extra,
      'END:VCALENDAR',
    ].join('\r\n');

  const occurrences = async () =>
    (
      await anna.get(
        `${base()}/occurrences?from=2026-10-01T00:00:00Z&to=2026-12-31T00:00:00Z&calendarIds=${subCalendar}`,
      )
    ).body as { title: string; start: string; modified: boolean }[];

  beforeAll(async () => {
    feed = vevents([
      'BEGIN:VEVENT',
      'UID:ferien@schule',
      'DTSTART;VALUE=DATE:20261102',
      'DTEND;VALUE=DATE:20261107',
      'SUMMARY:Herbstferien',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:elternabend@schule',
      'DTSTART:20261110T180000Z',
      'DTEND:20261110T193000Z',
      'SUMMARY:Elternabend',
      'END:VEVENT',
    ]);
    server = createServer((req, res) => {
      requests.push({ inm: req.headers['if-none-match'] as string | undefined });
      if (failing) {
        res.writeHead(500).end();
        return;
      }
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/calendar', etag }).end(feed);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/schule.ics`;
  });

  afterAll(
    () =>
      new Promise<void>((r) =>
        server.close(() => {
          r();
        }),
      ),
  );

  it('refuses private and plain-http URLs by default (SSRF)', async () => {
    const res = await anna.post(`${cs()}/subscriptions`, { name: 'Schule', url: feedUrl });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_feed_url');
    const local = await anna.post(`${cs()}/subscriptions`, {
      name: 'Schule',
      url: 'https://127.0.0.1/x.ics',
    });
    expect(local.body.detail).toMatch(/not allowed/);
    expect(requests).toHaveLength(0);
  });

  it('imports a feed into a read-only calendar', async () => {
    stack.app.get(FeedFetcher).policy = { allowHttp: true, allowPrivateNetworks: true };
    expect((await kiki.post(`${cs()}/subscriptions`, { name: 'x', url: feedUrl })).status).toBe(
      403,
    );
    const res = await anna.post(`${cs()}/subscriptions`, { name: 'Schule', url: feedUrl });
    expect(res.status).toBe(201);
    subscriptionId = res.body.subscription.id;
    subCalendar = res.body.subscription.calendarId;
    expect(res.body.subscription).toMatchObject({
      status: 'ok',
      eventCount: 3,
      urlHost: expect.stringContaining('127.0.0.1'),
    });
    expect(JSON.stringify(res.body)).not.toContain('schule.ics');
    expect(res.body.stats).toEqual({ created: 3, updated: 0, deleted: 0, unchanged: 0 });
    const occ = await occurrences();
    const swim = occ.filter((o) => o.title.startsWith('Schwimmen'));
    // 4 weekly occurrences, one EXDATE, one moved by RECURRENCE-ID.
    expect(swim.map((o) => [o.start, o.title])).toEqual([
      ['2026-11-04T14:00:00.000Z', 'Schwimmen'],
      ['2026-11-18T16:00:00.000Z', 'Schwimmen (Hallenbad Nord)'],
      ['2026-11-25T14:00:00.000Z', 'Schwimmen'],
    ]);
    expect(occ.find((o) => o.title === 'Herbstferien')).toMatchObject({
      start: '2026-11-02T00:00:00.000Z',
    });
    expect((await kiki.get(`${cs()}/subscriptions`)).body).toHaveLength(1);
    // The assistant never proposes events in read-only calendars.
    llm.toolResponses.push({
      text: '',
      toolCalls: [
        { name: 'create_event', input: { title: 'x', date: '2026-11-03', calendar: 'Schule' } },
      ],
    });
    const p = await anna.post(`${ab()}/capture`, { text: 'x im Schulkalender' });
    expect(p.body.issues[0].code).toBe('unknown_calendar');
  });

  it('updates changed events and removes deleted ones on refresh', async () => {
    const same = await anna.post(`${cs()}/subscriptions/${subscriptionId}/refresh`);
    expect(same.body.stats).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 3 });
    feed = vevents([
      'BEGIN:VEVENT',
      'UID:elternabend@schule',
      'DTSTART:20261110T170000Z',
      'DTEND:20261110T183000Z',
      'SUMMARY:Elternabend (verschoben)',
      'END:VEVENT',
    ]);
    etag = '"2"';
    const res = await anna.post(`${cs()}/subscriptions/${subscriptionId}/refresh`);
    expect(res.body.stats).toEqual({ created: 0, updated: 1, deleted: 1, unchanged: 1 });
    const occ = await occurrences();
    expect(occ.find((o) => o.title.startsWith('Elternabend'))).toMatchObject({
      title: 'Elternabend (verschoben)',
      start: '2026-11-10T17:00:00.000Z',
    });
    expect(occ.some((o) => o.title === 'Herbstferien')).toBe(false);
  });

  it('uses conditional requests in the scheduled refresh', async () => {
    const db = stack.app.get(Db);
    await db.system
      .update(calendarSubscriptions)
      .set({ nextFetchAt: new Date(Date.now() - 1000) })
      .where(eq(calendarSubscriptions.id, subscriptionId));
    requests = [];
    expect(await stack.app.get(SubscriptionsService).refreshDue()).toBe(1);
    expect(requests).toEqual([{ inm: '"2"' }]);
    const [row] = await db.system
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, subscriptionId));
    expect(row?.status).toBe('ok');
    expect(row?.nextFetchAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('notifies once after repeated failures', async () => {
    const db = stack.app.get(Db);
    failing = true;
    for (let i = 0; i < 4; i++) {
      await db.system
        .update(calendarSubscriptions)
        .set({ nextFetchAt: new Date(Date.now() - 1000) })
        .where(eq(calendarSubscriptions.id, subscriptionId));
      await stack.app.get(SubscriptionsService).refreshDue();
    }
    const list = await anna.get(`${cs()}/subscriptions`);
    expect(list.body[0]).toMatchObject({ status: 'error', failureCount: 4 });
    expect(list.body[0].lastError).toContain('500');
    expect(await countNotifications('calendar.sync_failed')).toBe(1);
    failing = false;
    const ok = await anna.post(`${cs()}/subscriptions/${subscriptionId}/refresh`);
    expect(ok.body.subscription).toMatchObject({ status: 'ok', failureCount: 0 });
  });

  it('isolates households and deletes with the calendar', async () => {
    expect(
      (await mallory.get(`/v1/households/${malloryHh}/calendar-sync/subscriptions`)).body,
    ).toEqual([]);
    expect(
      (
        await mallory.delete(
          `/v1/households/${malloryHh}/calendar-sync/subscriptions/${subscriptionId}`,
        )
      ).status,
    ).toBe(404);
    expect((await ben.delete(`${cs()}/subscriptions/${subscriptionId}`)).status).toBe(403);
    expect((await anna.delete(`${cs()}/subscriptions/${subscriptionId}`)).status).toBe(200);
    const cals = (await anna.get(`${base()}/calendars`)).body as { id: string }[];
    expect(cals.some((c) => c.id === subCalendar)).toBe(false);
  });
});

// ---------------------------------------------------------------- Google Calendar

describe('calendar sync: Google two-way sync', () => {
  let connectionId: string;
  let localEventId: string;

  const findRemote = (title: string) =>
    [...google.events.values()].find((e) => e.summary === title && e.status !== 'cancelled');
  const sync = async () => {
    const res = await anna.post(`${cs()}/google/${connectionId}/sync`);
    expect(res.status).toBe(201);
    return res.body as {
      pulled: Record<string, number>;
      pushed: Record<string, number>;
      connection: { status: string };
    };
  };
  const localEvents = async () =>
    (
      await anna.get(
        `${base()}/occurrences?from=2026-10-01T00:00:00Z&to=2027-01-31T00:00:00Z&calendarIds=${familyCalendar}`,
      )
    ).body as { eventId: string; title: string; start: string }[];

  it('is unavailable without OAuth configuration', async () => {
    const res = await anna.post(`${cs()}/google/connect`, { calendarId: familyCalendar });
    expect(res.status).toBe(503);
    stack.app.get(GoogleSyncService).useApi(google);
  });

  it('connects via OAuth and runs the first two-way sync', async () => {
    localEventId = (
      await anna.post(`${base()}/events`, {
        calendarId: familyCalendar,
        title: 'Elternabend',
        start: '2026-11-12T18:00:00+01:00',
        end: '2026-11-12T19:30:00+01:00',
      })
    ).body.id;
    google.remoteUpsert({
      id: 'remote-1',
      summary: 'Fußball',
      start: { dateTime: '2026-11-06T16:00:00+01:00', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-11-06T17:30:00+01:00', timeZone: 'Europe/Berlin' },
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE;TZID=Europe/Berlin:20261113T160000'],
    });
    expect((await kiki.post(`${cs()}/google/connect`, { calendarId: familyCalendar })).status).toBe(
      403,
    );
    const start = await anna.post(`${cs()}/google/connect`, { calendarId: familyCalendar });
    expect(start.status).toBe(201);
    expect(start.body.authUrl).toContain(start.body.state);
    expect(start.body.authUrl).toContain(encodeURIComponent('http://localhost:3000/'));
    expect(
      (await anna.post(`${cs()}/google/callback`, { code: 'good-code', state: 'x'.repeat(32) }))
        .status,
    ).toBe(400);
    expect(
      (await ben.post(`${cs()}/google/callback`, { code: 'good-code', state: start.body.state }))
        .status,
    ).toBe(400); // state is bound to the member who started the flow (and consumed now)
    const again = await anna.post(`${cs()}/google/connect`, { calendarId: familyCalendar });
    const res = await anna.post(`${cs()}/google/callback`, {
      code: 'good-code',
      state: again.body.state,
    });
    expect(res.status).toBe(201);
    connectionId = res.body.connection.id;
    expect(res.body.connection).toMatchObject({ status: 'active', googleCalendarId: 'primary' });
    expect(res.body.pulled.created).toBe(1);
    expect(res.body.pushed.created).toBeGreaterThanOrEqual(2); // Elternabend + Zahnarzt from the assistant
    expect(findRemote('Elternabend')).toMatchObject({
      start: { dateTime: '2026-11-12T17:00:00.000Z', timeZone: 'Europe/Berlin' },
    });
    const football = (await localEvents()).filter((o) => o.title === 'Fußball');
    expect(football.map((o) => o.start)).toEqual([
      '2026-11-06T15:00:00.000Z',
      '2026-11-20T15:00:00.000Z',
      '2026-11-27T15:00:00.000Z',
    ]);
    // Second connect for the same calendar is rejected.
    expect((await anna.post(`${cs()}/google/connect`, { calendarId: familyCalendar })).status).toBe(
      409,
    );
  });

  it('stores the refresh token encrypted', async () => {
    const [row] = await stack.app
      .get(Db)
      .system.select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.id, connectionId));
    expect(row?.refreshTokenEnc.startsWith('v1:')).toBe(true);
    expect(row?.refreshTokenEnc).not.toContain('rt-secret');
  });

  it('is idempotent when nothing changed', async () => {
    const r = await sync();
    expect(r.pulled).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    expect(r.pushed).toMatchObject({ created: 0, updated: 0, deleted: 0 });
  });

  it('pushes local changes and pulls remote changes', async () => {
    await anna.patch(`${base()}/events/${localEventId}`, { title: 'Elternabend Klasse 3b' });
    expect((await sync()).pushed.updated).toBe(1);
    expect(findRemote('Elternabend Klasse 3b')).toBeDefined();

    const remote = google.events.get('remote-1') as GoogleEvent;
    google.remoteUpsert({ ...remote, summary: 'Fußballtraining' });
    expect((await sync()).pulled.updated).toBe(1);
    expect((await localEvents()).some((o) => o.title === 'Fußballtraining')).toBe(true);
  });

  it('resolves conflicts last-writer-wins', async () => {
    // Local edit first, then a newer remote edit → Google wins.
    await anna.patch(`${base()}/events/${localEventId}`, { title: 'Lokal alt' });
    const linked = findRemote('Elternabend Klasse 3b') as GoogleEvent;
    google.remoteUpsert(
      { ...linked, summary: 'Remote neu' },
      new Date(Date.now() + 60_000).toISOString(),
    );
    await sync();
    expect((await anna.get(`${base()}/events/${localEventId}`)).body.title).toBe('Remote neu');

    // Remote edit first, then a newer local edit → local wins.
    google.remoteUpsert(
      { ...(findRemote('Remote neu') as GoogleEvent), summary: 'Remote alt' },
      new Date(Date.now() + 61_000).toISOString(),
    );
    await new Promise((r) => setTimeout(r, 5));
    const owner = createDb(stack.ownerUrl, { max: 1 });
    await owner.db.execute(
      sql`update events set title = 'Lokal neu', updated_at = now() + interval '5 minutes' where id = ${localEventId}`,
    );
    await owner.close();
    await sync();
    expect((await anna.get(`${base()}/events/${localEventId}`)).body.title).toBe('Lokal neu');
    expect(findRemote('Lokal neu')).toBeDefined();
  });

  it('pushes moved occurrences as Google instance exceptions', async () => {
    const series = await anna.post(`${base()}/events`, {
      calendarId: familyCalendar,
      title: 'Klavier',
      start: '2026-12-01T16:00:00+01:00',
      end: '2026-12-01T17:00:00+01:00',
      rrule: 'FREQ=WEEKLY;COUNT=3',
    });
    expect((await sync()).pushed.created).toBe(1);
    const master = findRemote('Klavier') as GoogleEvent;
    const moved = await anna.patch(`${base()}/events/${series.body.id}`, {
      scope: 'this',
      occurrenceStart: '2026-12-08T15:00:00.000Z',
      title: 'Klavier (Vorspiel)',
      start: '2026-12-08T17:00:00.000Z',
      end: '2026-12-08T18:30:00.000Z',
    });
    expect(moved.status).toBe(200);
    const calls = google.instanceCalls;
    expect((await sync()).pushed.updated).toBe(1);
    expect(google.instanceCalls).toBe(calls + 1);
    const instance = [...google.events.values()].find((e) => e.recurringEventId === master.id);
    expect(instance).toMatchObject({
      id: `${master.id}_20261208T150000Z`,
      summary: 'Klavier (Vorspiel)',
      originalStartTime: { dateTime: '2026-12-08T15:00:00.000Z', timeZone: 'Europe/Berlin' },
      start: { dateTime: '2026-12-08T17:00:00.000Z' },
      end: { dateTime: '2026-12-08T18:30:00.000Z' },
    });
    // The echo of our own instance change is recognised; nothing is pushed or pulled again.
    const again = await sync();
    expect(again.pulled).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    expect(again.pushed).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    expect(google.instanceCalls).toBe(calls + 1);
    const occ = (await localEvents()).filter((o) => o.eventId === series.body.id);
    expect(occ.map((o) => [o.start, o.title])).toEqual([
      ['2026-12-01T15:00:00.000Z', 'Klavier'],
      ['2026-12-08T17:00:00.000Z', 'Klavier (Vorspiel)'],
      ['2026-12-15T15:00:00.000Z', 'Klavier'],
    ]);
  });

  it('syncs cancelled occurrences and deletions both ways', async () => {
    google.remoteUpsert({
      id: 'remote-1-20261120',
      recurringEventId: 'remote-1',
      status: 'cancelled',
      originalStartTime: { dateTime: '2026-11-20T16:00:00+01:00', timeZone: 'Europe/Berlin' },
    });
    await sync();
    const football = (await localEvents()).filter((o) => o.title === 'Fußballtraining');
    expect(football.map((o) => o.start)).toEqual([
      '2026-11-06T15:00:00.000Z',
      '2026-11-27T15:00:00.000Z',
    ]);

    expect((await anna.delete(`${base()}/events/${localEventId}`)).status).toBe(200);
    expect((await sync()).pushed.deleted).toBe(1);
    expect(findRemote('Lokal neu')).toBeUndefined();

    const remote = google.events.get('remote-1') as GoogleEvent;
    google.remoteUpsert({ ...remote, status: 'cancelled' });
    expect((await sync()).pulled.deleted).toBe(1);
    expect((await localEvents()).some((o) => o.title === 'Fußballtraining')).toBe(false);
  });

  it('recovers from an expired sync token without duplicates', async () => {
    google.expireNextSyncToken = true;
    const before = (await localEvents()).length;
    const r = await sync();
    expect(r.connection.status).toBe('active');
    expect(r.pulled.created).toBe(0);
    expect((await localEvents()).length).toBe(before);
  });

  it('isolates households and disconnects', async () => {
    expect((await mallory.get(`/v1/households/${malloryHh}/calendar-sync/google`)).body).toEqual(
      [],
    );
    expect(
      (await mallory.post(`/v1/households/${malloryHh}/calendar-sync/google/${connectionId}/sync`))
        .status,
    ).toBe(404);
    expect((await anna.get(`${cs()}/google`)).body).toHaveLength(1);
    expect((await anna.delete(`${cs()}/google/${connectionId}`)).status).toBe(200);
    expect(google.revoked).toEqual(['rt-secret']);
    expect((await anna.get(`${cs()}/google`)).body).toEqual([]);
  });
});
