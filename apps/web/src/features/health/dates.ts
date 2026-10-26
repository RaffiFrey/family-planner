/** "YYYY-MM-DD" for today in the browser's local time. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds calendar days to a "YYYY-MM-DD" date. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday) to RRULE BYDAY codes. */
export const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** Localized short weekday names, Monday first. */
export function weekdayNames(locale: string, style: 'short' | 'long' = 'short'): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}
