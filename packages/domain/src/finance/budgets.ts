import { monthRangeInZone, toWallTime, yearRangeInZone } from '../time/time.js';

export type BudgetPeriod = 'monthly' | 'yearly';
export type BudgetLevel = 'ok' | 'warning' | 'exceeded';

export const BUDGET_WARNING_RATIO = 0.8;

export interface BudgetStatus {
  limitMinor: number;
  spentMinor: number;
  /** Carried over from the previous period (positive = unspent money added). */
  rolloverMinor: number;
  availableMinor: number;
  remainingMinor: number;
  /** spent / available, 0 when nothing is available. */
  ratio: number;
  level: BudgetLevel;
}

/**
 * `spentMinor` is the positive amount spent in the period (refunds reduce it).
 */
export function budgetStatus(
  limitMinor: number,
  spentMinor: number,
  rolloverMinor = 0,
): BudgetStatus {
  const availableMinor = limitMinor + rolloverMinor;
  const remainingMinor = availableMinor - spentMinor;
  const ratio = availableMinor > 0 ? spentMinor / availableMinor : spentMinor > 0 ? Infinity : 0;
  const level: BudgetLevel =
    ratio >= 1 && spentMinor > 0 ? 'exceeded' : ratio >= BUDGET_WARNING_RATIO ? 'warning' : 'ok';
  return { limitMinor, spentMinor, rolloverMinor, availableMinor, remainingMinor, ratio, level };
}

/** Thresholds newly crossed by a change in spending, used to fire alerts exactly once. */
export function crossedThresholds(
  availableMinor: number,
  previousSpentMinor: number,
  newSpentMinor: number,
): ('warning' | 'exceeded')[] {
  if (availableMinor <= 0) return [];
  const crossed: ('warning' | 'exceeded')[] = [];
  const warnAt = availableMinor * BUDGET_WARNING_RATIO;
  if (previousSpentMinor < warnAt && newSpentMinor >= warnAt) crossed.push('warning');
  if (previousSpentMinor < availableMinor && newSpentMinor >= availableMinor)
    crossed.push('exceeded');
  return crossed;
}

/** Unspent (or overspent, negative) amount carried into the next period. */
export function rolloverAmount(status: BudgetStatus, allowNegative = false): number {
  return allowNegative ? status.remainingMinor : Math.max(0, status.remainingMinor);
}

export function budgetPeriodRange(
  period: BudgetPeriod,
  at: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const w = toWallTime(at, timeZone);
  return period === 'monthly'
    ? monthRangeInZone(w.year, w.month, timeZone)
    : yearRangeInZone(w.year, timeZone);
}
