import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  parse,
  startOfMonth,
} from 'date-fns';

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDayKey(key: string): Date {
  return parse(key, 'yyyy-MM-dd', new Date(2000, 0, 1));
}

export function monthDays(month: Date): Date[] {
  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
}

/** Query range covering a whole local month: [first day 00:00, first day of next month 00:00). */
export function monthRange(month: Date): { from: Date; to: Date } {
  const from = startOfMonth(month);
  return { from, to: addDays(endOfMonth(month), 1) };
}

/** All-day events are stored as midnight UTC of the first day with an exclusive end. */
export function allDayIso(key: string): string {
  return `${key}T00:00:00.000Z`;
}

/** Day key of an all-day instant (floating UTC midnight). */
export function allDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Exclusive all-day end for an inclusive last day. */
export function allDayEndIso(lastDayKey: string): string {
  return allDayIso(dayKey(addDays(parseDayKey(lastDayKey), 1)));
}

/** Combines a day key and `HH:mm` into a local Date, or null when the time is invalid. */
export function combineDayAndTime(key: string, time: string): Date | null {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return null;
  const d = parse(`${key} ${time.padStart(5, '0')}`, 'yyyy-MM-dd HH:mm', new Date(2000, 0, 1));
  return isValid(d) ? d : null;
}

export function timeOf(d: Date): string {
  return format(d, 'HH:mm');
}

interface Spanning {
  start: string;
  end: string;
  allDay: boolean;
}

/** Local day keys an occurrence touches (multi-day events appear on every day). */
export function occurrenceDayKeys(o: Spanning): string[] {
  if (o.allDay) {
    const first = parseDayKey(allDayKey(o.start));
    const lastExclusive = parseDayKey(allDayKey(o.end));
    const last = lastExclusive > first ? addDays(lastExclusive, -1) : first;
    return eachDayOfInterval({ start: first, end: last }).map(dayKey);
  }
  const start = new Date(o.start);
  const end = new Date(o.end);
  // An event ending exactly at midnight does not touch the next day.
  const lastInstant = end > start ? new Date(end.getTime() - 1) : start;
  return eachDayOfInterval({ start, end: lastInstant }).map(dayKey);
}
