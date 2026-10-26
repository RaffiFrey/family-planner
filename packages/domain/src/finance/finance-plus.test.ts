import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  categoryTrends,
  monthsBetween,
  netWorthHistory,
  shiftMonth,
  toCsv,
  yearOverYear,
} from './advanced-reports.js';
import {
  addInterval,
  cancellationDeadline,
  candidateMatches,
  contractTotals,
  counterpartyKey,
  daysUntil,
  detectRecurringPayments,
  guessContractType,
  monthlyAmount,
  normalizeCounterparty,
  type RecurringInput,
  rollForward,
  yearlyAmount,
} from './contracts.js';
import { goalProgress, monthsUntil, requiredMonthlySaving } from './goals.js';
import {
  computeShares,
  expenseBalances,
  settleUp,
  SharedExpenseError,
  type SplitMethod,
} from './shared-expenses.js';

const pay = (
  bookingDate: string,
  amountMinor: number,
  counterpartyName: string | null,
  over: Partial<RecurringInput> = {},
): RecurringInput => ({
  id: `${counterpartyName}-${bookingDate}-${amountMinor}`,
  bookingDate,
  amountMinor,
  counterpartyName,
  counterpartyIban: null,
  ...over,
});

describe('counterparty normalisation', () => {
  it('drops legal forms, numbers, domains and accents', () => {
    expect(normalizeCounterparty('Netflix International B.V.')).toBe('netflix international');
    expect(normalizeCounterparty('NETFLIX.COM 4711')).toBe('netflix');
    expect(normalizeCounterparty('Müller GmbH & Co. KG')).toBe('muller');
    expect(normalizeCounterparty(null)).toBe('');
  });

  it('prefers a valid IBAN as grouping key', () => {
    expect(
      counterpartyKey({ counterpartyName: 'x', counterpartyIban: 'de89 3704 0044 0532 0130 00' }),
    ).toBe('iban:DE89370400440532013000');
    expect(counterpartyKey({ counterpartyName: 'Spotify AB', counterpartyIban: 'n/a' })).toBe(
      'name:spotify ab',
    );
    expect(counterpartyKey({ counterpartyName: '1234', counterpartyIban: null })).toBe('');
  });
});

describe('recurring payment detection', () => {
  const netflix = ['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-17', '2026-09-15'].map((d) =>
    pay(d, -1399, 'NETFLIX.COM', { categoryId: 'subs', accountId: 'acc' }),
  );

  it('detects a monthly subscription with next date and confidence', () => {
    const [c] = detectRecurringPayments(netflix, { today: '2026-10-01' });
    expect(c).toMatchObject({
      counterpartyKey: 'name:netflix',
      direction: 'out',
      interval: 'monthly',
      averageAmountMinor: 1399,
      occurrences: 5,
      firstDate: '2026-05-15',
      lastDate: '2026-09-15',
      nextExpectedDate: '2026-10-15',
      categoryId: 'subs',
      accountId: 'acc',
    });
    expect(c?.confidence).toBeGreaterThan(0.9);
    expect(c?.transactionIds).toHaveLength(5);
  });

  it('tolerates small amount changes and separates different plans', () => {
    const txs = [
      ...['2026-01-03', '2026-02-03', '2026-03-03', '2026-04-03'].map((d, i) =>
        pay(d, -(4500 + i * 120), 'Stadtwerke'),
      ),
      ...['2026-01-10', '2026-02-10', '2026-03-10'].map((d) => pay(d, -899, 'Amazon Prime')),
      ...['2026-01-20', '2026-02-20', '2026-03-20'].map((d) => pay(d, -12000, 'Amazon Prime')),
    ];
    const found = detectRecurringPayments(txs);
    expect(found.map((f) => [f.counterpartyKey, f.averageAmountMinor]).sort()).toEqual([
      ['name:amazon prime', 12000],
      ['name:amazon prime', 899],
      ['name:stadtwerke', 4680],
    ]);
  });

  it('recognises weekly, quarterly, half-yearly and yearly cadences and incoming payments', () => {
    const weekly = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].map((d) =>
      pay(d, -500, 'Zeitung'),
    );
    const quarterly = ['2026-01-01', '2026-04-01'].map((d) => pay(d, -9000, 'HUK Coburg'));
    const half = ['2025-07-01', '2026-01-01'].map((d) => pay(d, -30000, 'KFZ Steuer'));
    const yearly = ['2024-03-01', '2025-03-01'].map((d) => pay(d, -6000, 'ADAC'));
    const salary = ['2026-07-28', '2026-08-28', '2026-09-28'].map((d) =>
      pay(d, 320000, 'Arbeitgeber', { counterpartyIban: 'DE02120300000000202051' }),
    );
    const found = detectRecurringPayments([...weekly, ...quarterly, ...half, ...yearly, ...salary]);
    const byName = Object.fromEntries(found.map((f) => [f.counterpartyName, f]));
    expect(byName.Zeitung?.interval).toBe('weekly');
    expect(byName['HUK Coburg']?.interval).toBe('quarterly');
    expect(byName['KFZ Steuer']?.interval).toBe('halfyearly');
    expect(byName.ADAC?.interval).toBe('yearly');
    expect(byName.ADAC?.nextExpectedDate).toBe('2026-03-01');
    expect(byName.Arbeitgeber).toMatchObject({
      direction: 'in',
      counterpartyKey: 'iban:DE02120300000000202051',
    });
  });

  it('ignores irregular, too short, stopped and anonymous series', () => {
    const irregular = ['2026-01-01', '2026-01-09', '2026-03-30', '2026-04-02'].map((d) =>
      pay(d, -2000, 'REWE'),
    );
    const short = ['2026-08-01', '2026-09-01'].map((d) => pay(d, -999, 'Spotify'));
    const stopped = ['2025-01-05', '2025-02-05', '2025-03-05'].map((d) => pay(d, -999, 'Sky'));
    const anonymous = ['2026-01-01', '2026-02-01', '2026-03-01'].map((d) => pay(d, -999, null));
    const zero = [pay('2026-01-01', 0, 'Zero')];
    expect(
      detectRecurringPayments([...irregular, ...short, ...stopped, ...anonymous, ...zero], {
        today: '2026-10-01',
      }),
    ).toEqual([]);
  });

  it('counts same-day bookings once and lowers confidence when a payment is overdue', () => {
    const txs = [
      ...['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map((d) => pay(d, -1000, 'Gym')),
      pay('2026-08-01', -1000, 'Gym'),
    ];
    const onTime = detectRecurringPayments(txs, { today: '2026-08-20' })[0];
    const late = detectRecurringPayments(txs, { today: '2026-09-15' })[0];
    expect(onTime?.occurrences).toBe(4);
    expect(late?.confidence).toBeLessThan(onTime?.confidence ?? 0);
    expect(detectRecurringPayments(txs, { today: '2026-09-15', minConfidence: 0.99 })).toEqual([]);
  });

  it('matches candidates against stored contracts', () => {
    const c = {
      counterpartyKey: 'name:netflix',
      direction: 'out' as const,
      averageAmountMinor: 1399,
    };
    expect(
      candidateMatches(c, { counterpartyKey: 'name:netflix', direction: 'out', amountMinor: 1299 }),
    ).toBe(true);
    expect(
      candidateMatches(c, { counterpartyKey: 'name:netflix', direction: 'out', amountMinor: 5000 }),
    ).toBe(false);
    expect(
      candidateMatches(c, { counterpartyKey: 'name:netflix', direction: 'in', amountMinor: 1399 }),
    ).toBe(false);
    expect(
      candidateMatches(c, { counterpartyKey: null, direction: 'out', amountMinor: 1399 }),
    ).toBe(false);
  });
});

describe('contract helpers', () => {
  it('adds intervals and rolls due dates forward', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addInterval('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(addInterval('2026-01-01', 'weekly')).toBe('2026-01-08');
    expect(addInterval('2026-01-15', 'quarterly')).toBe('2026-04-15');
    expect(addInterval('2026-01-15', 'halfyearly')).toBe('2026-07-15');
    expect(addInterval('2024-02-29', 'yearly')).toBe('2025-02-28');
    expect(rollForward('2026-01-31', 'monthly', '2026-04-01')).toBe('2026-04-30');
    expect(rollForward('2026-12-01', 'monthly', '2026-04-01')).toBe('2026-12-01');
  });

  it('guesses the contract type', () => {
    expect(guessContractType('insurance', 'x')).toBe('insurance');
    expect(guessContractType('electricity', null)).toBe('utility');
    expect(guessContractType(null, 'Allianz Versicherungs-AG')).toBe('insurance');
    expect(guessContractType(null, 'Santander Kredit')).toBe('loan');
    expect(guessContractType(null, 'Vodafone GmbH')).toBe('utility');
    expect(guessContractType('groceries', 'Spotify')).toBe('subscription');
    expect(guessContractType(undefined, undefined)).toBe('other');
  });

  it('computes notice deadlines', () => {
    const base = { nextDueDate: '2026-12-01', minimumTermEnd: null, noticePeriodDays: 30 };
    expect(cancellationDeadline(base, '2026-10-01')).toBe('2026-11-01');
    expect(cancellationDeadline({ ...base, minimumTermEnd: '2027-06-30' }, '2026-10-01')).toBe(
      '2027-05-31',
    );
    expect(cancellationDeadline({ ...base, minimumTermEnd: '2025-06-30' }, '2026-10-01')).toBe(
      '2026-11-01',
    );
    expect(cancellationDeadline({ ...base, noticePeriodDays: null }, '2026-10-01')).toBeNull();
    expect(cancellationDeadline({ ...base, nextDueDate: null }, '2026-10-01')).toBeNull();
    expect(daysUntil('2026-10-15', '2026-10-01')).toBe(14);
  });

  it('totals contracts per type, per month and per year', () => {
    expect(monthlyAmount(12000, 'yearly')).toBe(1000);
    expect(yearlyAmount(500, 'weekly')).toBe(26000);
    const t = contractTotals([
      { contractType: 'subscription', direction: 'out', amountMinor: 1399, interval: 'monthly' },
      { contractType: 'subscription', direction: 'out', amountMinor: 999, interval: 'monthly' },
      { contractType: 'insurance', direction: 'out', amountMinor: 60000, interval: 'yearly' },
      { contractType: 'other', direction: 'in', amountMinor: 25000, interval: 'monthly' },
    ]);
    expect(t.byType).toEqual([
      { contractType: 'insurance', count: 1, monthlyMinor: 5000, yearlyMinor: 60000 },
      { contractType: 'subscription', count: 2, monthlyMinor: 2398, yearlyMinor: 28776 },
    ]);
    expect(t).toMatchObject({ yearlyMinor: 88776, monthlyMinor: 7398, monthlyIncomeMinor: 25000 });
  });
});

describe('savings goals', () => {
  it('counts the months left', () => {
    expect(monthsUntil('2026-10-15', '2026-12-20')).toBe(3);
    expect(monthsUntil('2026-10-15', '2026-12-10')).toBe(2);
    expect(monthsUntil('2026-10-15', '2026-10-16')).toBe(1);
    expect(monthsUntil('2026-10-15', '2026-10-01')).toBe(0);
  });

  it('computes progress and the required monthly saving', () => {
    expect(
      goalProgress({
        targetMinor: 100000,
        savedMinor: 25000,
        deadline: '2027-03-31',
        today: '2026-10-01',
      }),
    ).toEqual({
      savedMinor: 25000,
      remainingMinor: 75000,
      ratio: 0.25,
      reached: false,
      monthsLeft: 6,
      requiredMonthlyMinor: 12500,
    });
    expect(
      goalProgress({ targetMinor: 1000, savedMinor: 1200, deadline: null, today: '2026-10-01' }),
    ).toMatchObject({
      ratio: 1,
      reached: true,
      remainingMinor: 0,
      monthsLeft: null,
      requiredMonthlyMinor: null,
    });
    expect(
      goalProgress({ targetMinor: 0, savedMinor: 0, deadline: null, today: '2026-10-01' }).ratio,
    ).toBe(1);
    expect(requiredMonthlySaving(1000, '2026-10-01', '2026-01-01')).toBe(1000);
    expect(requiredMonthlySaving(0, '2026-10-01', '2027-01-01')).toBe(0);
    expect(requiredMonthlySaving(1000, '2026-10-01', '2026-12-31')).toBe(334);
  });
});

describe('shared expenses', () => {
  const ids = ['a', 'b', 'c'];
  it('splits equally, by exact amounts, percentages and shares', () => {
    expect(
      computeShares(
        1000,
        'EUR',
        'equal',
        ids.map((partyId) => ({ partyId })),
      ),
    ).toEqual([
      { partyId: 'a', amountMinor: 334 },
      { partyId: 'b', amountMinor: 333 },
      { partyId: 'c', amountMinor: 333 },
    ]);
    expect(
      computeShares(1000, 'EUR', 'exact', [
        { partyId: 'a', value: 600 },
        { partyId: 'b', value: 400 },
      ]).map((s) => s.amountMinor),
    ).toEqual([600, 400]);
    expect(
      computeShares(1000, 'EUR', 'percent', [
        { partyId: 'a', value: 33.33 },
        { partyId: 'b', value: 33.33 },
        { partyId: 'c', value: 33.34 },
      ]).map((s) => s.amountMinor),
    ).toEqual([333, 333, 334]);
    expect(
      computeShares(900, 'EUR', 'shares', [
        { partyId: 'a', value: 2 },
        { partyId: 'b', value: 1 },
      ]).map((s) => s.amountMinor),
    ).toEqual([600, 300]);
  });

  it('rejects invalid splits', () => {
    const bad: [number, SplitMethod, { partyId: string; value?: number | null }[]][] = [
      [1000, 'equal', []],
      [1000, 'equal', [{ partyId: 'a' }, { partyId: 'a' }]],
      [0, 'equal', [{ partyId: 'a' }]],
      [1000, 'exact', [{ partyId: 'a', value: 999 }]],
      [
        1000,
        'exact',
        [
          { partyId: 'a', value: 999.5 },
          { partyId: 'b', value: 0.5 },
        ],
      ],
      [1000, 'exact', [{ partyId: 'a', value: null }]],
      [
        1000,
        'percent',
        [
          { partyId: 'a', value: 50 },
          { partyId: 'b', value: 40 },
        ],
      ],
      [1000, 'shares', [{ partyId: 'a', value: 1.5 }]],
      [1000, 'shares', [{ partyId: 'a', value: 0 }]],
      [1000, 'shares', [{ partyId: 'a', value: -1 }]],
    ];
    for (const [amount, method, parties] of bad)
      expect(() => computeShares(amount, 'EUR', method, parties)).toThrow(SharedExpenseError);
  });

  it('computes balances and settle-up transfers', () => {
    const shares = computeShares(
      9000,
      'EUR',
      'equal',
      ids.map((partyId) => ({ partyId })),
    );
    const balances = expenseBalances(
      [
        { paidByPartyId: 'a', amountMinor: 9000, shares },
        { paidByPartyId: 'b', amountMinor: 3000, shares: [{ partyId: 'c', amountMinor: 3000 }] },
      ],
      [{ fromPartyId: 'c', toPartyId: 'a', amountMinor: 1000 }],
    );
    expect(balances).toEqual([
      { partyId: 'a', balanceMinor: 5000 },
      { partyId: 'b', balanceMinor: 0 },
      { partyId: 'c', balanceMinor: -5000 },
    ]);
    expect(settleUp(balances)).toEqual([{ fromPartyId: 'c', toPartyId: 'a', amountMinor: 5000 }]);
  });

  it('never loses a cent and always settles everybody (property)', () => {
    const methods: SplitMethod[] = ['equal', 'shares'];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amount: fc.integer({ min: 1, max: 1e9 }),
            payer: fc.integer({ min: 0, max: 5 }),
            method: fc.constantFrom(...methods),
            weights: fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 6 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (items) => {
          const expenses = items.flatMap((it) => {
            const weights = it.weights.some((w) => w > 0) ? it.weights : [...it.weights, 1];
            const parties = weights.map((w, i) => ({ partyId: `p${i}`, value: w }));
            const shares = computeShares(it.amount, 'EUR', it.method, parties);
            expect(shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(it.amount);
            return [{ paidByPartyId: `p${it.payer}`, amountMinor: it.amount, shares }];
          });
          const balances = expenseBalances(expenses);
          expect(balances.reduce((s, b) => s + b.balanceMinor, 0)).toBe(0);
          const transfers = settleUp(balances);
          const nonZero = balances.filter((b) => b.balanceMinor !== 0).length;
          expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
          const after = expenseBalances(expenses, transfers);
          expect(after.every((b) => b.balanceMinor === 0)).toBe(true);
          expect(transfers.every((t) => t.amountMinor > 0)).toBe(true);
        },
      ),
    );
  });
});

describe('advanced reports', () => {
  it('handles month arithmetic', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('builds month-end net worth', () => {
    const history = netWorthHistory(
      [
        { id: 'giro', openingBalanceMinor: 1000 },
        { id: 'save', openingBalanceMinor: 0 },
      ],
      [
        { accountId: 'giro', bookingDate: '2026-02-10', amountMinor: -300 },
        { accountId: 'giro', bookingDate: '2026-01-05', amountMinor: 500 },
        { accountId: 'save', bookingDate: '2026-02-11', amountMinor: 300 },
        { accountId: 'other', bookingDate: '2026-01-01', amountMinor: 99 },
        { accountId: 'giro', bookingDate: '2025-12-01', amountMinor: 100 },
      ],
      '2026-01',
      '2026-03',
    );
    expect(history.map((h) => h.netWorthMinor)).toEqual([1600, 1600, 1600]);
    expect(history[1]?.accounts).toEqual([
      { accountId: 'giro', balanceMinor: 1300 },
      { accountId: 'save', balanceMinor: 300 },
    ]);
  });

  const txs = [
    { bookingDate: '2026-01-05', amountMinor: -1000, categoryId: 'food' },
    { bookingDate: '2026-02-05', amountMinor: -3000, categoryId: 'food' },
    { bookingDate: '2026-02-06', amountMinor: 500, categoryId: 'food' },
    { bookingDate: '2026-02-07', amountMinor: -700, categoryId: null },
    { bookingDate: '2026-02-08', amountMinor: -9999, categoryId: null, isTransfer: true },
    { bookingDate: '2025-02-05', amountMinor: -2000, categoryId: 'food' },
    { bookingDate: '2025-03-01', amountMinor: 100000, categoryId: 'salary' },
    { bookingDate: '2024-03-01', amountMinor: -1, categoryId: 'old' },
    { bookingDate: '2026-06-01', amountMinor: -1, categoryId: 'food' },
  ];

  it('builds category trends', () => {
    const t = categoryTrends(txs, '2026-01', '2026-02');
    expect(t.months).toEqual(['2026-01', '2026-02']);
    expect(t.categories).toEqual([
      {
        categoryId: 'food',
        expenseMinor: [1000, 3000],
        incomeMinor: [0, 500],
        totalExpenseMinor: 4000,
        averageExpenseMinor: 2000,
      },
      {
        categoryId: null,
        expenseMinor: [0, 700],
        incomeMinor: [0, 0],
        totalExpenseMinor: 700,
        averageExpenseMinor: 350,
      },
    ]);
  });

  it('compares a year with the previous one', () => {
    const y = yearOverYear(txs, 2026);
    expect(y.months[1]).toEqual({
      month: 2,
      incomeMinor: 500,
      expenseMinor: 3700,
      previousIncomeMinor: 0,
      previousExpenseMinor: 2000,
    });
    expect(y.totals).toEqual({
      incomeMinor: 500,
      expenseMinor: 4701,
      previousIncomeMinor: 100000,
      previousExpenseMinor: 2000,
    });
    expect(y.categories).toEqual([
      { categoryId: 'food', expenseMinor: 4001, previousExpenseMinor: 2000, change: 1.0005 },
      { categoryId: null, expenseMinor: 700, previousExpenseMinor: 0, change: null },
    ]);
  });

  it('writes CSV with quoting and formula protection', () => {
    expect(
      toCsv(
        ['Datum', 'Betrag', 'Text'],
        [
          ['2026-01-01', '-12,99', '=HYPERLINK("x")'],
          ['2026-01-02', 5, 'a;b'],
          [null, undefined, 'line\nbreak'],
        ],
      ),
    ).toBe(
      'Datum;Betrag;Text\r\n2026-01-01;-12,99;"\'=HYPERLINK(""x"")"\r\n2026-01-02;5;"a;b"\r\n;;"line\nbreak"\r\n',
    );
  });
});
