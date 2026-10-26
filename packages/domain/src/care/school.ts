import {
  addFloating,
  floatingToLocalDate,
  localDateToFloating,
  parseLocalDate,
} from '../time/time.js';

/** German federal states (Bundesländer) by their official two-letter code. */
export const GERMAN_STATES = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;
export type GermanState = (typeof GERMAN_STATES)[number];

export function isGermanState(s: string): s is GermanState {
  return (GERMAN_STATES as readonly string[]).includes(s);
}

export interface SchoolHoliday {
  name: string;
  /** First day (inclusive). */
  start: string;
  /** Last day (inclusive). */
  end: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

function datePart(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = DATE_PREFIX.exec(v);
  if (!m) return null;
  try {
    parseLocalDate(m[1] as string);
    return m[1] as string;
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  return s.length ? (s[0] as string).toUpperCase() + s.slice(1) : s;
}

function dedupe(list: SchoolHoliday[]): SchoolHoliday[] {
  const seen = new Set<string>();
  return list
    .filter((h) => {
      const key = `${h.start}|${h.end}|${h.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return h.end >= h.start;
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/**
 * Parses an OpenHolidays API response (`/SchoolHolidays`):
 * `[{ startDate, endDate, name: [{ language, text }] }]` with inclusive dates.
 */
export function parseOpenHolidays(json: unknown, language = 'DE'): SchoolHoliday[] {
  if (!Array.isArray(json)) throw new Error('Unexpected holiday response');
  const out: SchoolHoliday[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const start = datePart(item.startDate);
    const end = datePart(item.endDate);
    if (!start || !end) continue;
    const names = Array.isArray(item.name) ? item.name.filter(isRecord) : [];
    const name = names.find((n) => n.language === language)?.text ?? names[0]?.text ?? 'Ferien';
    out.push({ name: typeof name === 'string' ? name : 'Ferien', start, end });
  }
  return dedupe(out);
}

/**
 * Parses a ferien-api.de response (`/api/v1/holidays/{STATE}/{YEAR}`):
 * `[{ start: "2026-03-30T00:00Z", end: "2026-04-10T00:00Z", name: "osterferien" }]`.
 * `end` is the last day of the holidays.
 */
export function parseFerienApi(json: unknown): SchoolHoliday[] {
  if (!Array.isArray(json)) throw new Error('Unexpected holiday response');
  const out: SchoolHoliday[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const start = datePart(item.start);
    const end = datePart(item.end);
    if (!start || !end) continue;
    out.push({
      name: capitalize(typeof item.name === 'string' ? item.name : 'Ferien'),
      start,
      end,
    });
  }
  return dedupe(out);
}

/** Holidays overlapping the inclusive date range. */
export function holidaysInRange(
  holidays: readonly SchoolHoliday[],
  from: string,
  to: string,
): SchoolHoliday[] {
  return dedupe(holidays.filter((h) => h.start <= to && h.end >= from));
}

export function isSchoolHoliday(holidays: readonly SchoolHoliday[], date: string): boolean {
  return holidays.some((h) => h.start <= date && h.end >= date);
}

/** ISO weekday 1 (Monday) … 7 (Sunday) of a local date. */
export function isoWeekday(date: string): number {
  const d = localDateToFloating(date).getUTCDay();
  return d === 0 ? 7 : d;
}

function mondayOf(date: string): string {
  return floatingToLocalDate(addFloating(localDateToFloating(date), 1 - isoWeekday(date), 'day'));
}

/** A/B week rotation: the week containing `anchor` is an A week. */
export function abWeek(date: string, anchor: string): 'A' | 'B' {
  const weeks = Math.round(
    (localDateToFloating(mondayOf(date)).getTime() -
      localDateToFloating(mondayOf(anchor)).getTime()) /
      (7 * 86_400_000),
  );
  return Math.abs(weeks) % 2 === 0 ? 'A' : 'B';
}

export interface TimetableSlot {
  weekday: number;
  period: number;
  startTime: string;
  validFrom: string | null;
  validTo: string | null;
  week: 'A' | 'B' | null;
}

/** Lessons of a given day, honouring validity and A/B weeks; empty during school holidays. */
export function timetableForDate<T extends TimetableSlot>(
  entries: readonly T[],
  date: string,
  options: { abAnchor?: string | null; holidays?: readonly SchoolHoliday[] } = {},
): T[] {
  if (options.holidays && isSchoolHoliday(options.holidays, date)) return [];
  const weekday = isoWeekday(date);
  const week = options.abAnchor ? abWeek(date, options.abAnchor) : null;
  return entries
    .filter(
      (e) =>
        e.weekday === weekday &&
        (e.validFrom === null || e.validFrom <= date) &&
        (e.validTo === null || e.validTo >= date) &&
        (e.week === null || week === null || e.week === week),
    )
    .sort((a, b) => a.period - b.period || (a.startTime < b.startTime ? -1 : 1));
}
