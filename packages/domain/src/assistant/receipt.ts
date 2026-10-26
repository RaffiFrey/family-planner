import { toLocalDate } from '../time/time.js';
import { AssistantInputError, checkLocalDate } from './dates.js';
import { parseDecimalAmount } from './actions.js';

/** What the model reads off a receipt (amounts as printed). */
export interface RawReceipt {
  merchant: string | null;
  /** YYYY-MM-DD if readable. */
  date: string | null;
  total: string;
  currency: string | null;
  lineItems: { description: string; quantity: number | null; amount: string }[];
  categoryKey: string | null;
}

export interface Receipt {
  merchant: string | null;
  date: string;
  totalMinor: number;
  currency: string;
  lineItems: { description: string; quantity: number | null; amountMinor: number }[];
  suggestedCategoryKey: string | null;
}

export interface ReceiptNormalization {
  receipt: Receipt;
  /** Things that were dropped or defaulted, for display. */
  warnings: string[];
}

/**
 * Validates and normalizes a model-extracted receipt: amounts to minor units, unknown currency
 * or category keys rejected/dropped, unreadable dates defaulted to today.
 */
export function normalizeReceipt(
  raw: RawReceipt,
  opts: { now: Date; timeZone: string; currency: string; categoryKeys: readonly string[] },
): ReceiptNormalization {
  const warnings: string[] = [];
  const currency = (raw.currency?.trim() || opts.currency).toUpperCase();
  const totalMinor = parseDecimalAmount(raw.total, currency);
  if (totalMinor === 0) throw new AssistantInputError('invalid_amount', 'Receipt total is zero');
  let date = toLocalDate(opts.now, opts.timeZone);
  if (raw.date) {
    try {
      date = checkLocalDate(raw.date.trim());
    } catch {
      warnings.push(`Unreadable date "${raw.date}"`);
    }
  } else {
    warnings.push('No date found');
  }
  const lineItems: Receipt['lineItems'] = [];
  for (const item of raw.lineItems) {
    try {
      const description = item.description.trim();
      if (!description) continue;
      lineItems.push({
        description,
        quantity:
          item.quantity !== null && Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : null,
        amountMinor: parseDecimalAmount(item.amount, currency),
      });
    } catch {
      warnings.push(`Skipped line item "${item.description}"`);
    }
  }
  const key = raw.categoryKey?.trim().toLowerCase() ?? null;
  const suggestedCategoryKey = key && opts.categoryKeys.includes(key) ? key : null;
  return {
    receipt: {
      merchant: raw.merchant?.trim() || null,
      date,
      totalMinor,
      currency,
      lineItems,
      suggestedCategoryKey,
    },
    warnings,
  };
}
