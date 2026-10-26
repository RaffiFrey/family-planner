import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDb, files, type DbHandle } from '@fp/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { RecipeFetcher } from '../src/modules/family/meals/recipe-fetcher.js';
import { RewardsService } from '../src/modules/family/rewards/rewards.service.js';
import { TravelService } from '../src/modules/family/travel/travel.service.js';
import { type Stack, startStack, TestClient } from './harness.js';

let stack: Stack;
let owner: DbHandle;
let anna: TestClient;
let mia: TestClient;
let mallory: TestClient;
let hh: string;
let annaMember: string;
let miaMember: string;
let otherHh: string;
let fixtureServer: Server;
let fixtureUrl: string;

const RECIPE_HTML = `<!doctype html><html><head><title>Lasagne</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","name":"Lasagne"},
 {"@type":"Recipe","name":"Gemüselasagne","recipeYield":"4 Portionen","prepTime":"PT20M","cookTime":"PT45M",
  "recipeIngredient":["250 g Lasagneplatten","500 g passierte Tomaten","2 EL Olivenöl","1 Prise Salz","200 g geriebener Käse"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Soße kochen."},{"@type":"HowToStep","text":"Schichten und backen."}],
  "keywords":"Pasta, vegetarisch"}]}
</script></head><body>Lasagne</body></html>`;

const base = () => `/v1/households/${hh}`;

beforeAll(async () => {
  stack = await startStack();
  owner = createDb(stack.ownerUrl, { max: 2 });
  anna = await new TestClient(stack.app).signUp('anna@family.test', 'Anna');
  mia = await new TestClient(stack.app).signUp('mia@family.test', 'Mia');
  mallory = await new TestClient(stack.app).signUp('mallory@family.test', 'Mallory');

  const created = await anna.post('/v1/households', { name: 'Familie Frey', displayName: 'Anna' });
  hh = created.body.household.id;
  annaMember = created.body.me.id;
  const inv = await anna.post(`${base()}/invitations`, { role: 'child' });
  const joined = await mia.post(`/v1/invitations/${inv.body.token}/accept`, { displayName: 'Mia' });
  miaMember = joined.body.me.id;
  const other = await mallory.post('/v1/households', { name: 'Andere', displayName: 'Mallory' });
  otherHh = other.body.household.id;

  fixtureServer = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/lasagne' });
      res.end();
    } else if (req.url === '/lasagne') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(RECIPE_HTML);
    } else if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('x'.repeat(4 * 1024 * 1024));
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>nothing here</html>');
    }
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  fixtureUrl = `http://127.0.0.1:${String((fixtureServer.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    fixtureServer.close(() => {
      resolve();
    }),
  );
  await owner.close();
  await stack.close();
});

describe('recipes & meal planning', () => {
  let recipeId: string;

  it('blocks imports from private networks by default', async () => {
    const fetcher = stack.app.get(RecipeFetcher);
    expect(fetcher.allowPrivateNetworks).toBe(false);
    const res = await anna.post(`${base()}/meals/recipes/import/preview`, {
      url: `${fixtureUrl}/lasagne`,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('import_blocked');
    const ftp = await anna.post(`${base()}/meals/recipes/import/preview`, {
      url: 'ftp://example.com/x',
    });
    expect(ftp.status).toBe(422);
  });

  it('imports a recipe from a page with schema.org JSON-LD', async () => {
    const fetcher = stack.app.get(RecipeFetcher);
    fetcher.allowPrivateNetworks = true;
    try {
      const preview = await anna.post(`${base()}/meals/recipes/import/preview`, {
        url: `${fixtureUrl}/redirect`,
      });
      expect(preview.status).toBe(200);
      expect(preview.body).toMatchObject({
        title: 'Gemüselasagne',
        servings: 4,
        prepMinutes: 20,
        cookMinutes: 45,
        steps: ['Soße kochen.', 'Schichten und backen.'],
        tags: ['Pasta', 'vegetarisch'],
        sourceUrl: `${fixtureUrl}/lasagne`,
      });
      expect(preview.body.ingredients[1]).toMatchObject({
        quantity: 500,
        unit: 'g',
        name: 'passierte Tomaten',
      });

      const none = await anna.post(`${base()}/meals/recipes/import`, { url: `${fixtureUrl}/x` });
      expect(none.body.code).toBe('no_recipe');
      fetcher.maxBytes = 1024 * 1024;
      const big = await anna.post(`${base()}/meals/recipes/import`, { url: `${fixtureUrl}/big` });
      expect(big.status).toBe(400);

      const imported = await anna.post(`${base()}/meals/recipes/import`, {
        url: `${fixtureUrl}/lasagne`,
      });
      expect(imported.status).toBe(201);
      recipeId = imported.body.id;
      expect(imported.body.ingredients.map((i: { category: string }) => i.category)).toContain(
        'dairy',
      );
    } finally {
      fetcher.allowPrivateNetworks = false;
      fetcher.maxBytes = 3 * 1024 * 1024;
    }
  });

  it('creates recipes by hand; children may read but not write', async () => {
    const res = await anna.post(`${base()}/meals/recipes`, {
      title: 'Pfannkuchen',
      servings: 2,
      ingredients: [
        { quantity: 250, unit: 'g', name: 'Mehl' },
        { quantity: 500, unit: 'ml', name: 'Milch' },
        { quantity: 3, name: 'Eier' },
      ],
      steps: ['Verrühren', 'Ausbacken'],
      tags: ['süß'],
    });
    expect(res.status).toBe(201);
    expect(res.body.ingredients[1].category).toBe('dairy');
    const list = await mia.get(`${base()}/meals/recipes?q=pfann`);
    expect(list.status).toBe(200);
    expect(list.body.map((r: { title: string }) => r.title)).toEqual(['Pfannkuchen']);
    expect((await mia.post(`${base()}/meals/recipes`, { title: 'Eis' })).status).toBe(403);
    const updated = await anna.patch(`${base()}/meals/recipes/${res.body.id}`, { servings: 4 });
    expect(updated.body.servings).toBe(4);
    expect((await anna.delete(`${base()}/meals/recipes/${res.body.id}`)).status).toBe(200);
  });

  it('plans meals and adds scaled, merged ingredients to the shopping list', async () => {
    const mon = await anna.put(`${base()}/meals/plan/2026-11-02/dinner`, {
      recipeId,
      servings: 8,
      cookMemberId: annaMember,
    });
    expect(mon.status).toBe(200);
    expect(mon.body.title).toBe('Gemüselasagne');
    await anna.put(`${base()}/meals/plan/2026-11-03/dinner`, { recipeId, servings: 4 });
    await anna.put(`${base()}/meals/plan/2026-11-04/lunch`, { title: 'Reste' });
    const again = await anna.put(`${base()}/meals/plan/2026-11-04/lunch`, { title: 'Pizza' });
    expect(again.body.title).toBe('Pizza');
    expect((await anna.put(`${base()}/meals/plan/2026-11-05/lunch`, {})).status).toBe(422);

    const plan = await mia.get(`${base()}/meals/plan?from=2026-11-02&to=2026-11-08`);
    expect(plan.body.map((e: { date: string }) => e.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect((await anna.get(`${base()}/meals/plan?from=2026-01-01&to=2026-12-31`)).status).toBe(400);

    const res = await anna.post(`${base()}/meals/plan/shopping-list`, {
      from: '2026-11-02',
      to: '2026-11-08',
    });
    expect(res.status).toBe(200);
    expect(res.body.skipped.sort()).toEqual(['Olivenöl', 'Salz']);
    const byText = new Map(
      res.body.items.map((i: { text: string; quantity: string; category: string }) => [i.text, i]),
    );
    // 2× + 1× the recipe (4 servings): 750 g Lasagneplatten, 1,5 kg Tomaten.
    expect(byText.get('Lasagneplatten')).toMatchObject({ quantity: '750 g' });
    expect(byText.get('passierte Tomaten')).toMatchObject({ quantity: '1,5 kg' });
    expect(byText.get('geriebener Käse')).toMatchObject({ quantity: '600 g', category: 'dairy' });

    const list = await anna.get(`${base()}/lists/${res.body.listId}`);
    expect(list.body.kind).toBe('shopping');
    expect(list.body.items.length).toBe(3);

    expect((await anna.delete(`${base()}/meals/plan/2026-11-04/lunch`)).status).toBe(200);
    expect((await anna.delete(`${base()}/meals/plan/2026-11-04/lunch`)).status).toBe(404);
  });
});

describe('rewards & pocket money', () => {
  let rewardId: string;

  it('requires Family Plus', async () => {
    const res = await anna.get(`${base()}/rewards/balances`);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('plan_limit');
    await stack.app
      .get(BillingService)
      .applyPlan(hh, { plan: 'plus', status: 'active', provider: 'comp' });
    expect((await anna.get(`${base()}/rewards/balances`)).status).toBe(200);
  });

  it('awards points once when a task is completed', async () => {
    const task = await anna.post(`${base()}/tasks`, {
      title: 'Zimmer aufräumen',
      assigneeMemberId: miaMember,
      points: 30,
    });
    const done = await mia.post(`${base()}/tasks/${task.body.id}/complete`, {});
    expect(done.status).toBe(200);
    const events = await owner.db.execute(
      sql`select payload from outbox where type = 'task.completed' and payload->>'taskId' = ${task.body.id}`,
    );
    const payload = events.rows[0]?.payload as {
      householdId: string;
      taskId: string;
      memberId: string;
      points: number;
    };
    expect(payload).toMatchObject({ householdId: hh, memberId: miaMember, points: 30 });
    const rewards = stack.app.get(RewardsService);
    expect(await rewards.awardTaskPoints(payload)).toBe(true);
    expect(await rewards.awardTaskPoints(payload)).toBe(false);
    expect(await rewards.awardTaskPoints({ ...payload, points: 0 })).toBe(false);

    const mine = await mia.get(`${base()}/rewards/balances`);
    expect(mine.body).toEqual([{ memberId: miaMember, points: 30, reserved: 0, available: 30 }]);
    const all = await anna.get(`${base()}/rewards/balances`);
    expect(all.body).toHaveLength(2);
    const ledger = await mia.get(`${base()}/rewards/points`);
    expect(ledger.body.items[0]).toMatchObject({ delta: 30, reason: 'Zimmer aufräumen' });
    expect((await mia.get(`${base()}/rewards/points?memberId=${annaMember}`)).status).toBe(403);
    const board = await mia.get(`${base()}/rewards/leaderboard?period=week`);
    expect(board.body.rows[0]).toMatchObject({ memberId: miaMember, points: 30, rank: 1 });
    // A past month (via `at`) covers that month only and has no points yet.
    const past = await mia.get(`${base()}/rewards/leaderboard?period=month&at=2026-01-15`);
    expect(past.body).toMatchObject({ period: 'month', from: '2026-01-01' });
    expect(past.body.rows.every((r: { points: number }) => r.points === 0)).toBe(true);
  });

  it('lets children request rewards and adults approve them', async () => {
    expect(
      (await mia.post(`${base()}/rewards/catalog`, { title: 'Kino', costPoints: 10 })).status,
    ).toBe(403);
    const reward = await anna.post(`${base()}/rewards/catalog`, {
      title: 'Kinoabend',
      costPoints: 20,
      icon: 'film',
    });
    expect(reward.status).toBe(201);
    rewardId = reward.body.id;

    const req = await mia.post(`${base()}/rewards/catalog/${rewardId}/redeem`, {});
    expect(req.status).toBe(201);
    expect(req.body.status).toBe('requested');
    // 10 points left available → a second request must fail.
    const second = await mia.post(`${base()}/rewards/catalog/${rewardId}/redeem`, {});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('insufficient_points');
    expect(
      (await mia.post(`${base()}/rewards/redemptions/${req.body.id}/approve`, {})).status,
    ).toBe(403);

    const approved = await anna.post(`${base()}/rewards/redemptions/${req.body.id}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    const again = await anna.post(`${base()}/rewards/redemptions/${req.body.id}/reject`, {});
    expect(again.status).toBe(409);
    const balance = await mia.get(`${base()}/rewards/balances`);
    expect(balance.body[0]).toMatchObject({ points: 10, available: 10 });

    await anna.post(`${base()}/rewards/points`, {
      memberId: miaMember,
      delta: 15,
      reason: 'Bonus',
    });
    const r2 = await mia.post(`${base()}/rewards/catalog/${rewardId}/redeem`, {});
    const cancelled = await mia.post(`${base()}/rewards/redemptions/${r2.body.id}/cancel`);
    expect(cancelled.body.status).toBe('cancelled');
    const own = await mia.get(`${base()}/rewards/redemptions`);
    expect(own.body.every((r: { memberId: string }) => r.memberId === miaMember)).toBe(true);
  });

  it('pays pocket money once per period and keeps a ledger', async () => {
    expect(
      (
        await mia.post(`${base()}/rewards/allowance/rules`, {
          memberId: miaMember,
          amountMinor: 500,
          interval: 'weekly',
          weekday: 1,
        })
      ).status,
    ).toBe(403);
    const rule = await anna.post(`${base()}/rewards/allowance/rules`, {
      memberId: miaMember,
      amountMinor: 500,
      interval: 'weekly',
      weekday: 1,
      startsOn: '2026-10-01',
    });
    expect(rule.status).toBe(201);
    expect(rule.body).toMatchObject({ currency: 'EUR', nextPayday: expect.any(String) });
    const invalid = await anna.post(`${base()}/rewards/allowance/rules`, {
      memberId: miaMember,
      amountMinor: 500,
      interval: 'monthly',
    });
    expect(invalid.status).toBe(422);

    const rewards = stack.app.get(RewardsService);
    const monday = new Date('2026-10-26T10:00:00Z');
    expect(await rewards.payAllowances(monday)).toBe(1);
    expect(await rewards.payAllowances(monday)).toBe(0);
    expect(await rewards.payAllowances(new Date('2026-10-27T10:00:00Z'))).toBe(0);

    await anna.post(`${base()}/rewards/allowance/ledger`, {
      memberId: miaMember,
      amountMinor: 120,
      kind: 'expense',
      note: 'Sticker',
    });
    const balances = await mia.get(`${base()}/rewards/allowance/balances`);
    expect(balances.body).toEqual([{ memberId: miaMember, currency: 'EUR', balanceMinor: 380 }]);
    const ledger = await mia.get(`${base()}/rewards/allowance/ledger?limit=1`);
    expect(ledger.body.items).toHaveLength(1);
    expect(ledger.body.nextCursor).not.toBeNull();
    const next = await mia.get(
      `${base()}/rewards/allowance/ledger?limit=1&cursor=${ledger.body.nextCursor as string}`,
    );
    expect(next.body.items[0].id).not.toBe(ledger.body.items[0].id);
    expect(
      (
        await mia.post(`${base()}/rewards/allowance/ledger`, {
          memberId: miaMember,
          amountMinor: 1000,
          kind: 'bonus',
        })
      ).status,
    ).toBe(403);
  });
});

describe('pinboard & polls', () => {
  it('posts, pins, reacts and pages the feed', async () => {
    const a = await anna.post(`${base()}/pinboard/posts`, { text: 'Oma kommt am Sonntag' });
    expect(a.status).toBe(201);
    const b = await mia.post(`${base()}/pinboard/posts`, { text: 'Ich brauche neue Schuhe' });
    expect(b.status).toBe(201);
    expect((await mia.post(`${base()}/pinboard/posts`, { text: 'x', pinned: true })).status).toBe(
      403,
    );
    expect(
      (await anna.patch(`${base()}/pinboard/posts/${a.body.id}`, { pinned: true })).status,
    ).toBe(200);
    expect(
      (await mia.patch(`${base()}/pinboard/posts/${a.body.id}`, { text: 'hack' })).status,
    ).toBe(403);

    const reacted = await mia.post(`${base()}/pinboard/posts/${a.body.id}/reactions`, {
      emoji: '❤️',
    });
    expect(reacted.status).toBe(200);
    await mia.post(`${base()}/pinboard/posts/${a.body.id}/reactions`, { emoji: '❤️' });
    await anna.post(`${base()}/pinboard/posts/${a.body.id}/reactions`, { emoji: '❤️' });
    const feed = await mia.get(`${base()}/pinboard/posts?limit=1`);
    expect(feed.body.items[0]).toMatchObject({ id: a.body.id, pinned: true });
    expect(feed.body.items[0].reactions).toEqual([
      { emoji: '❤️', count: 2, memberIds: [miaMember, annaMember], mine: true },
    ]);
    const page2 = await mia.get(
      `${base()}/pinboard/posts?limit=1&cursor=${feed.body.nextCursor as string}`,
    );
    expect(page2.body.items[0].id).toBe(b.body.id);
    expect(page2.body.nextCursor).toBeNull();

    const unreacted = await mia.delete(
      `${base()}/pinboard/posts/${a.body.id}/reactions?emoji=${encodeURIComponent('❤️')}`,
    );
    expect(unreacted.body.reactions[0].count).toBe(1);
    expect((await mia.delete(`${base()}/pinboard/posts/${b.body.id}`)).status).toBe(200);
  });

  it('runs polls and hides voters when anonymous', async () => {
    const poll = await anna.post(`${base()}/pinboard/polls`, {
      question: 'Pizza oder Pasta am Freitag?',
      options: ['Pizza', 'Pasta'],
      anonymous: true,
    });
    expect(poll.status).toBe(201);
    const id = poll.body.id;
    expect(
      (await mia.put(`${base()}/pinboard/polls/${id}/vote`, { optionIndexes: [0, 1] })).status,
    ).toBe(400);
    const voted = await mia.put(`${base()}/pinboard/polls/${id}/vote`, { optionIndexes: [0] });
    expect(voted.status).toBe(200);
    expect(voted.body.myVotes).toEqual([0]);
    const changed = await mia.put(`${base()}/pinboard/polls/${id}/vote`, { optionIndexes: [1] });
    expect(changed.body.options.map((o: { votes: number }) => o.votes)).toEqual([0, 1]);
    await anna.put(`${base()}/pinboard/polls/${id}/vote`, { optionIndexes: [1] });
    const results = await anna.get(`${base()}/pinboard/polls/${id}`);
    expect(results.body.options[1]).toMatchObject({ votes: 2, voterMemberIds: [] });
    expect(results.body.totalVoters).toBe(2);

    const open = await anna.post(`${base()}/pinboard/polls`, {
      question: 'Ausflug?',
      options: ['Zoo', 'See'],
      multiple: true,
    });
    await mia.put(`${base()}/pinboard/polls/${open.body.id}/vote`, { optionIndexes: [0, 1] });
    const visible = await anna.get(`${base()}/pinboard/polls/${open.body.id}`);
    expect(visible.body.options[0].voterMemberIds).toEqual([miaMember]);
    const unvoted = await mia.delete(`${base()}/pinboard/polls/${open.body.id}/vote`);
    expect(unvoted.body.myVotes).toEqual([]);

    expect((await mia.post(`${base()}/pinboard/polls/${id}/close`)).status).toBe(403);
    const closed = await anna.post(`${base()}/pinboard/polls/${id}/close`);
    expect(closed.body.open).toBe(false);
    const late = await mia.put(`${base()}/pinboard/polls/${id}/vote`, { optionIndexes: [0] });
    expect(late.status).toBe(409);
    const closedList = await mia.get(`${base()}/pinboard/polls?status=closed`);
    expect(closedList.body.map((p: { id: string }) => p.id)).toEqual([id]);
  });

  it('records notification events for new posts and polls', async () => {
    const rows = await owner.db.execute(
      sql`select type from outbox where household_id = ${hh} and type like 'pinboard.%'`,
    );
    const types = rows.rows.map((r) => r.type);
    expect(types).toContain('pinboard.post_created');
    expect(types).toContain('pinboard.poll_created');
  });
});

describe('travel', () => {
  let tripId: string;

  it('plans a trip with itinerary, packing list and budget', async () => {
    const bday = await anna.patch(`${base()}/members/${miaMember}`, { birthday: '2021-03-01' });
    expect(bday.status).toBe(200);
    expect(
      (
        await mia.post(`${base()}/travel/trips`, {
          name: 'x',
          startDate: '2026-12-01',
          endDate: '2026-12-02',
        })
      ).status,
    ).toBe(403);
    const trip = await anna.post(`${base()}/travel/trips`, {
      name: 'Ostsee',
      destination: 'Rügen',
      startDate: '2027-07-01',
      endDate: '2027-07-08',
      budgetMinor: 200000,
      memberIds: [annaMember, miaMember],
    });
    expect(trip.status).toBe(201);
    tripId = trip.body.id;
    expect(trip.body.financeTag.length).toBeLessThanOrEqual(30);

    const item = await anna.post(`${base()}/travel/trips/${tripId}/items`, {
      kind: 'hotel',
      title: 'Ferienwohnung',
      startAt: '2027-07-01T15:00:00+02:00',
      endAt: '2027-07-08T10:00:00+02:00',
      confirmationCode: 'ABC123',
    });
    expect(item.status).toBe(201);
    expect(item.body.confirmationCode).toBe('ABC123');
    const stored = await owner.db.execute(
      sql`select confirmation_code_encrypted as c from trip_items where id = ${item.body.id}`,
    );
    expect(stored.rows[0]?.c).not.toContain('ABC123');

    const packing = await anna.post(`${base()}/travel/trips/${tripId}/packing-list`, {
      templates: ['beach'],
    });
    expect(packing.status).toBe(201);
    expect(packing.body.list.kind).toBe('packing');
    expect(packing.body.added).toBeGreaterThan(10);
    const again = await anna.post(`${base()}/travel/trips/${tripId}/packing-list`, {
      templates: ['beach', 'camping'],
    });
    expect(again.body.list.id).toBe(packing.body.list.id);
    expect(again.body.added).toBeGreaterThan(0);
    const list = await anna.get(`${base()}/lists/${packing.body.list.id}`);
    const texts = list.body.items.map((i: { text: string }) => i.text);
    expect(texts).toContain('Sonnencreme');
    expect(texts).toContain('Waschmittel');
    expect(texts).toContain('Schwimmflügel');
    expect(new Set(texts).size).toBe(texts.length);

    const account = await anna.post(`${base()}/finance/accounts`, {
      name: 'Giro',
      type: 'checking',
    });
    for (const [amountMinor, tags] of [
      [-45000, [trip.body.financeTag]],
      [5000, [trip.body.financeTag]],
      [-9900, ['other']],
    ] as const) {
      const tx = await anna.post(`${base()}/finance/transactions`, {
        accountId: account.body.id,
        bookingDate: '2026-10-20',
        amountMinor,
        tags,
      });
      expect(tx.status).toBe(201);
    }
    const detail = await anna.get(`${base()}/travel/trips/${tripId}`);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.budget).toMatchObject({
      budgetMinor: 200000,
      spentMinor: 40000,
      remainingMinor: 160000,
      transactionCount: 2,
    });
    const kid = await mia.get(`${base()}/travel/trips/${tripId}`);
    expect(kid.status).toBe(200);
    expect(kid.body.budget).toBeNull();
    expect((await mia.get(`${base()}/travel/trips/${tripId}/budget`)).status).toBe(403);
  });

  it('notifies travellers once shortly before the trip', async () => {
    const travel = stack.app.get(TravelService);
    expect(await travel.notifyUpcoming(new Date('2027-06-20T08:00:00Z'))).toBe(0);
    expect(await travel.notifyUpcoming(new Date('2027-06-28T08:00:00Z'))).toBe(1);
    expect(await travel.notifyUpcoming(new Date('2027-06-29T08:00:00Z'))).toBe(0);
    const notes = await anna.get('/v1/notifications');
    expect(JSON.stringify(notes.body)).toContain('Ostsee');
  });
});

describe('photos & memories', () => {
  let albumId: string;
  const fileIds: string[] = [];

  beforeAll(async () => {
    const rows = [
      {
        name: 'strand.jpg',
        mimeType: 'image/jpeg',
        status: 'ready',
        createdAt: '2024-10-25T12:00:00Z',
      },
      {
        name: 'clip.mp4',
        mimeType: 'video/mp4',
        status: 'ready',
        createdAt: '2025-10-25T09:00:00Z',
      },
      {
        name: 'neu.jpg',
        mimeType: 'image/jpeg',
        status: 'ready',
        createdAt: '2026-10-20T09:00:00Z',
      },
      {
        name: 'scan.pdf',
        mimeType: 'application/pdf',
        status: 'ready',
        createdAt: '2026-10-20T09:00:00Z',
      },
      {
        name: 'upload.jpg',
        mimeType: 'image/jpeg',
        status: 'scanning',
        createdAt: '2026-10-20T09:00:00Z',
      },
    ] as const;
    for (const r of rows) {
      const [f] = await owner.db
        .insert(files)
        .values({
          householdId: hh,
          name: r.name,
          sizeBytes: 1000,
          mimeType: r.mimeType,
          storageKey: `${hh}/${crypto.randomUUID()}`,
          status: r.status,
          ownerMemberId: annaMember,
          createdAt: new Date(r.createdAt),
        })
        .returning({ id: files.id });
      fileIds.push((f as { id: string }).id);
    }
  });

  it('creates albums from ready images and videos only', async () => {
    expect((await mia.post(`${base()}/photos/albums`, { title: 'Meins' })).status).toBe(403);
    const album = await anna.post(`${base()}/photos/albums`, { title: 'Urlaub' });
    expect(album.status).toBe(201);
    albumId = album.body.id;
    const bad = await anna.post(`${base()}/photos/albums/${albumId}/items`, {
      items: [{ fileId: fileIds[3] }],
    });
    expect(bad.status).toBe(400);
    const pending = await anna.post(`${base()}/photos/albums/${albumId}/items`, {
      items: [{ fileId: fileIds[4] }],
    });
    expect(pending.body.code).toBe('invalid_file');
    const added = await anna.post(`${base()}/photos/albums/${albumId}/items`, {
      items: [
        { fileId: fileIds[0], caption: 'Strand' },
        { fileId: fileIds[1] },
        { fileId: fileIds[2] },
      ],
    });
    expect(added.status).toBe(201);
    expect(added.body).toHaveLength(3);

    const detail = await mia.get(`${base()}/photos/albums/${albumId}`);
    expect(detail.body.coverFileId).toBe(fileIds[0]);
    expect(detail.body.items.map((i: { fileName: string }) => i.fileName)).toEqual([
      'strand.jpg',
      'clip.mp4',
      'neu.jpg',
    ]);
    const ids = detail.body.items.map((i: { id: string }) => i.id) as string[];
    const reordered = await anna.put(`${base()}/photos/albums/${albumId}/order`, {
      itemIds: [ids[2], ids[0]],
    });
    expect(reordered.body.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
    const caption = await anna.patch(`${base()}/photos/albums/${albumId}/items/${ids[1]}`, {
      caption: 'Video',
    });
    expect(caption.body.caption).toBe('Video');
    expect((await anna.delete(`${base()}/photos/albums/${albumId}/items/${ids[2]}`)).status).toBe(
      200,
    );
    const albums = await anna.get(`${base()}/photos/albums`);
    expect(albums.body[0]).toMatchObject({ id: albumId, itemCount: 2 });
  });

  it('shows memories from the same day in previous years', async () => {
    const res = await mia.get(`${base()}/photos/memories?date=2026-10-25`);
    expect(res.status).toBe(200);
    expect(res.body.map((m: { year: number; yearsAgo: number }) => [m.year, m.yearsAgo])).toEqual([
      [2025, 1],
      [2024, 2],
    ]);
    expect(res.body[1].items[0].caption).toBe('Strand');
  });

  it('respects private albums', async () => {
    const priv = await anna.post(`${base()}/photos/albums`, {
      title: 'Geheim',
      visibility: 'private',
    });
    expect((await mia.get(`${base()}/photos/albums/${priv.body.id}`)).status).toBe(404);
  });
});

describe('tenant isolation', () => {
  it('hides family data from other households', async () => {
    expect((await mallory.get(`${base()}/meals/recipes`)).status).toBe(404);
    expect((await mallory.get(`${base()}/pinboard/posts`)).status).toBe(404);
    expect((await mallory.get(`${base()}/photos/albums/${crypto.randomUUID()}`)).status).toBe(404);
    const own = `/v1/households/${otherHh}`;
    expect((await mallory.get(`${own}/meals/recipes`)).body).toEqual([]);
    expect((await mallory.get(`${own}/pinboard/posts`)).body.items).toEqual([]);
    expect((await mallory.get(`${own}/travel/trips`)).body).toEqual([]);
    expect((await mallory.get(`${own}/photos/albums`)).body).toEqual([]);
    expect((await mallory.get(`${own}/rewards/balances`)).status).toBe(402);
    expect(
      (await mallory.put(`${own}/meals/plan/2026-11-02/dinner`, { recipeId: crypto.randomUUID() }))
        .status,
    ).toBe(404);
  });
});
