import type { ReportTransaction } from './reports.js';

/** Inclusive list of months YYYY-MM between two months. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number) as [number, number];
  const [ty, tm] = toMonth.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** YYYY-MM shifted by `n` months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export interface NetWorthAccount {
  id: string;
  openingBalanceMinor: number;
}

export interface NetWorthTransaction {
  accountId: string;
  bookingDate: string;
  amountMinor: number;
}

export interface NetWorthPoint {
  month: string;
  /** Sum of all account balances at the end of the month. */
  netWorthMinor: number;
  /** Balance per account at the end of the month. */
  accounts: { accountId: string; balanceMinor: number }[];
}

/**
 * Month-end balances: the opening balance counts from the start, every transaction from its
 * booking date on. Transactions on unknown accounts are ignored.
 */
export function netWorthHistory(
  accounts: readonly NetWorthAccount[],
  txs: readonly NetWorthTransaction[],
  fromMonth: string,
  toMonth: string,
): NetWorthPoint[] {
  const months = monthsBetween(fromMonth, toMonth);
  const balance = new Map(accounts.map((a) => [a.id, a.openingBalanceMinor]));
  const sorted = [...txs]
    .filter((t) => balance.has(t.accountId))
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  const out: NetWorthPoint[] = [];
  let i = 0;
  for (const month of months) {
    while (
      i < sorted.length &&
      (sorted[i] as NetWorthTransaction).bookingDate.slice(0, 7) <= month
    ) {
      const t = sorted[i] as NetWorthTransaction;
      balance.set(t.accountId, (balance.get(t.accountId) ?? 0) + t.amountMinor);
      i++;
    }
    const list = accounts.map((a) => ({ accountId: a.id, balanceMinor: balance.get(a.id) ?? 0 }));
    out.push({
      month,
      netWorthMinor: list.reduce((s, a) => s + a.balanceMinor, 0),
      accounts: list,
    });
  }
  return out;
}

export interface CategoryTrend {
  categoryId: string | null;
  /** Spending per month (positive, refunds reduce it), aligned with the requested months. */
  expenseMinor: number[];
  incomeMinor: number[];
  totalExpenseMinor: number;
  averageExpenseMinor: number;
}

/** Spending and income per category and month (transfers excluded). */
export function categoryTrends(
  txs: readonly ReportTransaction[],
  fromMonth: string,
  toMonth: string,
): { months: string[]; categories: CategoryTrend[] } {
  const months = monthsBetween(fromMonth, toMonth);
  const index = new Map(months.map((m, i) => [m, i]));
  const map = new Map<string | null, CategoryTrend>();
  for (const tx of txs) {
    if (tx.isTransfer) continue;
    const i = index.get(tx.bookingDate.slice(0, 7));
    if (i === undefined) continue;
    let t = map.get(tx.categoryId);
    if (!t) {
      t = {
        categoryId: tx.categoryId,
        expenseMinor: months.map(() => 0),
        incomeMinor: months.map(() => 0),
        totalExpenseMinor: 0,
        averageExpenseMinor: 0,
      };
      map.set(tx.categoryId, t);
    }
    if (tx.amountMinor < 0) t.expenseMinor[i] = (t.expenseMinor[i] as number) - tx.amountMinor;
    else t.incomeMinor[i] = (t.incomeMinor[i] as number) + tx.amountMinor;
  }
  const categories = [...map.values()].map((t) => {
    const total = t.expenseMinor.reduce((s, x) => s + x, 0);
    return {
      ...t,
      totalExpenseMinor: total,
      averageExpenseMinor: Math.round(total / months.length),
    };
  });
  categories.sort((a, b) => b.totalExpenseMinor - a.totalExpenseMinor);
  return { months, categories };
}

export interface YearComparisonMonth {
  /** 1..12 */
  month: number;
  incomeMinor: number;
  expenseMinor: number;
  previousIncomeMinor: number;
  previousExpenseMinor: number;
}

export interface YearComparisonCategory {
  categoryId: string | null;
  expenseMinor: number;
  previousExpenseMinor: number;
  /** Relative change of spending, null when there was no spending the year before. */
  change: number | null;
}

/** Compares `year` with the year before, per month and per category. */
export function yearOverYear(
  txs: readonly ReportTransaction[],
  year: number,
): {
  months: YearComparisonMonth[];
  categories: YearComparisonCategory[];
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    previousIncomeMinor: number;
    previousExpenseMinor: number;
  };
} {
  const months: YearComparisonMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    incomeMinor: 0,
    expenseMinor: 0,
    previousIncomeMinor: 0,
    previousExpenseMinor: 0,
  }));
  const cats = new Map<string | null, YearComparisonCategory>();
  for (const tx of txs) {
    if (tx.isTransfer) continue;
    const y = Number(tx.bookingDate.slice(0, 4));
    if (y !== year && y !== year - 1) continue;
    const current = y === year;
    const row = months[Number(tx.bookingDate.slice(5, 7)) - 1] as YearComparisonMonth;
    const income = tx.amountMinor >= 0;
    const abs = Math.abs(tx.amountMinor);
    if (current && income) row.incomeMinor += abs;
    else if (current) row.expenseMinor += abs;
    else if (income) row.previousIncomeMinor += abs;
    else row.previousExpenseMinor += abs;
    if (income) continue;
    const c = cats.get(tx.categoryId) ?? {
      categoryId: tx.categoryId,
      expenseMinor: 0,
      previousExpenseMinor: 0,
      change: null,
    };
    if (current) c.expenseMinor += abs;
    else c.previousExpenseMinor += abs;
    cats.set(tx.categoryId, c);
  }
  const categories = [...cats.values()]
    .map((c) => ({
      ...c,
      change:
        c.previousExpenseMinor > 0
          ? Math.round(
              ((c.expenseMinor - c.previousExpenseMinor) / c.previousExpenseMinor) * 10_000,
            ) / 10_000
          : null,
    }))
    .sort((a, b) => b.expenseMinor - a.expenseMinor);
  const sum = (k: keyof Omit<YearComparisonMonth, 'month'>) => months.reduce((s, m) => s + m[k], 0);
  return {
    months,
    categories,
    totals: {
      incomeMinor: sum('incomeMinor'),
      expenseMinor: sum('expenseMinor'),
      previousIncomeMinor: sum('previousIncomeMinor'),
      previousExpenseMinor: sum('previousExpenseMinor'),
    },
  };
}

export type CsvCell = string | number | null | undefined;

/** Neutralises spreadsheet formulas in text cells (CSV injection); plain numbers stay as they are. */
function safeText(s: string): string {
  if (/^-?\d+([.,]\d+)?$/.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Builds a CSV document (RFC 4180 quoting). Numbers are written as-is; text cells are
 * protected against formula injection. Defaults to `;` as German Excel expects.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  delimiter = ';',
): string {
  const cell = (v: CsvCell): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v) : safeText(v);
    return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}
