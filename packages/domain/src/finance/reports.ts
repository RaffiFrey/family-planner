export interface ReportTransaction {
  bookingDate: string; // YYYY-MM-DD
  amountMinor: number;
  categoryId: string | null;
  /** Transfers between own accounts are excluded from income/expense reports. */
  isTransfer?: boolean;
}

export interface CategoryTotal {
  categoryId: string | null;
  incomeMinor: number;
  expenseMinor: number;
  count: number;
}

export function totalsByCategory(txs: readonly ReportTransaction[]): CategoryTotal[] {
  const map = new Map<string | null, CategoryTotal>();
  for (const tx of txs) {
    if (tx.isTransfer) continue;
    const t = map.get(tx.categoryId) ?? {
      categoryId: tx.categoryId,
      incomeMinor: 0,
      expenseMinor: 0,
      count: 0,
    };
    if (tx.amountMinor >= 0) t.incomeMinor += tx.amountMinor;
    else t.expenseMinor += -tx.amountMinor;
    t.count++;
    map.set(tx.categoryId, t);
  }
  return [...map.values()].sort((a, b) => b.expenseMinor - a.expenseMinor);
}

export interface MonthlyCashflow {
  month: string; // YYYY-MM
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/** Cash flow per calendar month, including empty months between first and last. */
export function monthlyCashflow(
  txs: readonly ReportTransaction[],
  fromMonth: string,
  toMonth: string,
): MonthlyCashflow[] {
  const months: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number) as [number, number];
  const [ty, tm] = toMonth.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  const byMonth = new Map(
    months.map((mo) => [mo, { month: mo, incomeMinor: 0, expenseMinor: 0, netMinor: 0 }]),
  );
  for (const tx of txs) {
    if (tx.isTransfer) continue;
    const row = byMonth.get(tx.bookingDate.slice(0, 7));
    if (!row) continue;
    if (tx.amountMinor >= 0) row.incomeMinor += tx.amountMinor;
    else row.expenseMinor += -tx.amountMinor;
    row.netMinor += tx.amountMinor;
  }
  return [...byMonth.values()];
}
