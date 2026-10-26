import { parseLocalDate } from '../time/time.js';

export interface GoalProgressInput {
  targetMinor: number;
  savedMinor: number;
  /** YYYY-MM-DD or null for open-ended goals. */
  deadline: string | null;
  /** YYYY-MM-DD */
  today: string;
}

export interface GoalProgress {
  savedMinor: number;
  remainingMinor: number;
  /** saved / target, capped at 1. */
  ratio: number;
  reached: boolean;
  /** Months left to save, counting the current month; null without deadline, 0 when overdue. */
  monthsLeft: number | null;
  /** Amount to put aside per month to reach the target by the deadline (null without deadline). */
  requiredMonthlyMinor: number | null;
}

/**
 * Number of monthly saving opportunities between `today` and `deadline`: the current month
 * counts, the deadline month counts only when the deadline is not before today's day of month.
 */
export function monthsUntil(today: string, deadline: string): number {
  if (deadline < today) return 0;
  const a = parseLocalDate(today);
  const b = parseLocalDate(deadline);
  const months = (b.year - a.year) * 12 + (b.month - a.month);
  return Math.max(1, b.day >= a.day ? months + 1 : months);
}

/** Monthly saving needed to close the gap by the deadline (whole minor units, rounded up). */
export function requiredMonthlySaving(
  remainingMinor: number,
  today: string,
  deadline: string,
): number {
  if (remainingMinor <= 0) return 0;
  const months = monthsUntil(today, deadline);
  return months === 0 ? remainingMinor : Math.ceil(remainingMinor / months);
}

export function goalProgress(g: GoalProgressInput): GoalProgress {
  const remainingMinor = Math.max(0, g.targetMinor - g.savedMinor);
  const ratio = g.targetMinor > 0 ? Math.min(1, Math.max(0, g.savedMinor / g.targetMinor)) : 1;
  return {
    savedMinor: g.savedMinor,
    remainingMinor,
    ratio: Math.round(ratio * 10_000) / 10_000,
    reached: g.savedMinor >= g.targetMinor,
    monthsLeft: g.deadline ? monthsUntil(g.today, g.deadline) : null,
    requiredMonthlyMinor: g.deadline
      ? requiredMonthlySaving(remainingMinor, g.today, g.deadline)
      : null,
  };
}
