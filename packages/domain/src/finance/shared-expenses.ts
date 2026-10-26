import { allocateMoney, type CurrencyCode, money } from '../money/money.js';

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

export interface ShareInput {
  partyId: string;
  /**
   * Meaning depends on the method: ignored for `equal`, minor units for `exact`,
   * percent (up to two decimals) for `percent`, integer weight for `shares`.
   */
  value?: number | null;
}

export interface Share {
  partyId: string;
  amountMinor: number;
}

export class SharedExpenseError extends Error {
  override name = 'SharedExpenseError';
}

/**
 * Splits an expense between parties without losing or inventing a cent: remainders are
 * handed out by `allocateMoney` (first parties first).
 */
export function computeShares(
  amountMinor: number,
  currency: CurrencyCode,
  method: SplitMethod,
  parties: readonly ShareInput[],
): Share[] {
  if (parties.length === 0) throw new SharedExpenseError('At least one participant is required');
  if (new Set(parties.map((p) => p.partyId)).size !== parties.length)
    throw new SharedExpenseError('Participants must be unique');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
    throw new SharedExpenseError('Amount must be positive');
  const value = (p: ShareInput): number => {
    if (p.value === null || p.value === undefined || !Number.isFinite(p.value) || p.value < 0)
      throw new SharedExpenseError(`Missing or invalid value for ${p.partyId}`);
    return p.value;
  };
  let ratios: number[];
  switch (method) {
    case 'equal':
      ratios = parties.map(() => 1);
      break;
    case 'exact': {
      const amounts = parties.map(value);
      if (amounts.some((a) => !Number.isInteger(a)))
        throw new SharedExpenseError('Exact shares must be whole minor units');
      if (amounts.reduce((s, a) => s + a, 0) !== amountMinor)
        throw new SharedExpenseError('Exact shares must add up to the amount');
      return parties.map((p, i) => ({ partyId: p.partyId, amountMinor: amounts[i] as number }));
    }
    case 'percent': {
      // Basis points, so 33.33 % works with integer allocation.
      ratios = parties.map((p) => Math.round(value(p) * 100));
      if (ratios.reduce((s, r) => s + r, 0) !== 10_000)
        throw new SharedExpenseError('Percentages must add up to 100');
      break;
    }
    case 'shares':
      ratios = parties.map(value);
      if (ratios.some((r) => !Number.isInteger(r)))
        throw new SharedExpenseError('Shares must be whole numbers');
      if (ratios.every((r) => r === 0)) throw new SharedExpenseError('At least one share needed');
      break;
  }
  const parts = allocateMoney(money(amountMinor, currency), ratios);
  return parties.map((p, i) => ({
    partyId: p.partyId,
    amountMinor: (parts[i] as { amountMinor: number }).amountMinor,
  }));
}

export interface BalanceExpense {
  paidByPartyId: string;
  amountMinor: number;
  shares: readonly Share[];
}

export interface BalanceSettlement {
  fromPartyId: string;
  toPartyId: string;
  amountMinor: number;
}

export interface PartyBalance {
  partyId: string;
  /** Positive: the party gets money back; negative: the party owes money. */
  balanceMinor: number;
}

/** Net balance per party; the balances of all parties always add up to zero. */
export function expenseBalances(
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[] = [],
): PartyBalance[] {
  const map = new Map<string, number>();
  const add = (id: string, delta: number) => map.set(id, (map.get(id) ?? 0) + delta);
  for (const e of expenses) {
    add(e.paidByPartyId, e.amountMinor);
    for (const s of e.shares) add(s.partyId, -s.amountMinor);
  }
  for (const s of settlements) {
    add(s.fromPartyId, s.amountMinor);
    add(s.toPartyId, -s.amountMinor);
  }
  return [...map]
    .map(([partyId, balanceMinor]) => ({ partyId, balanceMinor }))
    .sort((a, b) => b.balanceMinor - a.balanceMinor || a.partyId.localeCompare(b.partyId));
}

export interface SettleUpTransfer {
  fromPartyId: string;
  toPartyId: string;
  amountMinor: number;
}

/**
 * Greedy debt simplification: the largest debtor pays the largest creditor until everyone is
 * even. Needs at most n − 1 transfers.
 */
export function settleUp(balances: readonly PartyBalance[]): SettleUpTransfer[] {
  const creditors = balances
    .filter((b) => b.balanceMinor > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balanceMinor - a.balanceMinor || a.partyId.localeCompare(b.partyId));
  const debtors = balances
    .filter((b) => b.balanceMinor < 0)
    .map((b) => ({ partyId: b.partyId, balanceMinor: -b.balanceMinor }))
    .sort((a, b) => b.balanceMinor - a.balanceMinor || a.partyId.localeCompare(b.partyId));
  const out: SettleUpTransfer[] = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const cr = creditors[c] as PartyBalance;
    const de = debtors[d] as PartyBalance;
    const amount = Math.min(cr.balanceMinor, de.balanceMinor);
    out.push({ fromPartyId: de.partyId, toPartyId: cr.partyId, amountMinor: amount });
    cr.balanceMinor -= amount;
    de.balanceMinor -= amount;
    if (cr.balanceMinor === 0) c++;
    if (de.balanceMinor === 0) d++;
  }
  return out;
}
