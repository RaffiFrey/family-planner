import { notifications } from '@fp/db';
import { monthsUntil } from '@fp/domain/finance';
import { toLocalDate } from '@fp/domain/time';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../src/infra/database.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { BankSyncService } from '../src/modules/finance-plus/bank-sync/bank-sync.service.js';
import { ContractsService } from '../src/modules/finance-plus/contracts.service.js';
import { type Stack, startStack, TestClient } from './harness.js';

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
let giro: string;

const base = () => `/v1/households/${hh}/finance`;

/** YYYY-MM-DD `months` months before today (UTC), clamped to the month end. */
function monthsAgo(months: number, day?: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day ?? now.getUTCDate(), last));
  return d.toISOString().slice(0, 10);
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function setPlan(householdId: string, plan: 'free' | 'plus' | 'pro') {
  await stack.app
    .get(BillingService)
    .applyPlan(householdId, { plan, status: 'active', provider: 'comp' });
}

async function countNotifications(householdId: string, type: string): Promise<number> {
  const [row] = await stack.app
    .get(Db)
    .system.select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.householdId, householdId), eq(notifications.type, type)));
  return row?.n ?? 0;
}

async function join(client: TestClient, role: string, name: string): Promise<string> {
  const inv = await anna.post(`/v1/households/${hh}/invitations`, { role });
  const res = await client.post(`/v1/invitations/${inv.body.token}/accept`, { displayName: name });
  expect(res.status).toBe(201);
  return res.body.me.id;
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
  malloryHh = (await mallory.post('/v1/households', { name: 'Mallory', displayName: 'M' })).body
    .household.id;
  const account = await anna.post(`${base()}/accounts`, {
    name: 'Giro',
    type: 'checking',
    openingBalanceMinor: 100000,
  });
  giro = account.body.id;
});

afterAll(async () => {
  await stack.close();
});

describe('plan gating', () => {
  it('requires the right plan for contracts, advanced reports and bank sync', async () => {
    for (const path of [
      '/contracts',
      '/contracts/suggestions',
      '/reports/net-worth?from=2026-01&to=2026-02',
      '/bank-sync/banks',
      '/bank-sync/connections',
    ]) {
      const res = await anna.get(`${base()}${path}`);
      expect(res.status, path).toBe(402);
      expect(res.body.code).toBe('plan_limit');
    }
    const start = await anna.post(`${base()}/bank-sync/connections`, { bankId: 'mock-sparkasse' });
    expect(start.status).toBe(402);
    // Goals and shared expenses are part of the free plan.
    expect((await anna.get(`${base()}/goals`)).status).toBe(200);
    expect((await anna.get(`${base()}/shared/parties`)).status).toBe(200);

    await setPlan(hh, 'plus');
    expect((await anna.get(`${base()}/contracts`)).status).toBe(200);
    expect((await anna.get(`${base()}/reports/net-worth?from=2026-01&to=2026-02`)).status).toBe(
      200,
    );
    // Bank sync is Pro only, even with the mock provider.
    expect((await anna.get(`${base()}/bank-sync/banks`)).status).toBe(402);
  });
});

describe('contracts & subscriptions', () => {
  const tx = (bookingDate: string, amountMinor: number, counterpartyName: string) =>
    anna.post(`${base()}/transactions`, {
      accountId: giro,
      bookingDate,
      amountMinor,
      counterpartyName,
    });

  it('detects recurring payments from transactions', async () => {
    for (const k of [1, 2, 3, 4])
      expect((await tx(monthsAgo(k, 15), -1399, 'NETFLIX.COM')).status).toBe(201);
    for (const k of [1, 2, 3]) await tx(monthsAgo(k, 7), -999, 'Spotify AB');
    for (const k of [1, 4, 7]) await tx(monthsAgo(k, 1), -9000, 'HUK-Coburg Versicherung');
    await tx(monthsAgo(2, 9), -4500, 'Baumarkt');

    const res = await anna.get(`${base()}/contracts/suggestions`);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.map((s: { counterpartyName: string }) => [s.counterpartyName, s]),
    );
    expect(byName['NETFLIX.COM']).toMatchObject({
      interval: 'monthly',
      direction: 'out',
      averageAmountMinor: 1399,
      occurrences: 4,
      currency: 'EUR',
      suggestedType: 'subscription',
    });
    expect(byName['HUK-Coburg Versicherung']).toMatchObject({
      interval: 'quarterly',
      suggestedType: 'insurance',
    });
    expect(byName['Spotify AB']).toBeDefined();
    expect(byName.Baumarkt).toBeUndefined();
  });

  it('confirms and dismisses suggestions', async () => {
    const suggestions = (await anna.get(`${base()}/contracts/suggestions`)).body as {
      key: string;
      counterpartyName: string;
    }[];
    const netflix = suggestions.find((s) => s.counterpartyName === 'NETFLIX.COM');
    const spotify = suggestions.find((s) => s.counterpartyName === 'Spotify AB');
    const confirmed = await anna.post(`${base()}/contracts/suggestions/confirm`, {
      key: netflix?.key,
      name: 'Netflix',
      contractNumber: 'NF-123456',
    });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      name: 'Netflix',
      contractType: 'subscription',
      amountMinor: 1399,
      interval: 'monthly',
      monthlyMinor: 1399,
      yearlyMinor: 16788,
      source: 'detected',
      contractNumber: 'NF-123456',
    });
    expect(confirmed.body).not.toHaveProperty('contractNumberEncrypted');
    expect(confirmed.body.nextDueDate >= daysFromNow(-1)).toBe(true);

    const dismissed = await anna.post(`${base()}/contracts/suggestions/dismiss`, {
      key: spotify?.key,
    });
    expect(dismissed.status).toBe(200);
    const again = (await anna.get(`${base()}/contracts/suggestions`)).body as {
      counterpartyName: string;
    }[];
    expect(again.map((s) => s.counterpartyName)).toEqual(['HUK-Coburg Versicherung']);
    const unknown = await anna.post(`${base()}/contracts/suggestions/confirm`, { key: 'nope' });
    expect(unknown.status).toBe(404);

    const list = await anna.get(`${base()}/contracts`);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Netflix']);
  });

  it('manages contracts, summary and insurance overview', async () => {
    const insurance = await anna.post(`${base()}/contracts`, {
      name: 'Hausrat',
      contractType: 'insurance',
      amountMinor: 12000,
      interval: 'yearly',
      nextDueDate: daysFromNow(20),
      noticePeriodDays: 10,
      providerName: 'Allianz',
      accountId: giro,
    });
    expect(insurance.status).toBe(201);
    expect(insurance.body.cancellationDeadline).toBe(daysFromNow(10));
    const bad = await anna.post(`${base()}/contracts`, {
      name: 'x',
      amountMinor: 100,
      interval: 'monthly',
      accountId: '00000000-0000-7000-8000-000000000000',
    });
    expect(bad.status).toBe(400);

    const summary = await anna.get(`${base()}/contracts/summary`);
    expect(summary.body).toMatchObject({
      currency: 'EUR',
      activeCount: 2,
      yearlyMinor: 16788 + 12000,
      monthlyMinor: Math.round((16788 + 12000) / 12),
      suggestionCount: 1,
    });
    expect(summary.body.upcomingDeadlines).toEqual([
      expect.objectContaining({ name: 'Hausrat', cancellationDeadline: daysFromNow(10) }),
    ]);
    const overview = await anna.get(`${base()}/contracts/insurance`);
    expect(overview.body).toMatchObject({ yearlyMinor: 12000, monthlyMinor: 1000 });
    expect(overview.body.contracts).toHaveLength(1);
    const filtered = await anna.get(`${base()}/contracts?type=insurance`);
    expect(filtered.body).toHaveLength(1);

    const cancelled = await anna.patch(`${base()}/contracts/${insurance.body.id}`, {
      status: 'cancelled',
    });
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancellationDeadline: null });
    expect(cancelled.body.endDate).toBe(daysFromNow(20));
    const reactivated = await anna.patch(`${base()}/contracts/${insurance.body.id}`, {
      status: 'active',
    });
    expect(reactivated.status).toBe(200);
  });

  it('reminds adults of notice deadlines once', async () => {
    const contracts = stack.app.get(ContractsService);
    expect(await contracts.noticeReminders()).toBe(1);
    expect(await contracts.noticeReminders()).toBe(0);
    // Owner and adult are notified, teen and child are not.
    expect(await countNotifications(hh, 'finance.contract_notice')).toBe(2);
  });

  it('deletes contracts', async () => {
    const created = await anna.post(`${base()}/contracts`, {
      name: 'Zeitung',
      amountMinor: 3000,
      interval: 'monthly',
    });
    expect((await anna.delete(`${base()}/contracts/${created.body.id}`)).status).toBe(200);
    expect((await anna.delete(`${base()}/contracts/${created.body.id}`)).status).toBe(404);
  });
});

describe('savings goals', () => {
  let goalId: string;

  it('tracks progress and the required monthly saving', async () => {
    const g = await anna.post(`${base()}/goals`, {
      name: 'Urlaub',
      targetMinor: 120000,
      deadline: monthsAgo(-6),
    });
    expect(g.status).toBe(201);
    goalId = g.body.id;
    const months = monthsUntil(toLocalDate(new Date(), 'Europe/Berlin'), monthsAgo(-6));
    expect(g.body).toMatchObject({ savedMinor: 0, ratio: 0, reached: false, monthsLeft: months });
    const after = await anna.post(`${base()}/goals/${goalId}/contributions`, {
      amountMinor: 50000,
    });
    expect(after.body).toMatchObject({
      savedMinor: 50000,
      remainingMinor: 70000,
      requiredMonthlyMinor: Math.ceil(70000 / months),
      progressSource: 'contributions',
    });
  });

  it('notifies once when the goal is reached', async () => {
    const reached = await anna.post(`${base()}/goals/${goalId}/contributions`, {
      amountMinor: 70000,
      memberId: benMember,
      note: 'Bonus',
    });
    expect(reached.body).toMatchObject({ reached: true, ratio: 1, requiredMonthlyMinor: 0 });
    expect(reached.body.reachedAt).not.toBeNull();
    await anna.post(`${base()}/goals/${goalId}/contributions`, { amountMinor: 100 });
    expect(await countNotifications(hh, 'finance.goal_reached')).toBe(2);

    const list = await anna.get(`${base()}/goals/${goalId}/contributions`);
    expect(list.body).toHaveLength(3);
    const removed = await anna.delete(
      `${base()}/goals/${goalId}/contributions/${list.body.find((c: { note: string }) => c.note === 'Bonus').id}`,
    );
    expect(removed.body).toMatchObject({ savedMinor: 50100, reached: false });
  });

  it('can use a linked account as progress source', async () => {
    const updated = await anna.patch(`${base()}/goals/${goalId}`, { accountId: giro });
    expect(updated.body.progressSource).toBe('account');
    const accounts = await anna.get(`${base()}/accounts`);
    const balance = accounts.body.find((a: { id: string }) => a.id === giro).balanceMinor;
    expect(updated.body.savedMinor).toBe(balance);
    expect((await anna.delete(`${base()}/goals/${goalId}`)).status).toBe(200);
  });
});

describe('shared expenses', () => {
  let parties: { id: string; name: string; memberId: string | null }[];
  let oma: string;
  const party = (name: string) => parties.find((p) => p.name === name)?.id as string;

  it('lists members as parties and adds external people', async () => {
    const res = await anna.get(`${base()}/shared/parties`);
    expect(res.body.map((p: { name: string }) => p.name).sort()).toEqual([
      'Anna',
      'Ben',
      'Kiki',
      'Tina',
    ]);
    oma = (await anna.post(`${base()}/shared/parties`, { name: 'Oma' })).body.id;
    parties = (await anna.get(`${base()}/shared/parties`)).body;
    expect(party('Oma')).toBe(oma);
    const rename = await anna.patch(`${base()}/shared/parties/${party('Anna')}`, { name: 'X' });
    expect(rename.status).toBe(400);
  });

  it('splits expenses, computes balances and settle-up', async () => {
    const e1 = await anna.post(`${base()}/shared/expenses`, {
      title: 'Ferienhaus',
      amountMinor: 10000,
      date: monthsAgo(0),
      paidByPartyId: party('Anna'),
      shares: [{ partyId: party('Anna') }, { partyId: party('Ben') }, { partyId: oma }],
    });
    expect(e1.status).toBe(201);
    expect(e1.body.shares.map((s: { amountMinor: number }) => s.amountMinor)).toEqual([
      3334, 3333, 3333,
    ]);
    const e2 = await anna.post(`${base()}/shared/expenses`, {
      title: 'Restaurant',
      amountMinor: 3000,
      date: monthsAgo(0),
      paidByPartyId: party('Ben'),
      splitMethod: 'percent',
      shares: [
        { partyId: party('Ben'), value: 50 },
        { partyId: oma, value: 50 },
      ],
    });
    expect(e2.status).toBe(201);
    const invalid = await anna.post(`${base()}/shared/expenses`, {
      title: 'x',
      amountMinor: 1000,
      date: monthsAgo(0),
      paidByPartyId: party('Ben'),
      splitMethod: 'exact',
      shares: [{ partyId: oma, value: 999 }],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('invalid_split');

    const balances = (await anna.get(`${base()}/shared/balances`)).body;
    expect(balances).toHaveLength(1);
    const byName = Object.fromEntries(
      balances[0].balances.map((b: { name: string; balanceMinor: number }) => [
        b.name,
        b.balanceMinor,
      ]),
    );
    expect(byName).toEqual({ Anna: 6666, Ben: -1833, Oma: -4833 });
    const settle = (await anna.get(`${base()}/shared/settle-up`)).body;
    expect(settle).toEqual([
      { currency: 'EUR', fromPartyId: oma, toPartyId: party('Anna'), amountMinor: 4833 },
      { currency: 'EUR', fromPartyId: party('Ben'), toPartyId: party('Anna'), amountMinor: 1833 },
    ]);
    for (const t of settle) {
      const s = await anna.post(`${base()}/shared/settlements`, t);
      expect(s.status).toBe(201);
    }
    expect((await anna.get(`${base()}/shared/settle-up`)).body).toEqual([]);
    expect((await anna.get(`${base()}/shared/settlements`)).body).toHaveLength(2);

    // Ben took part in both and was notified; Anna (the actor) was not.
    expect(await countNotifications(hh, 'finance.expense_added')).toBe(2);

    const page = await anna.get(`${base()}/shared/expenses?limit=1&partyId=${party('Ben')}`);
    expect(page.body.items).toHaveLength(1);
    const next = await anna.get(
      `${base()}/shared/expenses?limit=1&partyId=${party('Ben')}&cursor=${page.body.nextCursor}`,
    );
    expect(next.body.items).toHaveLength(1);
    expect(next.body.nextCursor).toBeNull();

    const updated = await anna.patch(`${base()}/shared/expenses/${e2.body.id}`, {
      amountMinor: 4000,
    });
    expect(updated.body.shares.map((s: { amountMinor: number }) => s.amountMinor)).toEqual([
      2000, 2000,
    ]);
    expect((await anna.delete(`${base()}/shared/expenses/${e2.body.id}`)).status).toBe(200);
  });

  it('archives external people that are still referenced', async () => {
    expect((await anna.delete(`${base()}/shared/parties/${oma}`)).status).toBe(200);
    const list = (await anna.get(`${base()}/shared/parties`)).body;
    expect(list.find((p: { id: string }) => p.id === oma).archived).toBe(true);
    const unused = (await anna.post(`${base()}/shared/parties`, { name: 'Nachbar' })).body.id;
    await anna.delete(`${base()}/shared/parties/${unused}`);
    const after = (await anna.get(`${base()}/shared/parties`)).body;
    expect(after.some((p: { id: string }) => p.id === unused)).toBe(false);
  });
});

describe('advanced reports', () => {
  it('builds net worth, trends, year comparison and CSV export', async () => {
    const from = monthsAgo(4).slice(0, 7);
    const to = monthsAgo(0).slice(0, 7);
    const nw = await anna.get(`${base()}/reports/net-worth?from=${from}&to=${to}`);
    expect(nw.status).toBe(200);
    const accounts = await anna.get(`${base()}/accounts`);
    const balance = accounts.body.find((a: { id: string }) => a.id === giro).balanceMinor;
    expect(nw.body.points.at(-1).netWorthMinor).toBe(balance);
    expect(nw.body.points[0].netWorthMinor).toBeGreaterThan(balance);

    const trends = await anna.get(`${base()}/reports/category-trends?from=${from}&to=${to}`);
    expect(trends.body.months).toHaveLength(5);
    expect(trends.body.categories.length).toBeGreaterThan(0);

    const year = Number(monthsAgo(0).slice(0, 4));
    const yoy = await anna.get<{
      months: unknown[];
      totals: { expenseMinor: number; previousExpenseMinor: number };
    }>(`${base()}/reports/year-over-year?year=${year}`);
    expect(yoy.body.months).toHaveLength(12);
    expect(yoy.body.totals.expenseMinor + yoy.body.totals.previousExpenseMinor).toBe(
      4 * 1399 + 3 * 999 + 3 * 9000 + 4500,
    );

    const csv = await anna.get(`${base()}/reports/export?from=${monthsAgo(12)}&to=${monthsAgo(0)}`);
    expect(csv.body.fileName).toMatch(/^umsaetze_.*\.csv$/);
    const lines = csv.body.content.trim().split('\r\n');
    expect(lines[0]).toContain('Buchungsdatum;Wertstellung;Konto;Betrag');
    expect(lines).toHaveLength(1 + 11);
    expect(csv.body.content).toContain(';-13,99;EUR;NETFLIX.COM;');

    const tooLong = await anna.get(`${base()}/reports/net-worth?from=2000-01&to=2026-01`);
    expect(tooLong.status).toBe(400);
  });
});

describe('bank sync (mock provider)', () => {
  let connectionId: string;

  it('connects a bank through the aggregator redirect', async () => {
    await setPlan(hh, 'pro');
    const banks = await anna.get(`${base()}/bank-sync/banks?q=spark`);
    expect(banks.body).toEqual([expect.objectContaining({ id: 'mock-sparkasse' })]);
    const start = await anna.post(`${base()}/bank-sync/connections`, { bankId: 'mock-sparkasse' });
    expect(start.status).toBe(201);
    connectionId = start.body.connectionId;
    const url = new URL(start.body.redirectUrl);
    expect(`${url.origin}${url.pathname}`).toBe('http://localhost:4000/v1/bank-sync/callback');
    const pending = (await anna.get(`${base()}/bank-sync/connections`)).body;
    expect(pending[0]).toMatchObject({ status: 'pending', accounts: [] });
    const sync = await anna.post(`${base()}/bank-sync/connections/${connectionId}/sync`);
    expect(sync.body.code).toBe('connection_pending');

    // The browser comes back without our session (bank redirect); the state identifies it.
    // A browser (Accept: text/html) is redirected back into the web app.
    const cb = await new TestClient(stack.app).request(
      'GET',
      `${url.pathname}${url.search}`,
      undefined,
      {
        accept: 'text/html,application/xhtml+xml',
      },
    );
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe(cb.body.redirectTo);
    expect(cb.body).toMatchObject({ connectionId, householdId: hh, status: 'active' });
    expect(cb.body.redirectTo).toContain('/finance/bank-sync');
    const replay = await new TestClient(stack.app).get(`${url.pathname}${url.search}`);
    expect(replay.status).toBe(404);

    const list = (await anna.get(`${base()}/bank-sync/connections`)).body;
    expect(list[0]).toMatchObject({ status: 'active', bankName: 'Sparkasse Musterstadt (Demo)' });
    expect(list[0].accounts.map((a: { name: string }) => a.name)).toEqual([
      'Girokonto',
      'Tagesgeld',
    ]);
    expect(JSON.stringify(list)).not.toMatch(/Encrypted|mock-sparkasse-/);
  });

  it('syncs linked accounts without duplicates', async () => {
    const conn = (await anna.get(`${base()}/bank-sync/connections`)).body[0];
    const [giroBank, savingsBank] = conn.accounts;
    const linked = await anna.post(
      `${base()}/bank-sync/connections/${connectionId}/accounts/${giroBank.id}/link`,
      {},
    );
    expect(linked.status).toBe(200);
    const newAccountId = linked.body.accounts[0].accountId;
    expect(newAccountId).toBeTruthy();
    const savings = await anna.post(`${base()}/accounts`, { name: 'Sparen', type: 'savings' });
    const mismatch = await anna.post(
      `${base()}/bank-sync/connections/${connectionId}/accounts/${savingsBank.id}/link`,
      { accountId: newAccountId },
    );
    expect(mismatch.body.code).toBe('already_linked');
    await anna.post(
      `${base()}/bank-sync/connections/${connectionId}/accounts/${savingsBank.id}/link`,
      { accountId: savings.body.id },
    );

    const first = await anna.post(`${base()}/bank-sync/connections/${connectionId}/sync`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'active', duplicates: 0 });
    expect(first.body.imported).toBeGreaterThan(5);
    const txs = await anna.get(`${base()}/transactions?accountId=${newAccountId}&limit=200`);
    expect(txs.body.items.length).toBeGreaterThan(0);
    expect(txs.body.items.every((t: { source: string }) => t.source === 'sync')).toBe(true);
    // Global rules categorise synced bookings (REWE → groceries).
    const rewe = txs.body.items.find((t: { counterpartyName: string }) =>
      t.counterpartyName.startsWith('REWE'),
    );
    expect(rewe?.categoryId).not.toBeNull();
    const accounts = (await anna.get(`${base()}/accounts`)).body;
    expect(accounts.find((a: { id: string }) => a.id === newAccountId).source).toBe('sync');

    const second = await anna.post(`${base()}/bank-sync/connections/${connectionId}/sync`);
    expect(second.body).toMatchObject({ status: 'active', imported: 0 });
    expect(second.body.duplicates).toBeGreaterThan(0);
    const again = await anna.get(`${base()}/transactions?accountId=${newAccountId}&limit=200`);
    expect(again.body.items).toHaveLength(txs.body.items.length);

    // The scheduled job syncs all active connections of Pro households.
    expect(await stack.app.get(BankSyncService).syncAll()).toBe(1);
    const third = await anna.get(`${base()}/transactions?accountId=${newAccountId}&limit=200`);
    expect(third.body.items).toHaveLength(txs.body.items.length);
  });

  it('marks failing connections and notifies adults once a day', async () => {
    const start = await anna.post(`${base()}/bank-sync/connections`, { bankId: 'mock-fail' });
    const url = new URL(start.body.redirectUrl);
    await new TestClient(stack.app).get(`${url.pathname}${url.search}`);
    const conn = (await anna.get(`${base()}/bank-sync/connections`)).body.find(
      (c: { id: string }) => c.id === start.body.connectionId,
    );
    await anna.post(
      `${base()}/bank-sync/connections/${conn.id}/accounts/${conn.accounts[0].id}/link`,
      { name: 'Störungskonto' },
    );
    const res = await anna.post(`${base()}/bank-sync/connections/${conn.id}/sync`);
    expect(res.body).toMatchObject({ status: 'error', imported: 0 });
    await anna.post(`${base()}/bank-sync/connections/${conn.id}/sync`);
    expect(await countNotifications(hh, 'finance.bank_sync_failed')).toBe(2);
    const after = (await anna.get(`${base()}/bank-sync/connections`)).body.find(
      (c: { id: string }) => c.id === conn.id,
    );
    expect(after).toMatchObject({
      status: 'error',
      lastError: expect.stringContaining('unavailable'),
    });
    expect((await anna.delete(`${base()}/bank-sync/connections/${conn.id}`)).status).toBe(200);
  });

  it('keeps accounts as manual accounts when a connection is removed', async () => {
    const conn = (await anna.get(`${base()}/bank-sync/connections`)).body[0];
    expect((await anna.delete(`${base()}/bank-sync/connections/${conn.id}`)).status).toBe(200);
    const accounts = (await anna.get(`${base()}/accounts`)).body;
    const kept = accounts.find((a: { id: string }) => a.id === conn.accounts[0].accountId);
    expect(kept.source).toBe('manual');
    expect((await anna.get(`${base()}/bank-sync/connections`)).body).toEqual([]);
  });
});

describe('permissions & tenant isolation', () => {
  it('lets teens read but not write, and hides finance from children', async () => {
    expect((await tina.get(`${base()}/contracts`)).status).toBe(200);
    expect((await tina.get(`${base()}/goals`)).status).toBe(200);
    for (const [path, body] of [
      ['/contracts', { name: 'x', amountMinor: 100, interval: 'monthly' }],
      ['/goals', { name: 'x', targetMinor: 100 }],
      ['/shared/parties', { name: 'x' }],
      ['/bank-sync/connections', { bankId: 'mock-sparkasse' }],
    ] as const) {
      expect((await tina.post(`${base()}${path}`, body)).status, path).toBe(403);
    }
    for (const path of ['/contracts', '/goals', '/shared/balances', '/bank-sync/connections']) {
      expect((await kiki.get(`${base()}${path}`)).status, path).toBe(403);
    }
  });

  it('keeps households apart', async () => {
    expect((await mallory.get(`${base()}/goals`)).status).toBe(404);
    await setPlan(malloryHh, 'pro');
    const other = `/v1/households/${malloryHh}/finance`;
    expect((await mallory.get(`${other}/contracts`)).body).toEqual([]);
    expect((await mallory.get(`${other}/contracts/suggestions`)).body).toEqual([]);
    expect((await mallory.get(`${other}/goals`)).body).toEqual([]);
    expect((await mallory.get(`${other}/shared/balances`)).body).toEqual([]);
    expect((await mallory.get(`${other}/bank-sync/connections`)).body).toEqual([]);
    const contract = (await anna.get(`${base()}/contracts`)).body[0];
    const peek = await mallory.patch(`${other}/contracts/${contract.id}`, { name: 'mine' });
    expect(peek.status).toBe(404);
    const parties = (await mallory.get(`${other}/shared/parties`)).body;
    expect(parties.map((p: { name: string }) => p.name)).toEqual(['M']);
    expect(annaMember).toBeTruthy();
  });
});
