import { describe, expect, it } from 'vitest';
import { fromWallTime, toLocalDate, toWallTime } from '../time/time.js';
import { computeStreak, nextAssignee, nextDueDate, validateTaskRecurrence } from './tasks.js';

const TZ = 'Europe/Berlin';
const at = (y: number, mo: number, d: number, h = 18, mi = 0) =>
  fromWallTime({ year: y, month: mo, day: d, hour: h, minute: mi, second: 0 }, TZ);

describe('nextDueDate', () => {
  it('floating: water plants 3 days after the last watering, same time of day', () => {
    const next = nextDueDate({
      recurrence: { mode: 'floating', interval: 3, unit: 'day' },
      timeZone: TZ,
      anchor: at(2026, 3, 20),
      currentDue: at(2026, 3, 27),
      completedAt: at(2026, 3, 28, 10),
    });
    expect(toLocalDate(next as Date, TZ)).toBe('2026-03-31');
    expect(toWallTime(next as Date, TZ).hour).toBe(18);
  });

  it('floating: completing early also moves the schedule', () => {
    const next = nextDueDate({
      recurrence: { mode: 'floating', interval: 1, unit: 'week' },
      timeZone: TZ,
      anchor: at(2026, 3, 1),
      currentDue: at(2026, 3, 10),
      completedAt: at(2026, 3, 8, 7),
    });
    expect(toLocalDate(next as Date, TZ)).toBe('2026-03-15');
  });

  it('fixed: completing early keeps the schedule', () => {
    const next = nextDueDate({
      recurrence: { mode: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
      timeZone: TZ,
      anchor: at(2026, 3, 2),
      currentDue: at(2026, 3, 9),
      completedAt: at(2026, 3, 7),
    });
    expect(toLocalDate(next as Date, TZ)).toBe('2026-03-16');
  });

  it('fixed: completing late skips missed occurrences', () => {
    const next = nextDueDate({
      recurrence: { mode: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
      timeZone: TZ,
      anchor: at(2026, 3, 2),
      currentDue: at(2026, 3, 9),
      completedAt: at(2026, 3, 25),
    });
    expect(toLocalDate(next as Date, TZ)).toBe('2026-03-30');
  });

  it('fixed: returns null after the last occurrence', () => {
    expect(
      nextDueDate({
        recurrence: { mode: 'fixed', rrule: 'FREQ=DAILY;COUNT=2' },
        timeZone: TZ,
        anchor: at(2026, 3, 2),
        currentDue: at(2026, 3, 3),
        completedAt: at(2026, 3, 3),
      }),
    ).toBeNull();
  });

  it('validates recurrence', () => {
    expect(() => {
      validateTaskRecurrence({ mode: 'floating', interval: 0, unit: 'day' });
    }).toThrow();
    expect(() => {
      validateTaskRecurrence({ mode: 'floating', interval: 1.5, unit: 'day' });
    }).toThrow();
    expect(() => {
      validateTaskRecurrence({ mode: 'fixed', rrule: 'nope' });
    }).toThrow();
  });
});

describe('nextAssignee', () => {
  const rotation = ['anna', 'ben', 'carla'];
  it('rotates round-robin', () => {
    expect(nextAssignee(rotation, 'anna')).toBe('ben');
    expect(nextAssignee(rotation, 'carla')).toBe('anna');
    expect(nextAssignee(rotation, null)).toBe('anna');
    expect(nextAssignee(rotation, 'unknown')).toBe('anna');
  });
  it('skips unavailable members', () => {
    expect(nextAssignee(rotation, 'anna', new Set(['ben']))).toBe('carla');
    expect(nextAssignee(rotation, 'anna', new Set(rotation))).toBeNull();
    expect(nextAssignee([], null)).toBeNull();
  });
});

describe('computeStreak', () => {
  const now = at(2026, 3, 10, 12);
  it('counts consecutive on-time completions', () => {
    expect(
      computeStreak(
        [
          { dueAt: at(2026, 3, 7), completedAt: at(2026, 3, 7, 20) },
          { dueAt: at(2026, 3, 8), completedAt: at(2026, 3, 8, 23, 59) },
          { dueAt: at(2026, 3, 9), completedAt: null, skipped: true },
          { dueAt: at(2026, 3, 10), completedAt: null }, // still open today
          { dueAt: at(2026, 3, 6), completedAt: at(2026, 3, 7, 9) }, // late, breaks
          { dueAt: at(2026, 3, 5), completedAt: at(2026, 3, 5) },
        ],
        TZ,
        now,
      ),
    ).toBe(2);
  });
  it('a missed past instance ends the streak', () => {
    expect(
      computeStreak(
        [
          { dueAt: at(2026, 3, 9), completedAt: null },
          { dueAt: at(2026, 3, 8), completedAt: at(2026, 3, 8) },
        ],
        TZ,
        now,
      ),
    ).toBe(0);
  });
});
