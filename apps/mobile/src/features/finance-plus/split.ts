import { allocateMoney, type CurrencyCode, type DecimalStyle, money } from '@fp/domain/money';
import { parseMoneyText } from './money-text';

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

/**
 * Same rules as the server's computeShares (@fp/domain/finance; its barrel pulls in Node-only
 * hashing, so the small function is mirrored here). Returns null when the split is invalid.
 */
export function computeSplit(
  amountMinor: number,
  currency: CurrencyCode,
  method: SplitMethod,
  values: readonly (number | null)[],
): number[] | null {
  if (values.length === 0 || amountMinor <= 0) return null;
  if (method !== 'equal' && values.some((v) => v === null || !Number.isFinite(v) || v < 0))
    return null;
  const nums = values.map((v) => v ?? 0);
  let ratios: number[];
  switch (method) {
    case 'equal':
      ratios = values.map(() => 1);
      break;
    case 'exact':
      if (nums.some((a) => !Number.isInteger(a))) return null;
      return nums.reduce((s, a) => s + a, 0) === amountMinor ? nums : null;
    case 'percent':
      ratios = nums.map((p) => Math.round(p * 100));
      if (ratios.reduce((s, r) => s + r, 0) !== 10_000) return null;
      break;
    case 'shares':
      ratios = nums;
      if (ratios.some((r) => !Number.isInteger(r)) || ratios.every((r) => r === 0)) return null;
      break;
  }
  return allocateMoney(money(amountMinor, currency), ratios).map((m) => m.amountMinor);
}

export type SplitError = 'missing' | 'exactSum' | 'percentSum' | 'invalid';

export interface SplitResult {
  /** Body `shares` for the API. */
  shares: { partyId: string; value: number | null }[];
  /** Computed amount per party (same order), or null when the input is invalid. */
  amounts: number[] | null;
  error: SplitError | null;
}

/** Parses a percentage or weight ("33,33" / "2"). */
function parseNumber(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Turns the per-person inputs of the expense form into API shares and a preview, using the same
 * domain function the server uses (so the preview matches what is stored).
 */
export function buildSplit(
  method: SplitMethod,
  amountMinor: number | null,
  partyIds: readonly string[],
  inputs: Readonly<Record<string, string>>,
  format: { exponent: number; style: DecimalStyle; currency: CurrencyCode },
): SplitResult {
  const values = partyIds.map((id) => {
    if (method === 'equal') return null;
    const text = inputs[id] ?? '';
    if (method === 'exact') {
      if (text.trim() === '' || /^0+([.,]0*)?$/.test(text.trim())) return 0;
      return parseMoneyText(text, format.exponent, format.style);
    }
    return parseNumber(text);
  });
  const shares = partyIds.map((partyId, i) => ({ partyId, value: values[i] ?? null }));
  if (method !== 'equal' && values.some((v) => v === null))
    return { shares, amounts: null, error: 'missing' };
  if (amountMinor === null || partyIds.length === 0) return { shares, amounts: null, error: null };
  const amounts = computeSplit(amountMinor, format.currency, method, values);
  if (amounts) return { shares, amounts, error: null };
  const error: SplitError =
    method === 'exact' ? 'exactSum' : method === 'percent' ? 'percentSum' : 'invalid';
  return { shares, amounts: null, error };
}
