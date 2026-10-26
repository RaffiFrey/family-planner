import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  isPantryStaple,
  mergeIngredients,
  parseIngredient,
  scaleIngredient,
  servingsFactor,
  shoppingLinesForPlan,
  unitLabel,
} from './ingredients.js';
import { ageOn, buildPackingList, packingTemplates, tripNights } from './packing.js';
import { isPollOpen, tallyPoll, validateVoteSelection } from './polls.js';
import {
  cleanText,
  decodeHtmlEntities,
  extractJsonLd,
  extractRecipeFromHtml,
  parseIsoDuration,
} from './recipe-import.js';
import {
  allowanceBalances,
  allowancePeriod,
  canRedeem,
  dueAllowance,
  isoWeekKey,
  isoWeekday,
  leaderboard,
  nextPayday,
  periodRange,
  pointsBalances,
  settlePoints,
  signedAllowanceAmount,
} from './rewards.js';

describe('parseIngredient', () => {
  it.each([
    ['200 g Mehl', 200, 'g', 'Mehl'],
    ['200g Mehl', 200, 'g', 'Mehl'],
    ['2 EL Olivenöl', 2, 'tbsp', 'Olivenöl'],
    ['1 TL Salz', 1, 'tsp', 'Salz'],
    ['1/2 cup sugar', 0.5, 'cup', 'sugar'],
    ['1 1/2 cups of flour', 1.5, 'cup', 'flour'],
    ['½ TL Zimt', 0.5, 'tsp', 'Zimt'],
    ['1½ l Milch', 1.5, 'l', 'Milch'],
    ['1,5 kg Kartoffeln', 1.5, 'kg', 'Kartoffeln'],
    ['3 Eier', 3, null, 'Eier'],
    ['2-3 Zwiebeln', 3, null, 'Zwiebeln'],
    ['1 bis 2 Knoblauchzehen', 2, null, 'Knoblauchzehen'],
    ['2 Zehen Knoblauch', 2, 'clove', 'Knoblauch'],
    ['1 Prise Salz', 1, 'pinch', 'Salz'],
    ['1 Dose Tomaten', 1, 'can', 'Tomaten'],
    ['1 Bund Petersilie', 1, 'bunch', 'Petersilie'],
    ['1 Pck. Backpulver', 1, 'pack', 'Backpulver'],
    ['1 Becher Sahne', 1, 'tub', 'Sahne'],
    ['ca. 500 ml Brühe', 500, 'ml', 'Brühe'],
    ['2 tbsp butter', 2, 'tbsp', 'butter'],
    ['3 tomatoes', 3, null, 'tomatoes'],
    ['8 oz cream cheese', 8, 'oz', 'cream cheese'],
    ['Prise Muskat', null, 'pinch', 'Muskat'],
    ['Salz und Pfeffer', null, null, 'Salz und Pfeffer'],
    ['- 100 g Butter', 100, 'g', 'Butter'],
  ])('%s', (line, quantity, unit, name) => {
    const r = parseIngredient(line);
    expect(r).toMatchObject({ quantity, unit, name });
  });

  it('extracts notes from commas and parentheses', () => {
    expect(parseIngredient('2 Zwiebeln, fein gehackt')).toEqual({
      quantity: 2,
      unit: null,
      name: 'Zwiebeln',
      note: 'fein gehackt',
    });
    expect(parseIngredient('1 Dose (400 g) Kichererbsen')).toMatchObject({
      quantity: 1,
      unit: 'can',
      name: 'Kichererbsen',
      note: '400 g',
    });
  });

  it('does not treat short words without quantity as units', () => {
    expect(parseIngredient('EL Öl')).toMatchObject({ unit: null, name: 'EL Öl' });
  });

  it('never throws and keeps a name', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parseIngredient(s);
        expect(typeof r.name).toBe('string');
      }),
    );
  });
});

describe('quantities, scaling and merging', () => {
  it('formats quantities per locale', () => {
    expect(formatQuantity(1.5, 'tbsp', 'de')).toBe('1,5 EL');
    expect(formatQuantity(1.5, 'tbsp', 'en')).toBe('1.5 tbsp');
    expect(formatQuantity(3, null)).toBe('3');
    expect(formatQuantity(null, 'pinch')).toBe('Prise');
    expect(formatQuantity(null, null)).toBeNull();
    expect(unitLabel('piece', 'en')).toBe('pc');
  });

  it('scales by servings', () => {
    expect(servingsFactor(4, 6)).toBe(1.5);
    expect(servingsFactor(null, 6)).toBe(1);
    expect(servingsFactor(4, 0)).toBe(1);
    expect(scaleIngredient(parseIngredient('200 g Mehl'), 1.5).quantity).toBe(300);
    expect(scaleIngredient(parseIngredient('Salz'), 2).quantity).toBeNull();
  });

  it('merges same ingredient and compatible units', () => {
    const merged = mergeIngredients([
      parseIngredient('600 g Mehl'),
      parseIngredient('0,5 kg mehl'),
      parseIngredient('1 Dose Tomaten'),
      parseIngredient('2 Dosen Tomaten'),
      parseIngredient('250 ml Milch'),
      parseIngredient('1 l Milch'),
      parseIngredient('2 Eier'),
      parseIngredient('1 Stück Eier'),
      parseIngredient('Mehl'),
      parseIngredient('Basilikum'),
      parseIngredient('Basilikum'),
      parseIngredient('1 TL Zucker'),
      parseIngredient('1 EL Zucker'),
      parseIngredient('333.3333 g Reis'),
    ]);
    expect(merged).toEqual([
      { name: 'Mehl', quantity: 1.1, unit: 'kg' },
      { name: 'Tomaten', quantity: 3, unit: 'can' },
      { name: 'Milch', quantity: 1.25, unit: 'l' },
      { name: 'Eier', quantity: 3, unit: null },
      { name: 'Zucker', quantity: 1, unit: 'tsp' },
      { name: 'Zucker', quantity: 1, unit: 'tbsp' },
      { name: 'Reis', quantity: 334, unit: 'g' },
      { name: 'Basilikum', quantity: null, unit: null },
    ]);
  });

  it('recognises pantry staples', () => {
    expect(isPantryStaple('Salz')).toBe(true);
    expect(isPantryStaple('Salz und Pfeffer')).toBe(true);
    expect(isPantryStaple('frisch gemahlener schwarzer Pfeffer')).toBe(true);
    expect(isPantryStaple('extra virgin olive oil')).toBe(true);
    expect(isPantryStaple('lauwarmes Wasser')).toBe(true);
    expect(isPantryStaple('red bell pepper')).toBe(false);
    expect(isPantryStaple('Mehl')).toBe(false);
  });

  it('builds shopping lines for a plan', () => {
    const recipe = ['400 g Spaghetti', '1 Dose Tomaten', '1 Prise Salz', '2 EL Olivenöl'].map(
      parseIngredient,
    );
    const lines = shoppingLinesForPlan(
      [
        { ingredients: recipe, recipeServings: 4, plannedServings: 2 },
        { ingredients: recipe, recipeServings: 4, plannedServings: 4 },
      ],
      { skipStaples: true },
    );
    expect(lines).toEqual([
      { name: 'Spaghetti', quantity: 600, unit: 'g', text: 'Spaghetti', quantityText: '600 g' },
      { name: 'Tomaten', quantity: 1.5, unit: 'can', text: 'Tomaten', quantityText: '1,5 Dose' },
    ]);
    expect(
      shoppingLinesForPlan([{ ingredients: recipe, recipeServings: 4, plannedServings: null }], {
        locale: 'en',
      }),
    ).toHaveLength(4);
  });
});

const HTML_GRAPH = `<!doctype html><html><head>
<script type="application/ld+json">{ not json </script>
<script type='application/ld+json'>
{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Kochseite"},
  {"@type":["Recipe","NewsArticle"],"name":"Spaghetti &amp; Tomatensoße",
   "description":"<p>Schnell &amp; einfach</p>",
   "recipeYield":["4","4 Portionen"],"prepTime":"PT15M","totalTime":"PT45M",
   "recipeIngredient":["400 g Spaghetti","1 Dose Tomaten","2 EL Olivenöl"],
   "recipeInstructions":[{"@type":"HowToSection","name":"Soße","itemListElement":[
     {"@type":"HowToStep","text":"Tomaten köcheln."}]},
     {"@type":"HowToStep","text":"Nudeln kochen."},"Servieren."],
   "keywords":"Pasta, schnell","recipeCategory":"Hauptgericht","recipeCuisine":["Italienisch"],
   "image":{"@type":"ImageObject","url":"https://example.com/p.jpg"}}
]}
</script></head><body></body></html>`;

const HTML_PLAIN = `<script type="application/ld+json">
[{"@type":"Organization"},{"@context":"http://schema.org","@type":"http://schema.org/Recipe","name":"Pancakes",
"recipeYield":2,"cookTime":"PT10M","recipeIngredient":["1 1/2 cups flour","1 tbsp sugar"],
"recipeInstructions":"<p>Mix.</p><p>Fry.</p>","image":["https://example.com/a.jpg"]}]
</script>`;

describe('recipe import', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90);
    expect(parseIsoDuration('P0DT45M')).toBe(45);
    expect(parseIsoDuration('PT90S')).toBe(2);
    expect(parseIsoDuration('P1D')).toBe(1440);
    expect(parseIsoDuration('PT0,5H')).toBe(30);
    expect(parseIsoDuration('P1W')).toBe(10_080);
    expect(parseIsoDuration('30 min')).toBeNull();
    expect(parseIsoDuration('P')).toBeNull();
    expect(parseIsoDuration('PT')).toBeNull();
    expect(parseIsoDuration(42)).toBeNull();
  });

  it('decodes entities and strips tags', () => {
    expect(decodeHtmlEntities('a &amp; b &#228; &#xFC; &auml; &unknown; &#99999999;')).toBe(
      'a & b ä ü ä &unknown; &#99999999;',
    );
    expect(cleanText('<b>Hallo</b><br/>Welt  ')).toBe('Hallo Welt');
  });

  it('extracts a recipe from an @graph block', () => {
    const r = extractRecipeFromHtml(HTML_GRAPH, 'https://example.com/r');
    expect(r).toMatchObject({
      title: 'Spaghetti & Tomatensoße',
      description: 'Schnell & einfach',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 30,
      steps: ['Tomaten köcheln.', 'Nudeln kochen.', 'Servieren.'],
      tags: ['Hauptgericht', 'Italienisch', 'Pasta', 'schnell'],
      imageUrl: 'https://example.com/p.jpg',
      sourceUrl: 'https://example.com/r',
    });
    expect(r?.ingredients[2]).toMatchObject({ quantity: 2, unit: 'tbsp', name: 'Olivenöl' });
  });

  it('extracts a recipe from a top-level array with string instructions', () => {
    const r = extractRecipeFromHtml(HTML_PLAIN);
    expect(r).toMatchObject({
      title: 'Pancakes',
      servings: 2,
      prepMinutes: null,
      cookMinutes: 10,
      steps: ['Mix.', 'Fry.'],
      imageUrl: 'https://example.com/a.jpg',
      sourceUrl: null,
    });
    expect(r?.ingredients[0]).toMatchObject({ quantity: 1.5, unit: 'cup', name: 'flour' });
  });

  it('handles mainEntity, comments and pages without recipes', () => {
    const wrapped = `<script type="application/ld+json"><!--{"@type":"WebPage","mainEntity":{"@type":"Recipe","name":"Suppe","recipeYield":"für 3 Personen","ingredients":["1 l Wasser"]}}--></script>`;
    expect(extractRecipeFromHtml(wrapped)).toMatchObject({ title: 'Suppe', servings: 3 });
    expect(extractRecipeFromHtml('<html></html>')).toBeNull();
    expect(extractJsonLd('<script type="application/ld+json">{"a":"x\ny"}</script>')).toEqual([
      { a: 'x y' },
    ]);
    const noName = `<script type="application/ld+json">{"@type":"Recipe","headline":{"@value":"Kuchen"},"recipeInstructions":[{"name":"Backen"}],"image":[{"contentUrl":"https://x/y.png"}]}</script>`;
    expect(extractRecipeFromHtml(noName)).toMatchObject({
      title: 'Kuchen',
      steps: ['Backen'],
      imageUrl: 'https://x/y.png',
      servings: null,
    });
  });
});

describe('packing', () => {
  it('lists templates', () => {
    expect(packingTemplates('en').map((t) => t.key)).toContain('ski');
    expect(packingTemplates()[0]).toEqual({ key: 'basics', name: 'Grundausstattung' });
  });

  it('computes nights and ages', () => {
    expect(tripNights('2026-07-01', '2026-07-08')).toBe(7);
    expect(tripNights('2026-07-08', '2026-07-01')).toBe(0);
    expect(ageOn('2020-07-10', '2026-07-09')).toBe(5);
    expect(ageOn('2020-07-10', '2026-07-10')).toBe(6);
    expect(ageOn('2027-01-01', '2026-07-10')).toBe(0);
  });

  it('builds a list filtered by ages and length', () => {
    const items = buildPackingList({
      templates: ['beach', 'baby'],
      nights: 3,
      travellers: [{ age: 38 }, { age: 36 }, { age: 1 }],
    });
    const byText = new Map(items.map((i) => [i.text, i]));
    expect(byText.get('Unterwäsche')?.quantity).toBe('12');
    expect(byText.get('Windeln')).toMatchObject({ quantity: '1', category: 'baby' });
    expect(byText.get('Badesachen')?.quantity).toBe('3');
    expect(byText.get('Schwimmflügel')?.quantity).toBe('1');
    expect(byText.has('Waschmittel')).toBe(false);
    expect(items.filter((i) => i.text === 'Mückenschutz')).toHaveLength(1);

    const adults = buildPackingList({
      templates: ['ski', 'baby'],
      nights: 10,
      travellers: [{ age: 40 }],
      locale: 'en',
    });
    const texts = adults.map((i) => i.text);
    expect(texts).toContain('Laundry detergent');
    expect(texts).not.toContain('Nappies');
    expect(texts).not.toContain('Sledge');
    expect(adults.find((i) => i.text === 'Underwear')?.quantity).toBe('8');

    const unknown = buildPackingList({ templates: ['camping'], nights: 0, travellers: [] });
    expect(unknown.find((i) => i.text === 'Schlafsack')?.quantity).toBe('1');
    expect(unknown.some((i) => i.text === 'Kuscheltier')).toBe(true);
  });
});

describe('points', () => {
  const a = 'a';
  const b = 'b';
  const c = 'c';

  it('settles balances against pending redemptions', () => {
    const entries = [
      { memberId: a, delta: 10 },
      { memberId: a, delta: 5 },
      { memberId: b, delta: 3 },
      { memberId: a, delta: -4 },
    ];
    expect(pointsBalances(entries).get(a)).toBe(11);
    const accounts = settlePoints([a, b, c], entries, [{ memberId: a, cost: 6 }]);
    expect(accounts).toEqual([
      { memberId: a, points: 11, reserved: 6, available: 5 },
      { memberId: b, points: 3, reserved: 0, available: 3 },
      { memberId: c, points: 0, reserved: 0, available: 0 },
    ]);
    expect(canRedeem(accounts[0] as { available: number }, 5)).toBe(true);
    expect(canRedeem(accounts[0] as { available: number }, 6)).toBe(false);
  });

  it('ranks the leaderboard with ties', () => {
    const at = new Date('2026-10-20T10:00:00Z');
    const from = new Date('2026-10-19T00:00:00Z');
    const to = new Date('2026-10-26T00:00:00Z');
    const rows = leaderboard(
      [
        { memberId: a, delta: 5, at },
        { memberId: b, delta: 5, at },
        { memberId: a, delta: -5, at },
        { memberId: c, delta: 2, at },
        { memberId: c, delta: 50, at: new Date('2026-10-01T00:00:00Z') },
        { memberId: c, delta: 50 },
      ],
      from,
      to,
      [a, b, c, 'd'],
    );
    expect(rows).toEqual([
      { memberId: a, points: 5, rank: 1 },
      { memberId: b, points: 5, rank: 1 },
      { memberId: c, points: 2, rank: 3 },
      { memberId: 'd', points: 0, rank: 4 },
    ]);
  });

  it('computes week and month ranges in a zone', () => {
    const now = new Date('2026-10-25T21:30:00Z'); // Sunday 22:30 in Berlin (CET)
    const week = periodRange('week', now, 'Europe/Berlin');
    expect(week.startDate).toBe('2026-10-19');
    expect(week.endDate).toBe('2026-10-25');
    expect(week.start.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    const month = periodRange('month', now, 'Europe/Berlin');
    expect(month.startDate).toBe('2026-10-01');
    expect(month.endDate).toBe('2026-10-31');
    expect(month.end.toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });
});

describe('allowance', () => {
  it('computes ISO weekdays and week keys', () => {
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekKey('2026-10-25')).toBe('2026-W43');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
  });

  it('schedules weekly payouts', () => {
    const rule = { interval: 'weekly' as const, weekday: 6, startsOn: '2026-10-01' };
    expect(allowancePeriod(rule, '2026-10-21')).toEqual({
      periodKey: '2026-W43',
      payday: '2026-10-24',
    });
    expect(dueAllowance(rule, '2026-10-23')).toBeNull();
    expect(dueAllowance(rule, '2026-10-24')).toEqual({
      periodKey: '2026-W43',
      payday: '2026-10-24',
    });
    expect(dueAllowance(rule, '2026-10-25')?.periodKey).toBe('2026-W43');
    expect(dueAllowance({ ...rule, startsOn: '2026-10-25' }, '2026-10-25')).toBeNull();
    expect(nextPayday(rule, '2026-10-25')).toBe('2026-10-31');
    expect(nextPayday(rule, '2026-10-22')).toBe('2026-10-24');
    expect(nextPayday({ ...rule, startsOn: '2026-12-01' }, '2026-10-22')).toBe('2026-12-05');
    expect(
      allowancePeriod({ interval: 'weekly', startsOn: '2026-01-01' }, '2026-10-21').payday,
    ).toBe('2026-10-19');
  });

  it('schedules monthly payouts clamped to month end', () => {
    const rule = { interval: 'monthly' as const, dayOfMonth: 31, startsOn: '2026-01-01' };
    expect(allowancePeriod(rule, '2026-02-10')).toEqual({
      periodKey: '2026-02',
      payday: '2026-02-28',
    });
    expect(dueAllowance(rule, '2026-02-28')?.periodKey).toBe('2026-02');
    expect(dueAllowance(rule, '2026-03-30')).toBeNull();
    expect(nextPayday(rule, '2026-03-30')).toBe('2026-03-31');
    expect(nextPayday({ ...rule, dayOfMonth: 1 }, '2026-03-30')).toBe('2026-04-01');
    expect(
      allowancePeriod({ interval: 'monthly', startsOn: '2026-01-01' }, '2026-05-17').payday,
    ).toBe('2026-05-01');
  });

  it('sums the ledger with signed kinds', () => {
    expect(signedAllowanceAmount('payout', -500)).toBe(500);
    expect(signedAllowanceAmount('bonus', 200)).toBe(200);
    expect(signedAllowanceAmount('expense', 300)).toBe(-300);
    expect(signedAllowanceAmount('correction', -50)).toBe(-50);
    expect(
      allowanceBalances([
        { memberId: 'a', amountMinor: 500 },
        { memberId: 'a', amountMinor: -120 },
        { memberId: 'b', amountMinor: 100 },
      ]),
    ).toEqual(
      new Map([
        ['a', 380],
        ['b', 100],
      ]),
    );
  });
});

describe('polls', () => {
  it('tallies votes and hides voters when anonymous', () => {
    const votes = [
      { memberId: 'a', optionIndex: 0 },
      { memberId: 'b', optionIndex: 0 },
      { memberId: 'b', optionIndex: 1 },
      { memberId: 'c', optionIndex: 7 },
    ];
    const open = tallyPoll(2, votes, false);
    expect(open).toEqual({
      options: [
        { index: 0, votes: 2, memberIds: ['a', 'b'] },
        { index: 1, votes: 1, memberIds: ['b'] },
      ],
      totalVotes: 3,
      totalVoters: 2,
    });
    expect(tallyPoll(2, votes, true).options[0]?.memberIds).toEqual([]);
  });

  it('validates selections', () => {
    expect(validateVoteSelection([], 3, false)).toMatch(/at least/);
    expect(validateVoteSelection([1, 1], 3, true)).toMatch(/Duplicate/);
    expect(validateVoteSelection([3], 3, true)).toMatch(/Unknown/);
    expect(validateVoteSelection([0, 1], 3, false)).toMatch(/one option/);
    expect(validateVoteSelection([0, 2], 3, true)).toBeNull();
  });

  it('knows whether a poll is open', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(isPollOpen({ closesAt: null, closedAt: null }, now)).toBe(true);
    expect(isPollOpen({ closesAt: new Date('2026-10-25T11:00:00Z'), closedAt: null }, now)).toBe(
      false,
    );
    expect(isPollOpen({ closesAt: null, closedAt: now }, now)).toBe(false);
  });
});
