export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** Monday-first, as in DACH calendars. */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type RecurrenceEnd =
  { type: 'never' } | { type: 'until'; date: string } | { type: 'count'; count: number };

export interface RecurrenceValue {
  freq: Frequency;
  interval: number;
  byDay: Weekday[];
  end: RecurrenceEnd;
}

export const DEFAULT_RECURRENCE: RecurrenceValue = {
  freq: 'WEEKLY',
  interval: 1,
  byDay: [],
  end: { type: 'never' },
};

/** Builds an RFC 5545 RRULE body (without the `RRULE:` prefix), e.g. `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE`. */
export function buildRRule(v: RecurrenceValue): string {
  const parts = [`FREQ=${v.freq}`];
  if (v.interval > 1) parts.push(`INTERVAL=${Math.floor(v.interval)}`);
  if (v.freq === 'WEEKLY' && v.byDay.length > 0) {
    parts.push(`BYDAY=${WEEKDAYS.filter((d) => v.byDay.includes(d)).join(',')}`);
  }
  if (v.end.type === 'until') parts.push(`UNTIL=${v.end.date.replaceAll('-', '')}T235959Z`);
  if (v.end.type === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(v.end.count))}`);
  return parts.join(';');
}

/** Parses the subset produced by `buildRRule`. Returns null for rules this UI cannot represent. */
export function parseRRule(rrule: string | null | undefined): RecurrenceValue | null {
  if (!rrule) return null;
  const map = new Map<string, string>();
  for (const part of rrule
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')) {
    const [k, val] = part.split('=');
    if (k && val) map.set(k.toUpperCase(), val.toUpperCase());
  }
  const freq = map.get('FREQ');
  if (!freq || !(FREQUENCIES as readonly string[]).includes(freq)) return null;
  const interval = Number(map.get('INTERVAL') ?? '1');
  const byDay = (map.get('BYDAY') ?? '')
    .split(',')
    .filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d));
  let end: RecurrenceEnd = { type: 'never' };
  const until = map.get('UNTIL');
  const count = map.get('COUNT');
  if (until && /^\d{8}/.test(until)) {
    end = { type: 'until', date: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` };
  } else if (count) {
    end = { type: 'count', count: Number(count) };
  }
  return {
    freq: freq as Frequency,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    byDay,
    end,
  };
}

/** Weekday code of a date in local time. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7] ?? 'MO';
}
