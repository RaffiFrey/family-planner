import { describe, expect, it } from 'vitest';
import {
  addInZone,
  floatingToLocalDate,
  fromWallTime,
  isValidTimeZone,
  localDateToFloating,
  monthRangeInZone,
  parseLocalDate,
  startOfDayInZone,
  toLocalDate,
  toWallTime,
  yearRangeInZone,
} from './time.js';

const TZ = 'Europe/Berlin';

describe('time', () => {
  it('validates time zones', () => {
    expect(isValidTimeZone(TZ)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('round-trips wall time', () => {
    const instant = fromWallTime(
      { year: 2026, month: 7, day: 1, hour: 9, minute: 30, second: 0 },
      TZ,
    );
    expect(instant.toISOString()).toBe('2026-07-01T07:30:00.000Z');
    expect(toWallTime(instant, TZ)).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 9,
      minute: 30,
      second: 0,
    });
  });

  it('keeps wall time when adding a day across the spring DST change', () => {
    const before = fromWallTime(
      { year: 2026, month: 3, day: 28, hour: 9, minute: 0, second: 0 },
      TZ,
    );
    const after = addInZone(before, 1, 'day', TZ);
    expect(toWallTime(after, TZ).hour).toBe(9);
    expect(after.getTime() - before.getTime()).toBe(23 * 3600 * 1000);
  });

  it('clamps month additions to month end', () => {
    const jan31 = fromWallTime(
      { year: 2026, month: 1, day: 31, hour: 12, minute: 0, second: 0 },
      TZ,
    );
    expect(toLocalDate(addInZone(jan31, 1, 'month', TZ), TZ)).toBe('2026-02-28');
    const leap = fromWallTime(
      { year: 2028, month: 2, day: 29, hour: 12, minute: 0, second: 0 },
      TZ,
    );
    expect(toLocalDate(addInZone(leap, 1, 'year', TZ), TZ)).toBe('2029-02-28');
    expect(toLocalDate(addInZone(leap, 2, 'week', TZ), TZ)).toBe('2028-03-14');
  });

  it('computes start of day and month ranges in the zone', () => {
    const t = new Date('2026-06-15T22:30:00Z'); // already June 16 in Berlin
    expect(toLocalDate(t, TZ)).toBe('2026-06-16');
    expect(startOfDayInZone(t, TZ).toISOString()).toBe('2026-06-15T22:00:00.000Z');
    const { start, end } = monthRangeInZone(2026, 12, TZ);
    expect(start.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(yearRangeInZone(2026, TZ).start.toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('parses local dates strictly', () => {
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(() => parseLocalDate('2026-02-29')).toThrow();
    expect(() => parseLocalDate('29.02.2026')).toThrow();
    expect(floatingToLocalDate(localDateToFloating('2026-10-25'))).toBe('2026-10-25');
  });
});
