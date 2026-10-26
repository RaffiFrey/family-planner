import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type CaptureContext,
  findCategory,
  parseDecimalAmount,
  toolCallsToActions,
  toolCallToAction,
} from './actions.js';
import {
  AssistantInputError,
  addDaysToLocalDate,
  checkLocalDate,
  dateContext,
  localDateTimeToInstant,
  parseLocalTime,
} from './dates.js';
import { summarizeSpending } from './insights.js';
import { remainingQuota, retentionCutoff } from './limits.js';
import { annotatePantry, inPantry, MAX_PANTRY_ITEMS, normalizeIngredients } from './meals.js';
import { normalizeName, resolveMembers, resolveName } from './names.js';
import { normalizeReceipt } from './receipt.js';

const ANNA = '00000000-0000-7000-8000-00000000000a';
const BEN = '00000000-0000-7000-8000-00000000000b';
const MIA = '00000000-0000-7000-8000-00000000000c';
const CAL = '00000000-0000-7000-8000-0000000000c1';
const CAL2 = '00000000-0000-7000-8000-0000000000c2';
const SHOP = '00000000-0000-7000-8000-0000000000d1';
const TODO = '00000000-0000-7000-8000-0000000000d2';
const GIRO = '00000000-0000-7000-8000-0000000000e1';
const GROC = '00000000-0000-7000-8000-0000000000f1';
const SALARY = '00000000-0000-7000-8000-0000000000f2';

// Saturday 2026-10-24, 10:00 in Berlin (CEST, +02:00).
const NOW = new Date('2026-10-24T08:00:00Z');

const ctx: CaptureContext = {
  now: NOW,
  timeZone: 'Europe/Berlin',
  currency: 'EUR',
  selfMemberId: ANNA,
  members: [
    { id: ANNA, name: 'Anna Frey' },
    { id: BEN, name: 'Ben' },
    { id: MIA, name: 'Mia' },
  ],
  calendars: [
    { id: CAL, name: 'Familie' },
    { id: CAL2, name: 'Arbeit' },
  ],
  lists: [
    { id: SHOP, name: 'Einkauf', kind: 'shopping' },
    { id: TODO, name: 'Baumarkt', kind: 'todo' },
  ],
  categories: [
    { id: GROC, name: 'Lebensmittel', key: 'groceries', kind: 'expense' },
    { id: SALARY, name: 'Gehalt', key: 'salary', kind: 'income' },
  ],
  accounts: [{ id: GIRO, name: 'Girokonto', currency: 'EUR' }],
  defaultCalendarId: CAL,
};

describe('names', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeName('  Jürgen-Groß ')).toBe('jurgen gross');
    expect(normalizeName('ÉMILE')).toBe('emile');
  });

  it('resolves by full name, first name and unique prefix', () => {
    expect(resolveName('anna frey', ctx.members)?.id).toBe(ANNA);
    expect(resolveName('Anna', ctx.members)?.id).toBe(ANNA);
    expect(resolveName('Mi', ctx.members)?.id).toBe(MIA);
    expect(resolveName('', ctx.members)).toBeNull();
    expect(resolveName('Zoe', ctx.members)).toBeNull();
    expect(resolveName('M', ctx.members)).toBeNull(); // too short for a prefix
  });

  it('refuses ambiguous names', () => {
    const refs = [
      { id: '1', name: 'Max Müller' },
      { id: '2', name: 'Max Meier' },
    ];
    expect(resolveName('Max', refs)).toBeNull();
    expect(resolveName('Max Meier', refs)?.id).toBe('2');
  });

  it('resolves self words and reports unknown names', () => {
    expect(resolveMembers(['ich', 'Ben', 'ben', 'Zoe'], ctx.members, ANNA)).toEqual({
      ids: [ANNA, BEN],
      unknown: ['Zoe'],
    });
    expect(resolveMembers(['me'], ctx.members).unknown).toEqual(['me']);
  });
});

describe('dates', () => {
  it('parses times and dates', () => {
    expect(parseLocalTime('9:05')).toEqual({ hour: 9, minute: 5 });
    expect(() => parseLocalTime('25:00')).toThrow(AssistantInputError);
    expect(checkLocalDate('2026-02-28')).toBe('2026-02-28');
    expect(() => checkLocalDate('2026-02-30')).toThrow(/Invalid date/);
    expect(addDaysToLocalDate('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('resolves wall time across DST', () => {
    expect(localDateTimeToInstant('2026-10-24', '15:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-24T13:00:00.000Z',
    );
    expect(localDateTimeToInstant('2026-10-27', '15:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-27T14:00:00.000Z',
    );
  });

  it('builds a weekday cheat sheet', () => {
    const text = dateContext(NOW, 'Europe/Berlin', 'de', 3);
    expect(text).toContain('Now: 2026-10-24 10:00 (Europe/Berlin)');
    expect(text).toContain('2026-10-24 Samstag (today)');
    expect(text).toContain('2026-10-27 Dienstag');
    expect(text.split('\n')).toHaveLength(5);
    expect(dateContext(NOW, 'Europe/Berlin', 'en')).toContain('2026-11-03 Tuesday');
  });
});

describe('tool calls → actions', () => {
  it('creates a timed event with attendees', () => {
    const a = toolCallToAction(
      {
        name: 'create_event',
        input: {
          title: ' Zahnarzt ',
          date: '2026-10-27',
          startTime: '15:00',
          attendees: ['Mia', 'ich'],
          reminderMinutes: [60, 60, -5],
          location: 'Praxis',
        },
      },
      ctx,
    );
    expect(a).toEqual({
      type: 'create_event',
      calendarId: CAL,
      title: 'Zahnarzt',
      description: null,
      location: 'Praxis',
      start: '2026-10-27T14:00:00.000Z',
      end: '2026-10-27T15:00:00.000Z',
      allDay: false,
      timezone: 'Europe/Berlin',
      rrule: null,
      attendeeMemberIds: [MIA, ANNA],
      reminders: [60],
    });
  });

  it('handles all-day, end times past midnight, durations and calendars', () => {
    const allDay = toolCallToAction(
      { name: 'create_event', input: { title: 'Ferien', date: '2026-10-30', calendar: 'arbeit' } },
      ctx,
    );
    expect(allDay).toMatchObject({
      allDay: true,
      calendarId: CAL2,
      start: '2026-10-30T00:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
    });
    const late = toolCallToAction(
      {
        name: 'create_event',
        input: { title: 'Party', date: '2026-10-30', startTime: '22:00', endTime: '01:00' },
      },
      ctx,
    );
    expect(late).toMatchObject({
      start: '2026-10-30T21:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
    });
    const timed = toolCallToAction(
      {
        name: 'create_event',
        input: {
          title: 'Sport',
          date: '2026-10-26',
          startTime: '18:00',
          endTime: '19:30',
          rrule: 'RRULE:freq=weekly;byday=MO',
        },
      },
      ctx,
    );
    expect(timed).toMatchObject({ end: '2026-10-26T18:30:00.000Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    const dur = toolCallToAction(
      {
        name: 'create_event',
        input: { title: 'Call', date: '2026-10-26', startTime: '09:00', durationMinutes: 30 },
      },
      ctx,
    );
    expect(dur).toMatchObject({ end: '2026-10-26T08:30:00.000Z' });
  });

  it('rejects unknown references and bad input', () => {
    const bad = (input: Record<string, unknown>, code: string) => {
      try {
        toolCallToAction(
          { name: 'create_event', input: { title: 'x', date: '2026-10-26', ...input } },
          ctx,
        );
        expect.unreachable();
      } catch (e) {
        expect((e as AssistantInputError).code).toBe(code);
      }
    };
    bad({ attendees: ['Zoe'] }, 'unknown_member');
    bad({ calendar: 'Schule' }, 'unknown_calendar');
    bad({ rrule: 'FREQ=HOURLY' }, 'invalid_recurrence');
    bad({ startTime: '09:00', durationMinutes: -1 }, 'invalid_input');
    bad({ date: 'morgen' }, 'invalid_date');
    expect(() =>
      toolCallToAction(
        { name: 'create_event', input: { title: 'x', date: '2026-10-26' } },
        { ...ctx, defaultCalendarId: null },
      ),
    ).toThrow(/No calendar/);
  });

  it('creates rotating floating chores due today by default', () => {
    const a = toolCallToAction(
      {
        name: 'create_task',
        input: {
          title: 'Blumen gießen',
          repeat: { kind: 'interval', every: 3, unit: 'day' },
          rotation: ['Anna', 'Ben'],
        },
      },
      ctx,
    );
    expect(a).toEqual({
      type: 'create_task',
      title: 'Blumen gießen',
      notes: null,
      dueAt: '2026-10-24T16:00:00.000Z',
      assigneeMemberId: ANNA,
      recurrence: { mode: 'floating', interval: 3, unit: 'day' },
      rotationMemberIds: [ANNA, BEN],
      points: 0,
    });
  });

  it('creates fixed tasks, plain tasks and validates recurrence', () => {
    const fixed = toolCallToAction(
      {
        name: 'create_task',
        input: {
          title: 'Müll',
          dueDate: '2026-10-26',
          dueTime: '07:00',
          assignee: 'Ben',
          repeat: { kind: 'rrule', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
          points: 5,
        },
      },
      ctx,
    );
    expect(fixed).toMatchObject({
      dueAt: '2026-10-26T06:00:00.000Z',
      assigneeMemberId: BEN,
      recurrence: { mode: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
      points: 5,
    });
    const plain = toolCallToAction(
      { name: 'create_task', input: { title: 'Steuer', points: 5000 } },
      ctx,
    );
    expect(plain).toMatchObject({
      dueAt: null,
      recurrence: null,
      assigneeMemberId: null,
      points: 0,
    });
    const timeOnly = toolCallToAction(
      { name: 'create_task', input: { title: 'x', dueTime: '20:00' } },
      ctx,
    );
    expect(timeOnly).toMatchObject({ dueAt: '2026-10-24T18:00:00.000Z' });
    expect(() =>
      toolCallToAction(
        {
          name: 'create_task',
          input: { title: 'x', repeat: { kind: 'interval', every: 0, unit: 'day' } },
        },
        ctx,
      ),
    ).toThrow(/interval/);
  });

  it('adds list items to named or default shopping lists', () => {
    expect(
      toolCallToAction(
        {
          name: 'add_list_items',
          input: { items: [{ text: ' Milch ' }, { text: 'Eier', quantity: '10' }, { text: ' ' }] },
        },
        ctx,
      ),
    ).toEqual({
      type: 'add_list_items',
      listId: SHOP,
      items: [
        { text: 'Milch', quantity: null },
        { text: 'Eier', quantity: '10' },
      ],
    });
    expect(
      toolCallToAction(
        { name: 'add_list_items', input: { list: 'Einkaufsliste', items: [{ text: 'Brot' }] } },
        ctx,
      ),
    ).toMatchObject({ listId: SHOP });
    expect(
      toolCallToAction(
        { name: 'add_list_items', input: { list: 'baumarkt', items: [{ text: 'Schrauben' }] } },
        ctx,
      ),
    ).toMatchObject({ listId: TODO });
    expect(() =>
      toolCallToAction(
        { name: 'add_list_items', input: { list: 'Urlaub', items: [{ text: 'x' }] } },
        ctx,
      ),
    ).toThrow(/Unknown list/);
    expect(() => toolCallToAction({ name: 'add_list_items', input: { items: [] } }, ctx)).toThrow(
      /No items/,
    );
  });

  it('creates transactions with account and category inference', () => {
    expect(
      toolCallToAction(
        {
          name: 'create_transaction',
          input: { amount: '12,49', direction: 'expense', merchant: 'Rewe', category: 'groceries' },
        },
        ctx,
      ),
    ).toEqual({
      type: 'create_transaction',
      accountId: GIRO,
      bookingDate: '2026-10-24',
      amountMinor: -1249,
      currency: 'EUR',
      counterpartyName: 'Rewe',
      categoryId: GROC,
      purpose: 'Rewe',
    });
    expect(
      toolCallToAction(
        {
          name: 'create_transaction',
          input: {
            amount: '3000',
            direction: 'income',
            date: '2026-10-01',
            category: 'Gehalt',
            account: 'giro',
            note: 'Oktober',
          },
        },
        ctx,
      ),
    ).toMatchObject({
      amountMinor: 300000,
      accountId: GIRO,
      categoryId: SALARY,
      purpose: 'Oktober',
    });
    expect(
      toolCallToAction(
        {
          name: 'create_transaction',
          input: { amount: '5', direction: 'expense', currency: 'chf' },
        },
        ctx,
      ),
    ).toMatchObject({ accountId: null, currency: 'CHF', purpose: '' });
    expect(() =>
      toolCallToAction(
        {
          name: 'create_transaction',
          input: { amount: '5', direction: 'expense', account: 'Depot' },
        },
        ctx,
      ),
    ).toThrow(/Unknown account/);
    expect(() =>
      toolCallToAction(
        { name: 'create_transaction', input: { amount: '0,00', direction: 'expense' } },
        ctx,
      ),
    ).toThrow(/zero/);
  });

  it('collects issues per tool call', () => {
    const r = toolCallsToActions(
      [
        { name: 'add_list_items', input: { items: [{ text: 'Milch' }] } },
        { name: 'create_task', input: { title: 'x', assignee: 'Zoe' } },
      ],
      ctx,
    );
    expect(r.actions).toHaveLength(1);
    expect(r.issues).toEqual([
      {
        index: 1,
        tool: 'create_task',
        code: 'unknown_member',
        message: 'Unknown household member: Zoe',
      },
    ]);
    expect(() => toolCallsToActions([{ name: 'create_event', input: null as never }], ctx)).toThrow(
      TypeError,
    );
  });

  it('finds categories by key or name', () => {
    expect(findCategory(null, ctx.categories, 'expense')).toBeNull();
    expect(findCategory('salary', ctx.categories, 'expense')?.id).toBe(SALARY);
    expect(findCategory('unbekannt', ctx.categories, 'expense')).toBeNull();
  });
});

describe('amount parsing', () => {
  it('accepts German and English notation', () => {
    expect(parseDecimalAmount('12,49', 'EUR')).toBe(1249);
    expect(parseDecimalAmount('12.49', 'EUR')).toBe(1249);
    expect(parseDecimalAmount('1.234,56', 'EUR')).toBe(123456);
    expect(parseDecimalAmount('1,234.56', 'EUR')).toBe(123456);
    expect(parseDecimalAmount('1.234', 'EUR')).toBe(123400);
    expect(parseDecimalAmount('1,234', 'EUR')).toBe(123400);
    expect(parseDecimalAmount('-7,5', 'EUR')).toBe(750);
    expect(parseDecimalAmount('12 €', 'EUR')).toBe(1200);
    expect(() => parseDecimalAmount('abc', 'EUR')).toThrow(/Invalid amount/);
    expect(() => parseDecimalAmount('1', 'XYZ')).toThrow(/Unsupported currency/);
  });

  it('round-trips cents in both notations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999 }), (cents) => {
        const en = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
        expect(parseDecimalAmount(en, 'EUR')).toBe(cents);
        expect(parseDecimalAmount(en.replace('.', ','), 'EUR')).toBe(cents);
      }),
    );
  });
});

describe('receipt', () => {
  const opts = {
    now: NOW,
    timeZone: 'Europe/Berlin',
    currency: 'EUR',
    categoryKeys: ['groceries'],
  };

  it('normalizes amounts, dates and categories', () => {
    const r = normalizeReceipt(
      {
        merchant: ' REWE ',
        date: '2026-10-23',
        total: '23,47',
        currency: null,
        lineItems: [
          { description: 'Milch', quantity: 2, amount: '2,58' },
          { description: 'Pfand', quantity: -1, amount: '0.25' },
          { description: ' ', quantity: null, amount: '1' },
          { description: 'Kaputt', quantity: null, amount: '??' },
        ],
        categoryKey: 'Groceries',
      },
      opts,
    );
    expect(r.receipt).toEqual({
      merchant: 'REWE',
      date: '2026-10-23',
      totalMinor: 2347,
      currency: 'EUR',
      lineItems: [
        { description: 'Milch', quantity: 2, amountMinor: 258 },
        { description: 'Pfand', quantity: null, amountMinor: 25 },
      ],
      suggestedCategoryKey: 'groceries',
    });
    expect(r.warnings).toEqual(['Skipped line item "Kaputt"']);
  });

  it('defaults missing data and rejects zero totals', () => {
    const base = {
      merchant: null,
      total: '5.00',
      currency: 'chf',
      lineItems: [],
      categoryKey: 'cars',
    };
    const a = normalizeReceipt({ ...base, date: null }, opts);
    expect(a.receipt).toMatchObject({
      date: '2026-10-24',
      currency: 'CHF',
      suggestedCategoryKey: null,
      merchant: null,
    });
    expect(a.warnings).toEqual(['No date found']);
    const b = normalizeReceipt({ ...base, date: '24.10.2026' }, opts);
    expect(b.warnings).toEqual(['Unreadable date "24.10.2026"']);
    expect(() => normalizeReceipt({ ...base, date: null, total: '0' }, opts)).toThrow(/zero/);
  });
});

describe('spending insights', () => {
  it('aggregates top categories, changes and highlights', () => {
    const s = summarizeSpending({
      currency: 'EUR',
      cashflow: [
        { month: '2026-08', incomeMinor: 300000, expenseMinor: 100000, netMinor: 200000 },
        { month: '2026-09', incomeMinor: 300000, expenseMinor: 100000, netMinor: 200000 },
        { month: '2026-10', incomeMinor: 300000, expenseMinor: 160000, netMinor: 140000 },
      ],
      byMonth: [
        {
          month: '2026-08',
          rows: [
            { categoryId: 'g', incomeMinor: 0, expenseMinor: 40000, count: 4 },
            { categoryId: 'r', incomeMinor: 0, expenseMinor: 60000, count: 1 },
          ],
        },
        {
          month: '2026-09',
          rows: [
            { categoryId: 'g', incomeMinor: 0, expenseMinor: 40000, count: 4 },
            { categoryId: 'r', incomeMinor: 0, expenseMinor: 60000, count: 1 },
            { categoryId: 'x', incomeMinor: 0, expenseMinor: 500, count: 1 },
          ],
        },
        {
          month: '2026-10',
          rows: [
            { categoryId: 'g', incomeMinor: 0, expenseMinor: 100000, count: 9 },
            { categoryId: 'r', incomeMinor: 0, expenseMinor: 30000, count: 1 },
            { categoryId: null, incomeMinor: 300000, expenseMinor: 30000, count: 2 },
          ],
        },
      ],
      categoryNames: { g: 'Lebensmittel', r: 'Miete', x: 'Kino' },
    });
    expect(s.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(s.totalExpenseMinor).toBe(360000);
    expect(s.avgMonthlyExpenseMinor).toBe(120000);
    expect(s.savingsRatePercent).toBe(60);
    expect(s.topCategories[0]).toEqual({ name: 'Lebensmittel', expenseMinor: 180000, percent: 50 });
    expect(s.changes.map((c) => [c.name, c.percent])).toEqual([
      ['Lebensmittel', 150],
      ['Miete', -50],
    ]);
    expect(s.highlights.map((h) => h.kind)).toEqual([
      'top_category',
      'increase',
      'decrease',
      'savings_rate',
    ]);
  });

  it('flags negative months and handles empty input', () => {
    const neg = summarizeSpending({
      currency: 'EUR',
      cashflow: [{ month: '2026-10', incomeMinor: 1000, expenseMinor: 5000, netMinor: -4000 }],
      byMonth: [
        {
          month: '2026-10',
          rows: [{ categoryId: 'g', incomeMinor: 0, expenseMinor: 5000, count: 1 }],
        },
      ],
      categoryNames: {},
    });
    expect(neg.topCategories[0]?.name).toBe('Uncategorized');
    expect(neg.highlights.at(-1)).toEqual({ kind: 'net_negative', amountMinor: -4000 });
    const empty = summarizeSpending({
      currency: 'EUR',
      cashflow: [],
      byMonth: [],
      categoryNames: {},
    });
    expect(empty).toMatchObject({
      avgMonthlyExpenseMinor: 0,
      savingsRatePercent: null,
      highlights: [],
    });
  });
});

describe('meals', () => {
  it('normalizes the pantry', () => {
    expect(normalizeIngredients([' Eier ', 'eier', 'Spaghetti  Nr. 5', ''])).toEqual([
      'Eier',
      'Spaghetti Nr. 5',
    ]);
    expect(normalizeIngredients(Array.from({ length: 80 }, (_, i) => `x${i}`))).toHaveLength(
      MAX_PANTRY_ITEMS,
    );
  });

  it('marks pantry ingredients and missing ones', () => {
    expect(inPantry('2 Eier', ['Ei'])).toBe(true);
    expect(inPantry('200 g Spaghetti', ['spaghetti'])).toBe(true);
    expect(inPantry('Tomaten', ['Tomate'])).toBe(true);
    expect(inPantry('Sahne', ['Milch'])).toBe(false);
    const [r] = annotatePantry(
      [
        {
          title: 'Carbonara',
          ingredients: [
            { name: 'Spaghetti', quantity: '200 g' },
            { name: 'Speck', quantity: null },
          ],
        },
      ],
      ['Spaghetti', 'Eier'],
    );
    expect(r?.missing).toEqual(['Speck']);
    expect(r?.ingredients[0]?.inPantry).toBe(true);
  });
});

describe('limits', () => {
  it('computes cut-offs and quotas', () => {
    expect(retentionCutoff(NOW, 30).toISOString()).toBe('2026-09-24T08:00:00.000Z');
    expect(remainingQuota(3, 5)).toBe(2);
    expect(remainingQuota(9, 5)).toBe(0);
    expect(remainingQuota(0)).toBe(100);
  });
});
