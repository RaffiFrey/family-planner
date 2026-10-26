import type { TaskRecurrence } from '@fp/contracts';
import {
  presetToRRule,
  type RecurrencePreset,
  rruleToPreset,
} from '@/features/calendar/rrule-presets';

export type RecurrenceMode = 'none' | 'fixed' | 'floating';
export type FloatingUnit = 'day' | 'week' | 'month' | 'year';
export type FixedPreset = Exclude<RecurrencePreset, 'none'>;

/** Form state of the chore recurrence editor. */
export interface RecurrenceFormState {
  mode: RecurrenceMode;
  /** Fixed schedule ("every Monday"). */
  preset: FixedPreset | 'custom';
  /** An RRULE the presets can't express; kept as-is while preset is `custom`. */
  customRule: string | null;
  /** Floating "every N days after completion"; kept as typed text. */
  interval: string;
  unit: FloatingUnit;
}

export const EMPTY_RECURRENCE: RecurrenceFormState = {
  mode: 'none',
  preset: 'weekly',
  customRule: null,
  interval: '3',
  unit: 'day',
};

export function fromTaskRecurrence(r: TaskRecurrence | null | undefined): RecurrenceFormState {
  if (!r) return EMPTY_RECURRENCE;
  if (r.mode === 'floating') {
    return { ...EMPTY_RECURRENCE, mode: 'floating', interval: String(r.interval), unit: r.unit };
  }
  const preset = rruleToPreset(r.rrule);
  if (preset === 'none' || preset === 'custom') {
    return { ...EMPTY_RECURRENCE, mode: 'fixed', preset: 'custom', customRule: r.rrule };
  }
  return { ...EMPTY_RECURRENCE, mode: 'fixed', preset };
}

export type RecurrenceResult =
  { ok: true; value: TaskRecurrence | null } | { ok: false; error: 'interval' };

/** Converts the form state into the API's `TaskRecurrence`. */
export function toTaskRecurrence(s: RecurrenceFormState): RecurrenceResult {
  if (s.mode === 'none') return { ok: true, value: null };
  if (s.mode === 'floating') {
    const interval = Number(s.interval.trim());
    if (
      !/^\d+$/.test(s.interval.trim()) ||
      !Number.isInteger(interval) ||
      interval < 1 ||
      interval > 1000
    ) {
      return { ok: false, error: 'interval' };
    }
    return { ok: true, value: { mode: 'floating', interval, unit: s.unit } };
  }
  if (s.preset === 'custom') {
    return s.customRule
      ? { ok: true, value: { mode: 'fixed', rrule: s.customRule } }
      : { ok: true, value: null };
  }
  const rrule = presetToRRule(s.preset);
  return { ok: true, value: rrule ? { mode: 'fixed', rrule } : null };
}
