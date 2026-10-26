import { nextOccurrence, parseRecurrenceRule, RecurrenceError } from '../recurrence/series.js';
import { addFloating, floatingToLocalDate, localDateToFloating } from '../time/time.js';
import { daysBetween } from './vault.js';

/**
 * Maintenance schedules for homes and vehicles:
 * - `interval`: next due N months after the last completion (HU/TÜV: 24 months after the inspection).
 * - `rrule`: fixed calendar dates (tyre change every April and October), on all-day dates.
 */
export type MaintenanceRecurrence =
  { mode: 'interval'; months: number } | { mode: 'rrule'; rrule: string };

export function validateMaintenanceRecurrence(r: MaintenanceRecurrence): void {
  if (r.mode === 'rrule') {
    parseRecurrenceRule(r.rrule);
    return;
  }
  if (!Number.isInteger(r.months) || r.months < 1 || r.months > 240)
    throw new RecurrenceError('months must be an integer between 1 and 240');
}

function nextRuleDate(
  rrule: string,
  anchor: string,
  after: string,
  inclusive: boolean,
): string | null {
  const start = localDateToFloating(anchor);
  const next = nextOccurrence(
    { start, end: start, timeZone: 'UTC', allDay: true, rrule },
    localDateToFloating(after),
    inclusive,
  );
  return next ? floatingToLocalDate(next) : null;
}

/** First due date for a new plan created on `today`. */
export function initialMaintenanceDue(r: MaintenanceRecurrence, today: string): string | null {
  validateMaintenanceRecurrence(r);
  if (r.mode === 'interval')
    return floatingToLocalDate(addFloating(localDateToFloating(today), r.months, 'month'));
  return nextRuleDate(r.rrule, today, today, true);
}

/**
 * Next due date after completing on `doneOn` the occurrence that was due on `currentDue`.
 * Rule-based plans skip occurrences that were missed; interval plans count from completion.
 */
export function nextMaintenanceDue(
  r: MaintenanceRecurrence,
  input: { anchor: string; currentDue: string; doneOn: string },
): string | null {
  validateMaintenanceRecurrence(r);
  if (r.mode === 'interval')
    return floatingToLocalDate(addFloating(localDateToFloating(input.doneOn), r.months, 'month'));
  const after = input.doneOn > input.currentDue ? input.doneOn : input.currentDue;
  return nextRuleDate(r.rrule, input.anchor, after, false);
}

/** `lead` while within the lead time before the due date, `due` on/after it, else null. */
export function maintenanceReminderStage(
  nextDue: string,
  today: string,
  leadDays: number,
): 'lead' | 'due' | null {
  const left = daysBetween(today, nextDue);
  if (left <= 0) return 'due';
  return left <= leadDays ? 'lead' : null;
}

export type AssetKind = 'home' | 'vehicle' | 'appliance' | 'other';

export interface MaintenanceTemplate {
  key: string;
  title: string;
  assetKinds: readonly AssetKind[];
  recurrence: MaintenanceRecurrence;
  leadDays: number;
}

/** Built-in German templates. */
export const MAINTENANCE_TEMPLATES: readonly MaintenanceTemplate[] = [
  {
    key: 'hu',
    title: 'Hauptuntersuchung (HU/TÜV)',
    assetKinds: ['vehicle'],
    recurrence: { mode: 'interval', months: 24 },
    leadDays: 30,
  },
  {
    key: 'tyre_change',
    title: 'Reifenwechsel',
    assetKinds: ['vehicle'],
    // "Von O bis O": winter tyres from October to Easter.
    recurrence: { mode: 'rrule', rrule: 'FREQ=YEARLY;BYMONTH=4,10;BYMONTHDAY=1' },
    leadDays: 14,
  },
  {
    key: 'smoke_detector',
    title: 'Rauchmelder testen',
    assetKinds: ['home'],
    recurrence: { mode: 'interval', months: 12 },
    leadDays: 14,
  },
  {
    key: 'boiler_service',
    title: 'Heizungswartung',
    assetKinds: ['home', 'appliance'],
    recurrence: { mode: 'interval', months: 12 },
    leadDays: 30,
  },
];

export function maintenanceTemplate(key: string): MaintenanceTemplate | undefined {
  return MAINTENANCE_TEMPLATES.find((t) => t.key === key);
}
