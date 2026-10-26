import { addMonths, addWeeks, getISOWeek } from 'date-fns';
import { dayKey } from '@/features/calendar/dates';
import type { LeaderboardPeriod } from './hooks';

/** Moves the anchor day by whole weeks or months (the API accepts any day inside the period). */
export function shiftPeriod(anchor: Date, period: LeaderboardPeriod, delta: number): Date {
  return period === 'week' ? addWeeks(anchor, delta) : addMonths(anchor, delta);
}

/** `at` query value for the leaderboard (local calendar day). */
export function periodAt(anchor: Date): string {
  return dayKey(anchor);
}

/** True when the anchor lies in the same week/month as `now` (no "next" beyond the current one). */
export function isCurrentPeriod(anchor: Date, period: LeaderboardPeriod, now: Date): boolean {
  if (period === 'month')
    return anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
  return dayKey(shiftToMonday(anchor)) === dayKey(shiftToMonday(now));
}

function shiftToMonday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/** "KW 43 · 19.10.–25.10." for weeks, "Oktober 2026" for months. */
export function periodLabel(
  period: LeaderboardPeriod,
  from: Date,
  to: Date,
  intlLocale: string,
  weekPrefix: string,
): string {
  if (period === 'month')
    return new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(from);
  const fmt = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'numeric' });
  return `${weekPrefix} ${String(getISOWeek(from))} · ${fmt.format(from)}–${fmt.format(to)}`;
}
