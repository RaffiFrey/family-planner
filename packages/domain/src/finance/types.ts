import type { CurrencyCode } from '../money/money.js';

/** Bank-agnostic transaction produced by every importer (CSV, CAMT.053, MT940, later PSD2). */
export interface ParsedTransaction {
  /** YYYY-MM-DD */
  bookingDate: string;
  valueDate: string | null;
  /** Signed: negative = outgoing. */
  amountMinor: number;
  currency: CurrencyCode;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string;
  bookingText: string | null;
  status: 'booked' | 'pending';
  bankReference: string | null;
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportResult {
  format: string;
  transactions: ParsedTransaction[];
  issues: ImportIssue[];
}

export class ImportError extends Error {
  override name = 'ImportError';
}
