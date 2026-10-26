import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromWallTime, localDateToFloating, toWallTime } from '../time/time.js';
import {
  expandOccurrences,
  isOccurrence,
  nextOccurrence,
  parseRecurrenceRule,
  RecurrenceError,
  type SeriesDefinition,
  seriesEnd,
  splitSeries,
} from './series.js';

const TZ = 'Europe/Berlin';
const at = (y: number, mo: number, d: number, h = 9, mi = 0) =>
  fromWallTime({ year: y, month: mo, day: d, hour: h, minute: mi, second: 0 }, TZ);

function weekly(rrule = 'FREQ=WEEKLY;BYDAY=MO'): SeriesDefinition {
  return { start: at(2026, 3, 2), end: at(2026, 3, 2, 10), timeZone: TZ, allDay: false, rrule };
}

describe('parseRecurrenceRule', () => {
  it('accepts the supported subset', () => {
    expect(parseRecurrenceRule('FREQ=MONTHLY;BYDAY=-1FR').freq).toBeDefined();
    expect(parseRecurrenceRule('RRULE:FREQ=DAILY;INTERVAL=3').interval).toBe(3);
  });

  it.each([
    '',
    'INTERVAL=2',
    'FREQ=HOURLY',
    'FREQ=DAILY;BYHOUR=3',
    'FREQ=DAILY;COUNT=2;UNTIL=20260101T000000Z',
    'FREQ=DAILY;FREQ=WEEKLY',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;COUNT',
  ])('rejects %s', (rule) => {
    expect(() => parseRecurrenceRule(rule)).toThrow(RecurrenceError);
  });
});

describe('expandOccurrences', () => {
  it('returns a single event when not recurring', () => {
    const s: SeriesDefinition = { ...weekly(), rrule: null };
    expect(expandOccurrences(s, { from: at(2026, 3, 1), to: at(2026, 3, 3) })).toHaveLength(1);
    expect(expandOccurrences(s, { from: at(2026, 3, 3), to: at(2026, 3, 4) })).toHaveLength(0);
  });

  it('keeps 09:00 local across the DST change', () => {
    const occ = expandOccurrences(weekly(), { from: at(2026, 3, 1), to: at(2026, 4, 30) });
    expect(occ.length).toBe(9);
    for (const o of occ) expect(toWallTime(o.start, TZ).hour).toBe(9);
    expect(occ[3]?.start.toISOString()).toBe('2026-03-23T08:00:00.000Z');
    expect(occ[4]?.start.toISOString()).toBe('2026-03-30T07:00:00.000Z');
  });

  it('includes an occurrence that started before the range but still runs', () => {
    const occ = expandOccurrences(weekly(), {
      from: at(2026, 3, 2, 9, 30),
      to: at(2026, 3, 2, 11),
    });
    expect(occ).toHaveLength(1);
  });

  it('handles monthly on the 31st (skips short months) and last Friday', () => {
    const s: SeriesDefinition = {
      start: at(2026, 1, 31),
      end: at(2026, 1, 31, 10),
      timeZone: TZ,
      allDay: false,
      rrule: 'FREQ=MONTHLY',
    };
    const occ = expandOccurrences(s, { from: at(2026, 1, 1), to: at(2026, 6, 1) });
    expect(occ.map((o) => toWallTime(o.start, TZ).month)).toEqual([1, 3, 5]);
    const lastFri = expandOccurrences(
      { ...s, start: at(2026, 1, 30), end: at(2026, 1, 30, 10), rrule: 'FREQ=MONTHLY;BYDAY=-1FR' },
      { from: at(2026, 1, 1), to: at(2026, 4, 1) },
    );
    expect(lastFri.map((o) => toWallTime(o.start, TZ).day)).toEqual([30, 27, 27]);
  });

  it('handles yearly birthdays on Feb 29 only in leap years', () => {
    const s: SeriesDefinition = {
      start: localDateToFloating('2028-02-29'),
      end: localDateToFloating('2028-03-01'),
      timeZone: TZ,
      allDay: true,
      rrule: 'FREQ=YEARLY',
    };
    const occ = expandOccurrences(s, {
      from: localDateToFloating('2028-01-01'),
      to: localDateToFloating('2033-01-01'),
    });
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      '2028-02-29',
      '2032-02-29',
    ]);
  });

  it('applies cancellations and moves, including moves into the range', () => {
    const s = weekly('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
    const occ = expandOccurrences(s, { from: at(2026, 3, 1), to: at(2026, 3, 17) }, [
      { originalStart: at(2026, 3, 9), cancelled: true },
      { originalStart: at(2026, 3, 23), start: at(2026, 3, 13, 15), end: at(2026, 3, 13, 16) },
    ]);
    expect(occ.map((o) => [o.start.toISOString(), o.modified])).toEqual([
      [at(2026, 3, 2).toISOString(), false],
      [at(2026, 3, 13, 15).toISOString(), true],
      [at(2026, 3, 16).toISOString(), false],
    ]);
  });

  it('ignores exceptions that do not belong to the series', () => {
    const occ = expandOccurrences(weekly(), { from: at(2026, 3, 1), to: at(2026, 3, 8) }, [
      { originalStart: at(2026, 3, 4), start: at(2026, 3, 5), end: at(2026, 3, 5, 10) },
    ]);
    expect(occ).toHaveLength(1);
  });

  it('counts zero-length entries that start inside the range', () => {
    const s: SeriesDefinition = { ...weekly(), end: at(2026, 3, 2) };
    expect(expandOccurrences(s, { from: at(2026, 3, 2), to: at(2026, 3, 3) })).toHaveLength(1);
  });

  it('guards against runaway expansion', () => {
    const s: SeriesDefinition = { ...weekly('FREQ=DAILY') };
    expect(() =>
      expandOccurrences(s, { from: at(2026, 1, 1), to: at(2030, 1, 1) }, [], 100),
    ).toThrow(RecurrenceError);
  });

  it('rejects end before start', () => {
    expect(() =>
      expandOccurrences(
        { ...weekly(), end: at(2026, 3, 1) },
        { from: at(2026, 1, 1), to: at(2026, 4, 1) },
      ),
    ).toThrow();
  });

  it('every daily occurrence is at local 09:00 for any window (property)', () => {
    const s: SeriesDefinition = { ...weekly('FREQ=DAILY') };
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 700 }),
        fc.integer({ min: 1, max: 40 }),
        (offset, len) => {
          const from = new Date(at(2026, 3, 2).getTime() + offset * 86400000);
          const to = new Date(from.getTime() + len * 86400000);
          const occ = expandOccurrences(s, { from, to });
          for (const o of occ) expect(toWallTime(o.start, TZ).hour).toBe(9);
          expect(occ.length).toBeGreaterThanOrEqual(len - 1);
          expect(occ.length).toBeLessThanOrEqual(len + 1);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('isOccurrence / nextOccurrence', () => {
  it('identifies occurrences', () => {
    expect(isOccurrence(weekly(), at(2026, 3, 30))).toBe(true);
    expect(isOccurrence(weekly(), at(2026, 3, 31))).toBe(false);
    expect(isOccurrence({ ...weekly(), rrule: null }, at(2026, 3, 2))).toBe(true);
  });

  it('finds the next occurrence', () => {
    expect(nextOccurrence(weekly(), at(2026, 3, 2))?.toISOString()).toBe(
      at(2026, 3, 9).toISOString(),
    );
    expect(nextOccurrence(weekly(), at(2026, 3, 2), true)?.toISOString()).toBe(
      at(2026, 3, 2).toISOString(),
    );
    expect(nextOccurrence(weekly('FREQ=WEEKLY;COUNT=1'), at(2026, 3, 2))).toBeNull();
    expect(nextOccurrence({ ...weekly(), rrule: null }, at(2026, 3, 1))?.toISOString()).toBe(
      at(2026, 3, 2).toISOString(),
    );
    expect(nextOccurrence({ ...weekly(), rrule: null }, at(2026, 3, 3))).toBeNull();
  });
});

describe('splitSeries ("this and following")', () => {
  it('splits a COUNT series preserving the total', () => {
    const s = weekly('FREQ=WEEKLY;BYDAY=MO;COUNT=5');
    expect(splitSeries(s, at(2026, 3, 16))).toEqual({
      headRrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2',
      tailRrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
    });
  });

  it('splits an open series with UNTIL just before the split', () => {
    const split = splitSeries(weekly(), at(2026, 3, 30));
    expect(split.headRrule).toContain('UNTIL=20260330T085959Z');
    const head = expandOccurrences(
      { ...weekly(), rrule: split.headRrule },
      { from: at(2026, 1, 1), to: at(2026, 12, 31) },
    );
    expect(head).toHaveLength(4);
  });

  it('returns no head when splitting at the first occurrence', () => {
    expect(splitSeries(weekly(), at(2026, 3, 2)).headRrule).toBeNull();
  });

  it('rejects invalid split points', () => {
    expect(() => splitSeries({ ...weekly(), rrule: null }, at(2026, 3, 2))).toThrow();
    expect(() => splitSeries(weekly(), at(2026, 3, 3))).toThrow();
  });
});

describe('seriesEnd', () => {
  it('bounds COUNT/UNTIL series and leaves open ones unbounded', () => {
    expect(seriesEnd({ ...weekly(), rrule: null })?.toISOString()).toBe(
      at(2026, 3, 2, 10).toISOString(),
    );
    expect(seriesEnd(weekly('FREQ=WEEKLY;BYDAY=MO;COUNT=3'))?.toISOString()).toBe(
      at(2026, 3, 16, 10).toISOString(),
    );
    expect(seriesEnd(weekly('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260320T000000Z'))?.toISOString()).toBe(
      at(2026, 3, 16, 10).toISOString(),
    );
    expect(seriesEnd(weekly())).toBeNull();
  });
});
