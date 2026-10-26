export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "8:00, 20:00 12:30" → ["08:00", "12:30", "20:00"]; null when any entry is not a valid time. */
export function parseTimes(input: string): string[] | null {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out = new Set<string>();
  for (const p of parts) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(p);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    out.add(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return [...out].sort().slice(0, 12);
}

/** Daily when every (or no) weekday is chosen, else a weekly rule on the chosen days. */
export function rruleFromDays(days: readonly Weekday[]): string {
  if (days.length === 0 || days.length === 7) return 'FREQ=DAILY';
  const ordered = WEEKDAYS.filter((d) => days.includes(d));
  return `FREQ=WEEKLY;BYDAY=${ordered.join(',')}`;
}

/**
 * Weekdays of a simple medication rule; `null` for rules the form cannot represent
 * (they are kept unchanged when saving).
 */
export function daysFromRrule(rrule: string): Weekday[] | null {
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/, '')
      .split(';')
      .map((p) => p.split('=') as [string, string | undefined]),
  );
  if (parts.FREQ === 'DAILY' && Object.keys(parts).length === 1) return [...WEEKDAYS];
  if (parts.FREQ === 'WEEKLY' && parts.BYDAY && Object.keys(parts).length === 2) {
    const days = parts.BYDAY.split(',');
    if (days.every((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d))) return days;
  }
  return null;
}

/** Members who get pediatric check-ups (U1–U9, J1, J2): children and teens. */
export function isChildRole(role: string): boolean {
  return role === 'child' || role === 'teen';
}
