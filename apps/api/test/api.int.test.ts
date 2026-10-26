import { calendarSubscriptions, createDb } from '@fp/db';
import { sql } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxRelay } from '../src/modules/events/outbox-relay.js';
import { type Stack, startStack, TestClient } from './harness.js';

let stack: Stack;
let anna: TestClient;
let ben: TestClient;
let mallory: TestClient;
let hh: string;
let annaMember: string;
let benMember: string;

beforeAll(async () => {
  stack = await startStack();
  anna = await new TestClient(stack.app).signUp('anna@example.com', 'Anna');
  ben = await new TestClient(stack.app).signUp('ben@example.com', 'Ben');
  mallory = await new TestClient(stack.app).signUp('mallory@example.com', 'Mallory');
});

afterAll(async () => {
  await stack.close();
});

const base = () => `/v1/households/${hh}`;

describe('households & invitations', () => {
  it('requires a session', async () => {
    const res = await new TestClient(stack.app).get('/v1/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('creates a household with defaults', async () => {
    const res = await anna.post('/v1/households', { name: 'Familie Frey', displayName: 'Anna' });
    expect(res.status).toBe(201);
    hh = res.body.household.id;
    annaMember = res.body.me.id;
    expect(res.body.me.role).toBe('owner');
    const cals = await anna.get(`${base()}/calendars`);
    expect(cals.body).toHaveLength(1);
    const lists = await anna.get(`${base()}/lists`);
    expect(lists.body[0].kind).toBe('shopping');
  });

  it('validates input with problem details', async () => {
    const res = await anna.post('/v1/households', { name: '' });
    expect(res.status).toBe(422);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('body.name');
  });

  it('invites and accepts', async () => {
    const inv = await anna.post(`${base()}/invitations`, { role: 'adult' });
    expect(inv.status).toBe(201);
    const preview = await new TestClient(stack.app).get(`/v1/invitations/${inv.body.token}`);
    expect(preview.body).toMatchObject({
      householdName: 'Familie Frey',
      invitedBy: 'Anna',
      role: 'adult',
    });
    const joined = await ben.post(`/v1/invitations/${inv.body.token}/accept`, {
      displayName: 'Ben',
    });
    expect(joined.status).toBe(201);
    benMember = joined.body.me.id;
    expect(joined.body.members).toHaveLength(2);
    const again = await ben.post(`/v1/invitations/${inv.body.token}/accept`, {
      displayName: 'Ben',
    });
    expect(again.status).toBe(404);
  });

  it('prevents role escalation', async () => {
    const res = await ben.patch(`${base()}/members/${benMember}`, { role: 'admin' });
    expect(res.status).toBe(403);
    const ok = await ben.patch(`${base()}/members/${benMember}`, { color: '#22c55e' });
    expect(ok.status).toBe(200);
  });
});

describe('tenant isolation', () => {
  it('hides other households behind 404', async () => {
    expect((await mallory.get(base())).status).toBe(404);
    expect((await mallory.get(`${base()}/tasks`)).status).toBe(404);
  });

  it('enforces row-level security for the app role even without a WHERE clause', async () => {
    const appDb = createDb(stack.env.DATABASE_URL, { max: 1 });
    try {
      const none = await appDb.db.execute(sql`select count(*)::int as n from households`);
      expect(none.rows[0]).toEqual({ n: 0 });
      const other = await appDb.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.household_id', '00000000-0000-7000-8000-000000000000', true)`,
        );
        return tx.execute(sql`select count(*)::int as n from tasks`);
      });
      expect(other.rows[0]).toEqual({ n: 0 });
      await expect(appDb.db.execute(sql`select * from "session"`)).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/permission denied/) },
      });
    } finally {
      await appDb.close();
    }
  });
});

describe('tasks & chores', () => {
  it('rotates a floating chore after completion', async () => {
    const created = await anna.post(`${base()}/tasks`, {
      title: 'Blumen gießen',
      dueAt: '2026-11-02T18:00:00+01:00',
      recurrence: { mode: 'floating', interval: 3, unit: 'day' },
      rotationMemberIds: [annaMember, benMember],
      points: 5,
    });
    expect(created.status).toBe(201);
    expect(created.body.assigneeMemberId).toBe(annaMember);
    const done = await anna.post(`${base()}/tasks/${created.body.id}/complete`, {
      completedAt: '2026-10-20T09:00:00+02:00',
    });
    expect(done.status).toBe(200);
    expect(done.body.completed.status).toBe('done');
    expect(done.body.next.assigneeMemberId).toBe(benMember);
    // 3 days after completion at the original 18:00 local time (still CEST on Oct 23).
    expect(done.body.next.dueAt).toBe('2026-10-23T16:00:00.000Z');
    const twice = await anna.post(`${base()}/tasks/${created.body.id}/complete`, {});
    expect(twice.status).toBe(409);
    const reopened = await anna.post(`${base()}/tasks/${created.body.id}/reopen`);
    expect(reopened.body.status).toBe('open');
    const open = await anna.get(`${base()}/tasks?status=open`);
    expect(
      open.body.filter((t: { seriesId: string }) => t.seriesId === created.body.seriesId),
    ).toHaveLength(1);
  });

  it('keeps fixed schedules', async () => {
    const t = await anna.post(`${base()}/tasks`, {
      title: 'Müll rausbringen',
      dueAt: '2026-11-02T19:00:00+01:00',
      recurrence: { mode: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
    });
    const done = await anna.post(`${base()}/tasks/${t.body.id}/complete`, {
      completedAt: '2026-10-25T10:00:00+01:00',
    });
    expect(done.body.next.dueAt).toBe('2026-11-09T18:00:00.000Z');
  });

  it('rejects recurring tasks without due date', async () => {
    const res = await anna.post(`${base()}/tasks`, {
      title: 'x',
      recurrence: { mode: 'floating', interval: 1, unit: 'day' },
    });
    expect(res.status).toBe(422);
  });
});

describe('calendar', () => {
  it('expands, edits one occurrence and truncates following', async () => {
    const cals = await anna.get(`${base()}/calendars`);
    const calendarId = cals.body[0].id;
    const ev = await anna.post(`${base()}/events`, {
      calendarId,
      title: 'Schwimmkurs',
      start: '2026-11-02T16:00:00+01:00',
      end: '2026-11-02T17:00:00+01:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      reminders: [30],
    });
    expect(ev.status).toBe(201);
    const range = `from=${encodeURIComponent('2026-11-01T00:00:00Z')}&to=${encodeURIComponent('2026-12-01T00:00:00Z')}`;
    const occ = await anna.get(`${base()}/occurrences?${range}`);
    expect(occ.body).toHaveLength(5);
    const second = occ.body[1].originalStart;
    const moved = await anna.patch(`${base()}/events/${ev.body.id}`, {
      scope: 'this',
      occurrenceStart: second,
      title: 'Schwimmkurs (Halle B)',
    });
    expect(moved.status).toBe(200);
    await anna.delete(
      `${base()}/events/${ev.body.id}?scope=following&occurrenceStart=${encodeURIComponent(occ.body[3].originalStart)}`,
    );
    const after = await anna.get(`${base()}/occurrences?${range}`);
    expect(after.body.map((o: { title: string }) => o.title)).toEqual([
      'Schwimmkurs',
      'Schwimmkurs (Halle B)',
      'Schwimmkurs',
    ]);
  });

  it('serves an ICS feed via token', async () => {
    const cals = await anna.get(`${base()}/calendars`);
    const rotated = await anna.post(`${base()}/calendars/${cals.body[0].id}/ics-token`);
    const path = new URL(rotated.body.icsUrl).pathname;
    const res = await stack.app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).toContain('SUMMARY:Schwimmkurs');
  });
});

describe('lists', () => {
  it('guesses categories and learns suggestions', async () => {
    const lists = await anna.get(`${base()}/lists`);
    const listId = lists.body[0].id;
    const item = await ben.post(`${base()}/lists/${listId}/items`, { text: 'Milch' });
    expect(item.body.category).toBe('dairy');
    // Regression: the open count subquery must correlate with the outer list row.
    const overview = await anna.get(`${base()}/lists`);
    expect(overview.body.find((l: { id: string }) => l.id === listId).openCount).toBe(1);
    await ben.patch(`${base()}/lists/${listId}/items/${item.body.id}`, { checked: true });
    const sugg = await anna.get(`${base()}/lists/suggestions?q=mil`);
    expect(sugg.body[0]).toMatchObject({ text: 'Milch', category: 'dairy' });
    const cleared = await anna.post(`${base()}/lists/${listId}/clear-checked`);
    expect(cleared.body.removed).toBe(1);
  });
});

const CSV = [
  '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"Betrag";"Waehrung";"Info"',
  '"DE1";"24.10.26";"24.10.26";"LASTSCHRIFT";"REWE SAGT DANKE";"REWE Markt GmbH";"DE111";"-85,00";"EUR";"Umsatz gebucht"',
  '"DE1";"25.10.26";"25.10.26";"GUTSCHRIFT";"Gehalt 10/2026";"ACME GmbH";"DE222";"3.250,10";"EUR";"Umsatz gebucht"',
  '"DE1";"25.10.26";"25.10.26";"LASTSCHRIFT";"Abo";"Netflix";"DE333";"-13,99";"EUR";"Umsatz gebucht"',
].join('\n');

describe('finance', () => {
  let accountId: string;
  let groceries: string;

  it('creates accounts within the plan limit', async () => {
    const a = await anna.post(`${base()}/finance/accounts`, {
      name: 'Giro',
      type: 'checking',
      openingBalanceMinor: 100000,
      iban: 'DE89 3704 0044 0532 0130 00',
    });
    expect(a.status).toBe(201);
    expect(a.body.ibanLast4).toBe('3000');
    expect(a.body).not.toHaveProperty('ibanEncrypted');
    accountId = a.body.id;
    await anna.post(`${base()}/finance/accounts`, { name: 'Bargeld', type: 'cash' });
    const third = await anna.post(`${base()}/finance/accounts`, {
      name: 'Sparen',
      type: 'savings',
    });
    expect(third.status).toBe(402);
    expect(third.body.code).toBe('plan_limit');
  });

  it('imports a statement, categorizes and deduplicates', async () => {
    const cats = await anna.get(`${base()}/finance/categories`);
    groceries = cats.body.find((c: { key: string }) => c.key === 'groceries').id;
    const preview = await anna.post(`${base()}/finance/accounts/${accountId}/imports/preview`, {
      content: CSV,
    });
    expect(preview.body.format).toBe('sparkasse-camt');
    expect(preview.body.rows[0].suggestedCategoryId).toBe(groceries);
    const first = await anna.post(`${base()}/finance/accounts/${accountId}/imports`, {
      content: CSV,
      fileName: 'umsatz.csv',
    });
    expect(first.body).toMatchObject({ imported: 3, duplicates: 0 });
    const second = await anna.post(`${base()}/finance/accounts/${accountId}/imports`, {
      content: CSV,
    });
    expect(second.body).toMatchObject({ imported: 0, duplicates: 3 });
    const accounts = await anna.get(`${base()}/finance/accounts`);
    expect(accounts.body.find((a: { id: string }) => a.id === accountId).balanceMinor).toBe(
      100000 - 8500 + 325010 - 1399,
    );
  });

  it('pages transactions with cursors', async () => {
    const p1 = await anna.get(`${base()}/finance/transactions?limit=2`);
    expect(p1.body.items).toHaveLength(2);
    const p2 = await anna.get(
      `${base()}/finance/transactions?limit=2&cursor=${p1.body.nextCursor}`,
    );
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('computes budget status and creates rules from corrections', async () => {
    const budget = await anna.post(`${base()}/finance/budgets`, {
      categoryId: groceries,
      period: 'monthly',
      limitMinor: 10000,
    });
    expect(budget.status).toBe(201);
    const statuses = await anna.get(
      `${base()}/finance/budgets?at=${encodeURIComponent('2026-10-26T12:00:00Z')}`,
    );
    expect(statuses.body[0]).toMatchObject({ spentMinor: 8500, level: 'warning' });
    const tx = (await anna.get(`${base()}/finance/transactions?q=Netflix`)).body.items[0];
    const cats = await anna.get(`${base()}/finance/categories`);
    const subs = cats.body.find((c: { key: string }) => c.key === 'subscriptions').id;
    const updated = await anna.patch(`${base()}/finance/transactions/${tx.id}`, {
      categoryId: subs,
      createRule: true,
    });
    expect(updated.body.categoryId).toBe(subs);
    const rules = await anna.get(`${base()}/finance/rules`);
    expect(rules.body).toHaveLength(1);
  });

  it('keeps transfers balanced and validates splits', async () => {
    const accounts = await anna.get(`${base()}/finance/accounts`);
    const cash = accounts.body.find((a: { name: string }) => a.name === 'Bargeld').id;
    const t = await anna.post(`${base()}/finance/transactions`, {
      accountId,
      bookingDate: '2026-10-26',
      amountMinor: -5000,
      transferAccountId: cash,
    });
    expect(t.status).toBe(201);
    const after = await anna.get(`${base()}/finance/accounts`);
    expect(after.body.find((a: { id: string }) => a.id === cash).balanceMinor).toBe(5000);
    const bad = await anna.post(`${base()}/finance/transactions`, {
      accountId,
      bookingDate: '2026-10-26',
      amountMinor: -1000,
      splits: [{ categoryId: groceries, amountMinor: -400 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('split_mismatch');
  });

  it('reports cash flow', async () => {
    const res = await anna.get(`${base()}/finance/reports/cashflow?from=2026-10&to=2026-11`);
    expect(res.body[0]).toMatchObject({
      month: '2026-10',
      incomeMinor: 325010,
      expenseMinor: 9899,
    });
  });

  it('hides finance from children', async () => {
    const kid = await anna.post(`${base()}/members`, { displayName: 'Mia', role: 'child' });
    expect(kid.status).toBe(201);
    expect(kid.body.isManaged).toBe(true);
  });
});

describe('platform behaviour', () => {
  it('replays idempotent POSTs', async () => {
    const key = crypto.randomUUID();
    const a = await anna.post(`${base()}/lists`, { name: 'Packliste' }, { 'idempotency-key': key });
    const b = await anna.post(`${base()}/lists`, { name: 'Packliste' }, { 'idempotency-key': key });
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers['idempotent-replay']).toBe('true');
  });

  it('relays outbox events', async () => {
    const relay = stack.app.get(OutboxRelay);
    expect(await relay.tick()).toBeGreaterThan(0);
    expect(await relay.tick()).toBe(0);
  });

  it('records an audit trail', async () => {
    const res = await anna.get(`${base()}/audit?limit=5`);
    expect(res.body.items.length).toBe(5);
    expect(res.body.nextCursor).not.toBeNull();
    expect((await ben.get(`${base()}/audit`)).status).toBe(403);
  });
});

describe('admin realm', () => {
  it('requires TOTP enrolment, then grants access by role', async () => {
    const admin = new TestClient(stack.app);
    const login = await admin.post('/admin/v1/auth/login', {
      email: 'admin@test.local',
      password: 'admin-password-123',
    });
    expect(login.status).toBe(200);
    expect(login.body.totpSetupRequired).toBe(true);
    const auth = { authorization: `Bearer ${login.body.token}` };
    const blocked = await admin.request('GET', '/admin/v1/kpis', undefined, auth);
    expect(blocked.status).toBe(403);
    const setup = await admin.request<{ secret: string }>('POST', '/admin/v1/auth/totp', {}, auth);
    const code = generateSync({ secret: setup.body.secret });
    expect(
      (await admin.request('POST', '/admin/v1/auth/totp/confirm', { code }, auth)).status,
    ).toBe(200);
    const kpis = await admin.request<{ users: number }>('GET', '/admin/v1/kpis', undefined, auth);
    expect(kpis.body.users).toBe(3);
    const detail = await admin.request<{ counts: { transactions: number } }>(
      'GET',
      `/admin/v1/households/${hh}`,
      undefined,
      auth,
    );
    expect(detail.body.counts.transactions).toBeGreaterThan(0);
    expect(JSON.stringify(detail.body)).not.toContain('REWE');
    const noReason = await admin.request(
      'PUT',
      '/admin/v1/flags/new-dashboard',
      { enabled: true },
      auth,
    );
    expect(noReason.status).toBe(400);
    const flag = await admin.request(
      'PUT',
      '/admin/v1/flags/new-dashboard',
      { enabled: true },
      { ...auth, 'x-audit-reason': 'Rollout test' },
    );
    expect(flag.status).toBe(200);
    expect((await anna.get('/admin/v1/kpis')).status).toBe(401);
  });
});

describe('subscribed calendars', () => {
  it('rejects edits to events of read-only subscription calendars', async () => {
    const cal = await anna.post(`${base()}/calendars`, { name: 'Schulferien', color: '#22c55e' });
    const ev = await anna.post(`${base()}/events`, {
      calendarId: cal.body.id,
      title: 'Herbstferien',
      start: '2026-10-26T00:00:00Z',
      end: '2026-10-31T00:00:00Z',
      allDay: true,
    });
    expect(ev.status).toBe(201);
    // An ICS subscription now owns this calendar (normally created by the calendar-sync module).
    const owner = createDb(stack.ownerUrl, { max: 1 });
    try {
      await owner.db.insert(calendarSubscriptions).values({
        householdId: hh,
        calendarId: cal.body.id,
        name: 'Ferien',
        urlEnc: 'v1:test',
        urlHost: 'example.org',
        createdByMemberId: annaMember,
      });
    } finally {
      await owner.close();
    }
    const calendars = await anna.get(`${base()}/calendars`);
    expect(calendars.body.find((c: { id: string }) => c.id === cal.body.id).readOnly).toBe(true);
    const edit = await anna.patch(`${base()}/events/${ev.body.id}`, { title: 'x' });
    expect(edit.status).toBe(400);
    expect(edit.body.code).toBe('calendar_read_only');
    const create = await anna.post(`${base()}/events`, {
      calendarId: cal.body.id,
      title: 'y',
      start: '2026-11-02T00:00:00Z',
      end: '2026-11-03T00:00:00Z',
      allDay: true,
    });
    expect(create.status).toBe(400);
    expect((await anna.delete(`${base()}/events/${ev.body.id}`)).status).toBe(400);
  });
});
