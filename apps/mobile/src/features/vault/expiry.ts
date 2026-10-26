import type { VaultDocument } from '@fp/contracts';

export type ExpiryState = VaultDocument['expiryState'];

/** Parses a LocalDate (YYYY-MM-DD) as local midnight. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** LocalDate (YYYY-MM-DD) of a Date in local time. */
export function toLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from today until the date (negative when past). */
export function daysUntil(localDate: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseLocalDate(localDate).getTime() - today.getTime()) / 86_400_000);
}

export const EXPIRY_TONE: Record<ExpiryState, 'danger' | 'warning' | 'success' | 'muted'> = {
  expired: 'danger',
  expiring: 'warning',
  valid: 'success',
  none: 'muted',
};

/** Sort order for lists: expired first, then expiring, then by expiry date, then title. */
export function compareDocuments(a: VaultDocument, b: VaultDocument): number {
  const rank: Record<ExpiryState, number> = { expired: 0, expiring: 1, valid: 2, none: 3 };
  const r = rank[a.expiryState] - rank[b.expiryState];
  if (r !== 0) return r;
  if (a.expiresOn && b.expiresOn && a.expiresOn !== b.expiresOn)
    return a.expiresOn < b.expiresOn ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Whether an OCR suggestion is an ISO date we can format and apply. */
export function isLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Splits "a, b ,c" into trimmed unique tags. */
export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.slice(0, 40)),
    ),
  ].slice(0, 20);
}

/** Server default when `reminderLeadDays` is null. */
export const DEFAULT_LEAD_DAYS: readonly number[] = [183, 30, 7];
export const LEAD_DAY_PRESETS: readonly number[] = [365, 183, 90, 30, 14, 7, 1];
export const MAX_LEAD_DAYS = 5;

export type ReminderMode = 'default' | 'custom' | 'none';

/** Which reminder option a stored `reminderLeadDays` corresponds to. */
export function reminderModeOf(days: readonly number[] | null | undefined): ReminderMode {
  if (days == null) return 'default';
  if (days.length === 0) return 'none';
  const sorted = [...days].sort((a, b) => b - a);
  return sorted.length === DEFAULT_LEAD_DAYS.length &&
    sorted.every((d, i) => d === DEFAULT_LEAD_DAYS[i])
    ? 'default'
    : 'custom';
}

/** API value for the chosen reminder option (null = server default). */
export function leadDaysFor(mode: ReminderMode, custom: readonly number[]): number[] | null {
  if (mode === 'default') return null;
  if (mode === 'none') return [];
  return [...new Set(custom)].sort((a, b) => b - a).slice(0, MAX_LEAD_DAYS);
}
