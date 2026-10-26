import type { Occurrence } from '@fp/contracts';
import {
  addFloating,
  floatingToLocalDate,
  fromWallTime,
  localDateToFloating,
  parseLocalDate,
  toLocalDate,
  toWallTime,
} from '@fp/domain/time';

/** A calendar day as `YYYY-MM-DD` in the household time zone. */
export type DayKey = string;

export type CalendarView = 'month' | 'week' | 'day';

const DAY_MS = 86_400_000;

export function addDays(key: DayKey, n: number): DayKey {
  return floatingToLocalDate(addFloating(localDateToFloating(key), n, 'day'));
}

export function addMonths(key: DayKey, n: number): DayKey {
  return floatingToLocalDate(addFloating(localDateToFloating(key), n, 'month'));
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(key: DayKey): number {
  return (localDateToFloating(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: DayKey): DayKey {
  return addDays(key, -weekdayIndex(key));
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 8)}01`;
}

export function todayKey(timeZone: string): DayKey {
  return toLocalDate(new Date(), timeZone);
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((localDateToFloating(b).getTime() - localDateToFloating(a).getTime()) / DAY_MS);
}

/** Instant of 00:00 on `key` in `timeZone`. */
export function dayStart(key: DayKey, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(key);
  return fromWallTime({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function atTime(key: DayKey, time: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(key);
  const [h, m] = time.split(':').map(Number);
  return fromWallTime({ year, month, day, hour: h ?? 0, minute: m ?? 0, second: 0 }, timeZone);
}

export function timeOf(instant: Date, timeZone: string): string {
  const w = toWallTime(instant, timeZone);
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}

/** Days shown for a view around the anchor day. */
export function visibleDays(view: CalendarView, anchor: DayKey): DayKey[] {
  if (view === 'day') return [anchor];
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const end = addDays(startOfWeek(lastOfMonth), 6);
  return Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i));
}

export function shiftAnchor(view: CalendarView, anchor: DayKey, dir: -1 | 1): DayKey {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  return addMonths(startOfMonth(anchor), dir);
}

/** Floating date for display formatting with `timeZone: 'UTC'`. */
export function keyToDate(key: DayKey): Date {
  return localDateToFloating(key);
}

export interface DaySpan {
  startKey: DayKey;
  /** Inclusive last day. */
  endKey: DayKey;
}

/** Which household-local days an occurrence covers. All-day events are UTC-midnight based with exclusive end. */
export function occurrenceSpan(
  o: Pick<Occurrence, 'start' | 'end' | 'allDay'>,
  timeZone: string,
): DaySpan {
  const start = new Date(o.start);
  const end = new Date(o.end);
  if (o.allDay) {
    const startKey = floatingToLocalDate(start);
    const endExcl = floatingToLocalDate(end);
    return { startKey, endKey: endExcl > startKey ? addDays(endExcl, -1) : startKey };
  }
  const startKey = toLocalDate(start, timeZone);
  const endKey = end > start ? toLocalDate(new Date(end.getTime() - 1), timeZone) : startKey;
  return { startKey, endKey };
}

/** Events shown in the all-day row of time grids (all-day or spanning several days). */
export function isBanner(
  o: Pick<Occurrence, 'start' | 'end' | 'allDay'>,
  timeZone: string,
): boolean {
  if (o.allDay) return true;
  const span = occurrenceSpan(o, timeZone);
  return span.startKey !== span.endKey;
}

export interface TimedLayout<T> {
  item: T;
  /** Minutes since 00:00 of the day. */
  top: number;
  bottom: number;
  column: number;
  columns: number;
}

/** Places same-day timed events into side-by-side columns where they overlap. */
export function layoutTimed<T extends Pick<Occurrence, 'start' | 'end'>>(
  items: T[],
  key: DayKey,
  timeZone: string,
): TimedLayout<T>[] {
  const from = dayStart(key, timeZone).getTime();
  const to = dayStart(addDays(key, 1), timeZone).getTime();
  const placed = items
    .map((item) => {
      const s = Math.max(new Date(item.start).getTime(), from);
      const e = Math.min(Math.max(new Date(item.end).getTime(), s + 15 * 60_000), to);
      const minutes = (instant: number) => {
        if (instant >= to) return 24 * 60;
        const w = toWallTime(new Date(instant), timeZone);
        return w.hour * 60 + w.minute;
      };
      return {
        item,
        top: minutes(s),
        bottom: Math.max(minutes(e), minutes(s) + 15),
        column: 0,
        columns: 1,
      };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let cluster: typeof placed = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.column + 1));
    for (const p of cluster) p.columns = cols;
    cluster = [];
  };
  for (const p of placed) {
    if (p.top >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.bottom > p.top).map((c) => c.column));
    let col = 0;
    while (used.has(col)) col++;
    p.column = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.bottom);
  }
  if (cluster.length) flush();
  return placed;
}
