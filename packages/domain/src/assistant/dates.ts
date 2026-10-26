import {
  addFloating,
  floatingToLocalDate,
  fromWallTime,
  localDateToFloating,
  parseLocalDate,
  toLocalDate,
  toWallTime,
} from '../time/time.js';

export class AssistantInputError extends Error {
  override name = 'AssistantInputError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Parses "HH:mm" (24h) into hour/minute. */
export function parseLocalTime(s: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(s.trim());
  if (!m) throw new AssistantInputError('invalid_time', `Invalid time "${s}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Validated local calendar date; throws AssistantInputError instead of a generic Error. */
export function checkLocalDate(s: string): string {
  try {
    parseLocalDate(s);
    return s;
  } catch {
    throw new AssistantInputError('invalid_date', `Invalid date "${s}"`);
  }
}

/** Instant of a local date + "HH:mm" wall time in `timeZone`. */
export function localDateTimeToInstant(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(checkLocalDate(date));
  const { hour, minute } = parseLocalTime(time);
  return fromWallTime({ year, month, day, hour, minute, second: 0 }, timeZone);
}

/** Adds whole days to a local date ("2026-10-31" + 1 → "2026-11-01"). */
export function addDaysToLocalDate(date: string, days: number): string {
  return floatingToLocalDate(addFloating(localDateToFloating(checkLocalDate(date)), days, 'day'));
}

/**
 * Calendar cheat sheet for the prompt: today plus the next `days` days with weekday names,
 * so the model resolves "nächsten Dienstag" against real dates instead of doing date math.
 */
export function dateContext(now: Date, timeZone: string, locale = 'de', days = 14): string {
  const today = toLocalDate(now, timeZone);
  const w = toWallTime(now, timeZone);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const lines: string[] = [];
  for (let i = 0; i <= days; i++) {
    const d = addDaysToLocalDate(today, i);
    lines.push(`${d} ${fmt.format(localDateToFloating(d))}${i === 0 ? ' (today)' : ''}`);
  }
  const time = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
  return `Now: ${today} ${time} (${timeZone})\n${lines.join('\n')}`;
}
