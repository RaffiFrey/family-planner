import { addFloating, floatingToLocalDate, localDateToFloating } from '../time/time.js';
import { daysBetween } from './vault.js';

/**
 * German pediatric check-ups (Kinder-Richtlinie of the G-BA) plus the youth check-ups J1/J2.
 * Ages are offsets from the birthday; `end` is exclusive. "4.–5. Lebenswoche" is age
 * 21–34 days, "3.–4. Lebensmonat" is age 2 to 4 months, and so on. `toleranceEnd` is the
 * latest date the statutory health insurance still pays for the check-up.
 */
export const CHECKUP_CODES = [
  'U1',
  'U2',
  'U3',
  'U4',
  'U5',
  'U6',
  'U7',
  'U7a',
  'U8',
  'U9',
  'J1',
  'J2',
] as const;
export type CheckupCode = (typeof CHECKUP_CODES)[number];

type Offset = { days?: number; weeks?: number; months?: number; years?: number };

interface CheckupDefinition {
  code: CheckupCode;
  start: Offset;
  end: Offset;
  toleranceEnd: Offset;
}

export const CHECKUP_SCHEDULE: readonly CheckupDefinition[] = [
  // Right after birth.
  { code: 'U1', start: { days: 0 }, end: { days: 1 }, toleranceEnd: { days: 1 } },
  // 3rd–10th day of life.
  { code: 'U2', start: { days: 2 }, end: { days: 10 }, toleranceEnd: { days: 14 } },
  // 4th–5th week; tolerance 3rd–8th week.
  { code: 'U3', start: { weeks: 3 }, end: { weeks: 5 }, toleranceEnd: { weeks: 8 } },
  // 3rd–4th month; tolerance until 4.5 months.
  { code: 'U4', start: { months: 2 }, end: { months: 4 }, toleranceEnd: { months: 4, days: 15 } },
  // 6th–7th month; tolerance 5th–8th month.
  { code: 'U5', start: { months: 5 }, end: { months: 7 }, toleranceEnd: { months: 8 } },
  // 10th–12th month; tolerance 9th–14th month.
  { code: 'U6', start: { months: 9 }, end: { months: 12 }, toleranceEnd: { months: 14 } },
  // 21st–24th month; tolerance 20th–27th month.
  { code: 'U7', start: { months: 20 }, end: { months: 24 }, toleranceEnd: { months: 27 } },
  // 34th–36th month; tolerance 33rd–38th month.
  { code: 'U7a', start: { months: 33 }, end: { months: 36 }, toleranceEnd: { months: 38 } },
  // 46th–48th month; tolerance 43rd–50th month.
  { code: 'U8', start: { months: 45 }, end: { months: 48 }, toleranceEnd: { months: 50 } },
  // 60th–64th month; tolerance 58th–66th month.
  { code: 'U9', start: { months: 59 }, end: { months: 64 }, toleranceEnd: { months: 66 } },
  // Youth check-up J1: 12–14 years (tolerance ±1 year).
  { code: 'J1', start: { years: 12 }, end: { years: 14 }, toleranceEnd: { years: 15 } },
  // J2 (offered by most insurers): 16–17 years.
  { code: 'J2', start: { years: 16 }, end: { years: 18 }, toleranceEnd: { years: 18 } },
];

function addOffset(birthday: string, o: Offset): string {
  let d = localDateToFloating(birthday);
  if (o.years) d = addFloating(d, o.years, 'year');
  if (o.months) d = addFloating(d, o.months, 'month');
  if (o.weeks) d = addFloating(d, o.weeks, 'week');
  if (o.days) d = addFloating(d, o.days, 'day');
  return floatingToLocalDate(d);
}

export type CheckupStatus = 'upcoming' | 'due' | 'overdue' | 'missed' | 'done';

export interface CheckupWindow {
  code: CheckupCode;
  /** First day of the recommended window. */
  from: string;
  /** Last day of the recommended window (inclusive). */
  to: string;
  /** Last day the check-up can still be done (inclusive). */
  latest: string;
  status: CheckupStatus;
  doneOn: string | null;
}

function lastDay(exclusive: string): string {
  return floatingToLocalDate(addFloating(localDateToFloating(exclusive), -1, 'day'));
}

/** All check-up windows for a child born on `birthday`, with status relative to `today`. */
export function checkupWindows(
  birthday: string,
  today: string,
  done: Readonly<Partial<Record<CheckupCode, string>>> = {},
): CheckupWindow[] {
  const doneOf = (c: CheckupCode): string | null => done[c] ?? null;
  return CHECKUP_SCHEDULE.map((def) => {
    const from = addOffset(birthday, def.start);
    const to = lastDay(addOffset(birthday, def.end));
    const latest = lastDay(addOffset(birthday, def.toleranceEnd));
    const doneOn = doneOf(def.code);
    let status: CheckupStatus;
    if (doneOn) status = 'done';
    else if (today < from) status = 'upcoming';
    else if (today <= to) status = 'due';
    else if (today <= latest) status = 'overdue';
    else status = 'missed';
    return {
      code: def.code,
      from,
      to: to < from ? from : to,
      latest: latest < from ? from : latest,
      status,
      doneOn,
    };
  });
}

/**
 * Reminder stage for a check-up today: `open` in the first two weeks of the window, `closing`
 * in the last week of a longer window, `overdue` in the two weeks after it closed.
 * Callers send each stage once (once-keys); the short stage windows keep a daily job from
 * re-sending after once-keys expire and from nagging about long-past check-ups.
 */
export function checkupReminderStage(
  w: CheckupWindow,
  today: string,
): 'open' | 'closing' | 'overdue' | null {
  if (w.status === 'overdue') return daysBetween(w.to, today) <= 14 ? 'overdue' : null;
  if (w.status !== 'due') return null;
  if (daysBetween(today, w.to) <= 7 && daysBetween(w.from, w.to) > 14) return 'closing';
  return daysBetween(w.from, today) <= 14 ? 'open' : null;
}
