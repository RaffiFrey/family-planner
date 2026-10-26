import { TZDate } from '@date-fns/tz';

/** Wall-clock components in a specific IANA time zone. */
export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const DEFAULT_TIMEZONE = 'Europe/Berlin';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function toWallTime(instant: Date, timeZone: string): WallTime {
  const z = new TZDate(instant.getTime(), timeZone);
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    second: z.getSeconds(),
  };
}

/** Resolves a wall-clock time in `timeZone` to an absolute instant (times in DST gaps shift forward). */
export function fromWallTime(w: WallTime, timeZone: string): Date {
  const z = new TZDate(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, timeZone);
  return new Date(z.getTime());
}

/**
 * "Floating" representation: wall-clock components encoded as a UTC Date.
 * Calendar math (rrule, add days) runs on floating dates so it is independent of DST.
 */
export function wallToFloating(w: WallTime): Date {
  return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second));
}

export function floatingToWall(d: Date): WallTime {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function instantToFloating(instant: Date, timeZone: string): Date {
  return wallToFloating(toWallTime(instant, timeZone));
}

export function floatingToInstant(floating: Date, timeZone: string): Date {
  return fromWallTime(floatingToWall(floating), timeZone);
}

export type DurationUnit = 'day' | 'week' | 'month' | 'year';

export function addFloating(f: Date, amount: number, unit: DurationUnit): Date {
  const d = new Date(f.getTime());
  switch (unit) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + amount);
      return d;
    case 'week':
      d.setUTCDate(d.getUTCDate() + amount * 7);
      return d;
    case 'month':
    case 'year': {
      const months = unit === 'month' ? amount : amount * 12;
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + months);
      // Clamp to month end: Jan 31 + 1 month = Feb 28/29.
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, lastDay));
      return d;
    }
  }
}

/** Adds calendar units in local wall time, so "+1 day" stays at 09:00 across DST changes. */
export function addInZone(
  instant: Date,
  amount: number,
  unit: DurationUnit,
  timeZone: string,
): Date {
  return floatingToInstant(
    addFloating(instantToFloating(instant, timeZone), amount, unit),
    timeZone,
  );
}

export function startOfDayInZone(instant: Date, timeZone: string): Date {
  const w = toWallTime(instant, timeZone);
  return fromWallTime({ ...w, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function formatLocalDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** ISO calendar date (YYYY-MM-DD) of an instant as seen in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string): string {
  const w = toWallTime(instant, timeZone);
  return formatLocalDate(w.year, w.month, w.day);
}

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(s: string): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid local date "${s}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date "${s}"`);
  }
  return { year, month, day };
}

/** All-day dates are carried as floating UTC midnight. */
export function localDateToFloating(s: string): Date {
  const { year, month, day } = parseLocalDate(s);
  return new Date(Date.UTC(year, month - 1, day));
}

export function floatingToLocalDate(d: Date): string {
  return formatLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Month range [start, end) in the given zone, for budget periods and reports. */
export function monthRangeInZone(
  year: number,
  month: number,
  timeZone: string,
): { start: Date; end: Date } {
  const start = fromWallTime({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = fromWallTime(
    { year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  return { start, end };
}

export function yearRangeInZone(year: number, timeZone: string): { start: Date; end: Date } {
  return {
    start: fromWallTime({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
    end: fromWallTime(
      { year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      timeZone,
    ),
  };
}
