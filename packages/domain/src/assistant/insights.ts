import type { CategoryTotal, MonthlyCashflow } from '../finance/reports.js';

export interface SpendingInput {
  currency: string;
  /** Cash flow per month, oldest first; the last month is the "current" one. */
  cashflow: readonly MonthlyCashflow[];
  /** Category totals per month (same months as `cashflow`). */
  byMonth: readonly { month: string; rows: readonly CategoryTotal[] }[];
  /** Display names by category id; uncategorized uses `null`. */
  categoryNames: Readonly<Record<string, string>>;
}

export type Highlight =
  | { kind: 'top_category'; categoryName: string; amountMinor: number; percent: number }
  | { kind: 'increase' | 'decrease'; categoryName: string; amountMinor: number; percent: number }
  | { kind: 'savings_rate'; percent: number }
  | { kind: 'net_negative'; amountMinor: number };

export interface SpendingSummary {
  currency: string;
  months: string[];
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  avgMonthlyExpenseMinor: number;
  /** Share of income not spent over the period (0–100), null without income. */
  savingsRatePercent: number | null;
  topCategories: { name: string; expenseMinor: number; percent: number }[];
  /** Latest month vs. average of the previous months, for notable changes only. */
  changes: { name: string; latestMinor: number; averageMinor: number; percent: number }[];
  highlights: Highlight[];
}

/** Below this (in minor units, i.e. 20.00) changes are noise. */
export const MIN_CHANGE_MINOR = 2000;
export const MIN_CHANGE_PERCENT = 20;
export const UNCATEGORIZED = 'Uncategorized';

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/**
 * Aggregates report data into the only thing sent to the model (data minimisation): totals,
 * top categories and notable month-over-month changes — no individual transactions, payees or IBANs.
 */
export function summarizeSpending(input: SpendingInput): SpendingSummary {
  const name = (id: string | null) =>
    id ? (input.categoryNames[id] ?? UNCATEGORIZED) : UNCATEGORIZED;
  const totalIncomeMinor = input.cashflow.reduce((s, m) => s + m.incomeMinor, 0);
  const totalExpenseMinor = input.cashflow.reduce((s, m) => s + m.expenseMinor, 0);
  const months = input.cashflow.map((m) => m.month);

  const totals = new Map<string, number>();
  for (const { rows } of input.byMonth)
    for (const r of rows)
      totals.set(name(r.categoryId), (totals.get(name(r.categoryId)) ?? 0) + r.expenseMinor);
  const topCategories = [...totals]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([n, v]) => ({ name: n, expenseMinor: v, percent: pct(v, totalExpenseMinor) }));

  const changes: SpendingSummary['changes'] = [];
  const latest = input.byMonth.at(-1);
  const previous = input.byMonth.slice(0, -1);
  if (latest && previous.length > 0) {
    const perMonth = (rows: readonly CategoryTotal[]) => {
      const m = new Map<string, number>();
      for (const r of rows)
        m.set(name(r.categoryId), (m.get(name(r.categoryId)) ?? 0) + r.expenseMinor);
      return m;
    };
    const latestMap = perMonth(latest.rows);
    const prevMaps = previous.map((p) => perMonth(p.rows));
    const names = new Set([...latestMap.keys(), ...prevMaps.flatMap((m) => [...m.keys()])]);
    for (const n of names) {
      const latestMinor = latestMap.get(n) ?? 0;
      const averageMinor = Math.round(
        prevMaps.reduce((s, m) => s + (m.get(n) ?? 0), 0) / prevMaps.length,
      );
      if (Math.max(latestMinor, averageMinor) < MIN_CHANGE_MINOR || averageMinor === 0) continue;
      const percent = pct(latestMinor - averageMinor, averageMinor);
      if (Math.abs(percent) >= MIN_CHANGE_PERCENT)
        changes.push({ name: n, latestMinor, averageMinor, percent });
    }
    changes.sort(
      (a, b) => Math.abs(b.percent) - Math.abs(a.percent) || a.name.localeCompare(b.name),
    );
  }

  const savingsRatePercent =
    totalIncomeMinor > 0 ? pct(totalIncomeMinor - totalExpenseMinor, totalIncomeMinor) : null;
  const highlights: Highlight[] = [];
  const top = topCategories[0];
  if (top)
    highlights.push({
      kind: 'top_category',
      categoryName: top.name,
      amountMinor: top.expenseMinor,
      percent: top.percent,
    });
  for (const c of changes.slice(0, 3))
    highlights.push({
      kind: c.percent > 0 ? 'increase' : 'decrease',
      categoryName: c.name,
      amountMinor: c.latestMinor - c.averageMinor,
      percent: c.percent,
    });
  if (savingsRatePercent !== null)
    highlights.push({ kind: 'savings_rate', percent: savingsRatePercent });
  if (totalIncomeMinor - totalExpenseMinor < 0 && totalIncomeMinor > 0)
    highlights.push({ kind: 'net_negative', amountMinor: totalIncomeMinor - totalExpenseMinor });

  return {
    currency: input.currency,
    months,
    totalIncomeMinor,
    totalExpenseMinor,
    avgMonthlyExpenseMinor: months.length ? Math.round(totalExpenseMinor / months.length) : 0,
    savingsRatePercent,
    topCategories,
    changes: changes.slice(0, 5),
    highlights,
  };
}
