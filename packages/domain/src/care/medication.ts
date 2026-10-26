import { expandOccurrences, parseRecurrenceRule, RecurrenceError } from '../recurrence/series.js';
import { fromWallTime, parseLocalDate, toLocalDate } from '../time/time.js';

/**
 * Medication plan: fixed wall-clock intake times, repeated by an RRULE
 * (`FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,TH`, `FREQ=DAILY;INTERVAL=2` …) from `startDate`
 * until `endDate` (inclusive). Times stay at 08:00 local time across DST changes.
 */
export interface MedicationSchedule {
  /** "HH:MM", 24h. */
  times: readonly string[];
  rrule: string;
  startDate: string;
  endDate: string | null;
  timeZone: string;
}

export interface MedicationOccurrence {
  at: Date;
  time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(s: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(s);
  if (!m) throw new RecurrenceError(`Invalid time "${s}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function validateMedicationSchedule(s: MedicationSchedule): void {
  if (s.times.length === 0) throw new RecurrenceError('At least one intake time is required');
  for (const t of s.times) parseTimeOfDay(t);
  parseRecurrenceRule(s.rrule);
  parseLocalDate(s.startDate);
  if (s.endDate !== null) {
    parseLocalDate(s.endDate);
    if (s.endDate < s.startDate) throw new RecurrenceError('endDate must not be before startDate');
  }
}

/** Intake times in `[from, to)`, sorted. */
export function medicationOccurrences(
  s: MedicationSchedule,
  range: { from: Date; to: Date },
): MedicationOccurrence[] {
  validateMedicationSchedule(s);
  const day = parseLocalDate(s.startDate);
  const result: MedicationOccurrence[] = [];
  for (const time of new Set(s.times)) {
    const { hour, minute } = parseTimeOfDay(time);
    const start = fromWallTime({ ...day, hour, minute, second: 0 }, s.timeZone);
    for (const o of expandOccurrences(
      { start, end: start, timeZone: s.timeZone, allDay: false, rrule: s.rrule },
      range,
    )) {
      if (s.endDate !== null && toLocalDate(o.start, s.timeZone) > s.endDate) continue;
      result.push({ at: o.start, time });
    }
  }
  return result.sort((a, b) => a.at.getTime() - b.at.getTime());
}
