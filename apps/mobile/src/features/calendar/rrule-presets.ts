/**
 * Recurrence presets offered in the event and chore forms, mapped to RFC 5545 RRULE bodies
 * (without DTSTART, as the API expects, e.g. `FREQ=WEEKLY;INTERVAL=2`).
 * The weekday/day of month comes from the start date, so presets don't need BYDAY/BYMONTHDAY.
 */
export const RECURRENCE_PRESETS = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
] as const;
export type RecurrencePreset = (typeof RECURRENCE_PRESETS)[number];
/** An RRULE the presets can't express (created elsewhere); it is kept unchanged. */
export type RecurrenceChoice = RecurrencePreset | 'custom';

const PRESET_RULES: Record<Exclude<RecurrencePreset, 'none'>, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

export interface PresetOptions {
  /** Last day (inclusive, `YYYY-MM-DD`) on which the series may occur. */
  until?: string | null;
  /** Number of occurrences. Ignored when `until` is set. */
  count?: number | null;
}

/** Builds the RRULE body for a preset, or null for "does not repeat". */
export function presetToRRule(
  preset: RecurrencePreset,
  options: PresetOptions = {},
): string | null {
  if (preset === 'none') return null;
  let rule = PRESET_RULES[preset];
  if (options.until) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.until))
      throw new Error(`Invalid until date "${options.until}"`);
    rule += `;UNTIL=${options.until.replace(/-/g, '')}T235959Z`;
  } else if (options.count != null) {
    if (!Number.isInteger(options.count) || options.count < 1)
      throw new Error('count must be a positive integer');
    rule += `;COUNT=${options.count}`;
  }
  return rule;
}

function parts(rrule: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of rrule
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')) {
    const [k, v] = part.split('=');
    if (k && v) map.set(k.toUpperCase(), v.toUpperCase());
  }
  return map;
}

/** Recognises preset rules (ignoring UNTIL/COUNT); anything else is `custom`. */
export function rruleToPreset(rrule: string | null | undefined): RecurrenceChoice {
  if (!rrule || rrule.trim() === '') return 'none';
  const p = parts(rrule);
  p.delete('UNTIL');
  p.delete('COUNT');
  const interval = p.get('INTERVAL') ?? '1';
  p.delete('INTERVAL');
  const freq = p.get('FREQ');
  p.delete('FREQ');
  const byday = p.get('BYDAY');
  p.delete('BYDAY');
  if (p.size > 0) return 'custom';
  if (freq === 'WEEKLY' && byday === 'MO,TU,WE,TH,FR' && interval === '1') return 'weekdays';
  if (byday !== undefined) return 'custom';
  if (freq === 'DAILY' && interval === '1') return 'daily';
  if (freq === 'WEEKLY' && interval === '1') return 'weekly';
  if (freq === 'WEEKLY' && interval === '2') return 'biweekly';
  if (freq === 'MONTHLY' && interval === '1') return 'monthly';
  if (freq === 'YEARLY' && interval === '1') return 'yearly';
  return 'custom';
}

/** `UNTIL` of a rule as `YYYY-MM-DD`, if present. */
export function rruleUntil(rrule: string | null | undefined): string | null {
  if (!rrule) return null;
  const until = parts(rrule).get('UNTIL');
  const m = until ? /^(\d{4})(\d{2})(\d{2})/.exec(until) : null;
  return m ? `${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}` : null;
}
