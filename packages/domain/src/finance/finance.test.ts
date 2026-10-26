import { describe, expect, it } from 'vitest';
import { budgetPeriodRange, budgetStatus, crossedThresholds, rolloverAmount } from './budgets.js';
import { monthlyCashflow, totalsByCategory } from './reports.js';
import { type CategorizationRule, categorize, isValidRegex, ruleMatches } from './rules.js';

const tx = {
  amountMinor: -4217,
  counterpartyName: 'REWE Markt GmbH',
  counterpartyIban: 'DE89 3704',
  purpose: 'REWE SAGT DANKE 1234',
  bookingText: 'Lastschrift',
};

const rule = (over: Partial<CategorizationRule>): CategorizationRule => ({
  id: 'r',
  categoryId: 'groceries',
  scope: 'global',
  priority: 100,
  conditions: [{ field: 'counterparty', op: 'contains', value: 'rewe' }],
  ...over,
});

describe('categorization rules', () => {
  it('matches each operator and field', () => {
    expect(ruleMatches(tx, rule({}))).toBe(true);
    expect(
      ruleMatches(
        tx,
        rule({ conditions: [{ field: 'purpose', op: 'startsWith', value: 'rewe sagt' }] }),
      ),
    ).toBe(true);
    expect(
      ruleMatches(tx, rule({ conditions: [{ field: 'iban', op: 'equals', value: 'DE893704' }] })),
    ).toBe(true);
    expect(
      ruleMatches(
        tx,
        rule({ conditions: [{ field: 'bookingText', op: 'equals', value: 'lastschrift' }] }),
      ),
    ).toBe(true);
    expect(
      ruleMatches(tx, rule({ conditions: [{ field: 'any', op: 'regex', value: '\\d{4}$' }] })),
    ).toBe(true);
    expect(ruleMatches(tx, rule({ conditions: [{ field: 'any', op: 'regex', value: '(' }] }))).toBe(
      false,
    );
    expect(ruleMatches(tx, rule({ conditions: [] }))).toBe(false);
  });

  it('respects direction and amount bounds', () => {
    expect(ruleMatches(tx, rule({ direction: 'in' }))).toBe(false);
    expect(ruleMatches({ ...tx, amountMinor: 5 }, rule({ direction: 'out' }))).toBe(false);
    expect(ruleMatches(tx, rule({ amountMinMinor: 5000 }))).toBe(false);
    expect(ruleMatches(tx, rule({ amountMaxMinor: 4000 }))).toBe(false);
    expect(
      ruleMatches(tx, rule({ amountMinMinor: 4000, amountMaxMinor: 5000, direction: 'out' })),
    ).toBe(true);
  });

  it('prefers household rules, then priority', () => {
    const rules = [
      rule({ id: 'g1', priority: 1, categoryId: 'global-cat' }),
      rule({ id: 'h2', scope: 'household', priority: 20, categoryId: 'h-late' }),
      rule({ id: 'h1', scope: 'household', priority: 10, categoryId: 'h-early' }),
    ];
    expect(categorize(tx, rules)?.id).toBe('h1');
    expect(categorize({ ...tx, counterpartyName: 'Aldi', purpose: '' }, rules)).toBeNull();
  });

  it('validates regex', () => {
    expect(isValidRegex('a+')).toBe(true);
    expect(isValidRegex('[')).toBe(false);
  });
});

describe('budgets', () => {
  it('computes levels', () => {
    expect(budgetStatus(10000, 5000).level).toBe('ok');
    expect(budgetStatus(10000, 8000).level).toBe('warning');
    expect(budgetStatus(10000, 10000).level).toBe('exceeded');
    expect(budgetStatus(10000, 10000, 2000)).toMatchObject({
      level: 'warning',
      remainingMinor: 2000,
      availableMinor: 12000,
    });
    expect(budgetStatus(0, 0).level).toBe('ok');
    expect(budgetStatus(0, 1).level).toBe('exceeded');
  });

  it('fires thresholds exactly once', () => {
    expect(crossedThresholds(10000, 7000, 8500)).toEqual(['warning']);
    expect(crossedThresholds(10000, 7000, 12000)).toEqual(['warning', 'exceeded']);
    expect(crossedThresholds(10000, 8500, 9000)).toEqual([]);
    expect(crossedThresholds(0, 0, 100)).toEqual([]);
  });

  it('computes rollover', () => {
    expect(rolloverAmount(budgetStatus(10000, 12000))).toBe(0);
    expect(rolloverAmount(budgetStatus(10000, 12000), true)).toBe(-2000);
    expect(rolloverAmount(budgetStatus(10000, 4000))).toBe(6000);
  });

  it('computes periods in the zone', () => {
    const at = new Date('2026-10-31T23:30:00Z'); // Nov 1 in Berlin
    expect(budgetPeriodRange('monthly', at, 'Europe/Berlin').start.toISOString()).toBe(
      '2026-10-31T23:00:00.000Z',
    );
    expect(budgetPeriodRange('yearly', at, 'Europe/Berlin').end.toISOString()).toBe(
      '2026-12-31T23:00:00.000Z',
    );
  });
});

describe('reports', () => {
  const txs = [
    { bookingDate: '2026-09-03', amountMinor: 300000, categoryId: 'salary' },
    { bookingDate: '2026-09-04', amountMinor: -5000, categoryId: 'groceries' },
    { bookingDate: '2026-11-04', amountMinor: -7000, categoryId: 'groceries' },
    { bookingDate: '2026-11-05', amountMinor: 1000, categoryId: 'groceries' },
    { bookingDate: '2026-11-06', amountMinor: -50000, categoryId: null, isTransfer: true },
    { bookingDate: '2027-01-01', amountMinor: -1, categoryId: null },
  ];

  it('totals by category excluding transfers', () => {
    expect(totalsByCategory(txs)).toEqual([
      { categoryId: 'groceries', incomeMinor: 1000, expenseMinor: 12000, count: 3 },
      { categoryId: null, incomeMinor: 0, expenseMinor: 1, count: 1 },
      { categoryId: 'salary', incomeMinor: 300000, expenseMinor: 0, count: 1 },
    ]);
  });

  it('builds monthly cash flow including empty months', () => {
    expect(monthlyCashflow(txs, '2026-09', '2026-12')).toEqual([
      { month: '2026-09', incomeMinor: 300000, expenseMinor: 5000, netMinor: 295000 },
      { month: '2026-10', incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      { month: '2026-11', incomeMinor: 1000, expenseMinor: 7000, netMinor: -6000 },
      { month: '2026-12', incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
    ]);
  });
});
