import { addFloating, type DurationUnit, floatingToInstant, toWallTime } from '../time/time.js';
import { nextOccurrence, parseRecurrenceRule, RecurrenceError } from './series.js';

/**
 * - `fixed`: follows a calendar rule ("every Monday"), independent of when it was done.
 * - `floating`: next due is computed from the completion ("water plants 3 days after watering").
 */
export type TaskRecurrence =
  { mode: 'fixed'; rrule: string } | { mode: 'floating'; interval: number; unit: DurationUnit };

export function validateTaskRecurrence(r: TaskRecurrence): void {
  if (r.mode === 'fixed') {
    parseRecurrenceRule(r.rrule);
    return;
  }
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 1000) {
    throw new RecurrenceError('interval must be an integer between 1 and 1000');
  }
}

export interface NextDueInput {
  recurrence: TaskRecurrence;
  timeZone: string;
  /** First due date of the series (DTSTART for fixed rules). */
  anchor: Date;
  /** Due date of the instance that was just completed (or skipped). */
  currentDue: Date;
  /** When it was completed; for skips pass `currentDue`. */
  completedAt: Date;
}

/** Due date of the next instance, or null when the series has ended. */
export function nextDueDate(input: NextDueInput): Date | null {
  const { recurrence, timeZone } = input;
  validateTaskRecurrence(recurrence);
  if (recurrence.mode === 'fixed') {
    // Completing late skips missed occurrences; completing early keeps the schedule.
    const after = input.completedAt > input.currentDue ? input.completedAt : input.currentDue;
    return nextOccurrence(
      { start: input.anchor, end: input.anchor, timeZone, allDay: false, rrule: recurrence.rrule },
      after,
    );
  }
  // Floating: completion day + interval, keeping the time-of-day of the original due date.
  const done = toWallTime(input.completedAt, timeZone);
  const dueTime = toWallTime(input.currentDue, timeZone);
  const shifted = addFloating(
    new Date(Date.UTC(done.year, done.month - 1, done.day)),
    recurrence.interval,
    recurrence.unit,
  );
  return floatingToInstant(
    new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        dueTime.hour,
        dueTime.minute,
        dueTime.second,
      ),
    ),
    timeZone,
  );
}

/**
 * Round-robin chore rotation. Returns the member after `current`,
 * skipping members in `skip` (e.g. on holiday). Null when nobody is available.
 */
export function nextAssignee(
  rotation: readonly string[],
  current: string | null,
  skip: ReadonlySet<string> = new Set(),
): string | null {
  if (rotation.length === 0) return null;
  const startIdx = current === null ? -1 : rotation.indexOf(current);
  for (let step = 1; step <= rotation.length; step++) {
    const candidate = rotation[(startIdx + step + rotation.length) % rotation.length] as string;
    if (!skip.has(candidate)) return candidate;
  }
  return null;
}

export interface InstanceOutcome {
  dueAt: Date;
  completedAt: Date | null;
  skipped?: boolean;
}

/**
 * Number of consecutive most-recent instances completed on time (by the end of their due day).
 * Skipped instances neither break nor extend the streak.
 */
export function computeStreak(
  instances: readonly InstanceOutcome[],
  timeZone: string,
  now: Date,
): number {
  const past = [...instances]
    .filter((i) => i.dueAt <= now || i.completedAt !== null)
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  let streak = 0;
  for (const i of past) {
    if (i.skipped) continue;
    if (!i.completedAt) {
      const dueDayEnd = endOfDay(i.dueAt, timeZone);
      if (dueDayEnd > now) continue; // still open today, doesn't break the streak yet
      break;
    }
    if (i.completedAt > endOfDay(i.dueAt, timeZone)) break;
    streak++;
  }
  return streak;
}

function endOfDay(instant: Date, timeZone: string): Date {
  const w = toWallTime(instant, timeZone);
  const next = addFloating(new Date(Date.UTC(w.year, w.month - 1, w.day)), 1, 'day');
  return floatingToInstant(next, timeZone);
}
