import { localDateToFloating } from '../time/time.js';

/** Default reminder lead times before a document expires: ~6 months, 1 month, 1 week. */
export const DEFAULT_EXPIRY_LEAD_DAYS = [183, 30, 7] as const;

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (both ISO dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (localDateToFloating(to).getTime() - localDateToFloating(from).getTime()) / DAY_MS,
  );
}

/**
 * The reminder threshold (lead days) that is due today, or null.
 * Only the most specific crossed threshold is returned, so a document added
 * 20 days before expiry gets the 30-day reminder now and the 7-day one later.
 * A threshold only counts within `graceDays` after it was crossed, so a reminder is not
 * repeated months later once its once-key has been cleaned up. Expired documents get none.
 */
export function dueExpiryReminder(
  expiresOn: string,
  today: string,
  leadDays: readonly number[] = DEFAULT_EXPIRY_LEAD_DAYS,
  graceDays = 14,
): number | null {
  const left = daysBetween(today, expiresOn);
  if (left < 0) return null;
  const crossed = leadDays.filter((d) => d >= 0 && left <= d);
  if (crossed.length === 0) return null;
  const lead = Math.min(...crossed);
  return left >= lead - graceDays ? lead : null;
}

export type ExpiryState = 'valid' | 'expiring' | 'expired' | 'none';

export function expiryState(expiresOn: string | null, today: string, warnDays = 183): ExpiryState {
  if (!expiresOn) return 'none';
  const left = daysBetween(today, expiresOn);
  if (left < 0) return 'expired';
  return left <= warnDays ? 'expiring' : 'valid';
}

/** Display-safe suffix of an identifier (letters and digits only). */
export function lastChars(value: string, n = 4): string {
  const compact = value.replace(/[^A-Za-z0-9]/g, '');
  return compact.slice(-n);
}

/** Normalizes a free-text search into a safe `to_tsquery` prefix query ("pass & muell:*"). */
export function toPrefixTsQuery(search: string): string | null {
  const words = search
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(' & ');
}
