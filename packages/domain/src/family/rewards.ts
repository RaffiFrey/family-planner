import {
  addFloating,
  floatingToLocalDate,
  formatLocalDate,
  fromWallTime,
  localDateToFloating,
  parseLocalDate,
  toLocalDate,
} from '../time/time.js';

// ---------------------------------------------------------------- points

export interface PointsEntry {
  memberId: string;
  delta: number;
  at?: Date;
}

/** Points balance per member (sum of the ledger). */
export function pointsBalances(entries: readonly PointsEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.memberId, (out.get(e.memberId) ?? 0) + e.delta);
  return out;
}

export interface PointsAccount {
  memberId: string;
  points: number;
  /** Points held by open redemption requests. */
  reserved: number;
  available: number;
}

/** Settles balances against pending redemption requests (reserved points can't be spent twice). */
export function settlePoints(
  memberIds: readonly string[],
  entries: readonly PointsEntry[],
  pending: readonly { memberId: string; cost: number }[],
): PointsAccount[] {
  const balances = pointsBalances(entries);
  const reserved = new Map<string, number>();
  for (const p of pending) reserved.set(p.memberId, (reserved.get(p.memberId) ?? 0) + p.cost);
  return memberIds.map((memberId) => {
    const points = balances.get(memberId) ?? 0;
    const r = reserved.get(memberId) ?? 0;
    return { memberId, points, reserved: r, available: points - r };
  });
}

export function canRedeem(account: Pick<PointsAccount, 'available'>, cost: number): boolean {
  return cost >= 0 && account.available >= cost;
}

export interface LeaderboardRow {
  memberId: string;
  points: number;
  rank: number;
}

/**
 * Earned points (positive entries only, spending doesn't lower the score) within [from, to),
 * ranked with shared ranks for ties (1, 1, 3).
 */
export function leaderboard(
  entries: readonly PointsEntry[],
  from: Date,
  to: Date,
  memberIds: readonly string[] = [],
): LeaderboardRow[] {
  const sums = new Map<string, number>(memberIds.map((m) => [m, 0]));
  for (const e of entries) {
    if (e.delta <= 0 || !e.at || e.at < from || e.at >= to) continue;
    sums.set(e.memberId, (sums.get(e.memberId) ?? 0) + e.delta);
  }
  const sorted = [...sums]
    .map(([memberId, points]) => ({ memberId, points }))
    .sort((a, b) => b.points - a.points || a.memberId.localeCompare(b.memberId));
  let rank = 0;
  let last: number | null = null;
  return sorted.map((row, i) => {
    if (row.points !== last) {
      rank = i + 1;
      last = row.points;
    }
    return { ...row, rank };
  });
}

/** ISO weekday 1 (Monday) … 7 (Sunday) of a local date. */
export function isoWeekday(date: string): number {
  const d = localDateToFloating(date).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Current week (Monday start) or month as an instant range in the household's time zone. */
export function periodRange(
  period: 'week' | 'month',
  now: Date,
  timeZone: string,
): { start: Date; end: Date; startDate: string; endDate: string } {
  const today = toLocalDate(now, timeZone);
  let startF: Date;
  let endF: Date;
  if (period === 'week') {
    startF = addFloating(localDateToFloating(today), 1 - isoWeekday(today), 'day');
    endF = addFloating(startF, 7, 'day');
  } else {
    const { year, month } = parseLocalDate(today);
    startF = localDateToFloating(formatLocalDate(year, month, 1));
    endF = addFloating(startF, 1, 'month');
  }
  const toInstant = (f: Date) =>
    fromWallTime(
      {
        year: f.getUTCFullYear(),
        month: f.getUTCMonth() + 1,
        day: f.getUTCDate(),
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  return {
    start: toInstant(startF),
    end: toInstant(endF),
    startDate: floatingToLocalDate(startF),
    endDate: floatingToLocalDate(addFloating(endF, -1, 'day')),
  };
}

// ---------------------------------------------------------------- pocket money

export interface AllowanceSchedule {
  interval: 'weekly' | 'monthly';
  /** ISO weekday 1–7 for weekly rules. */
  weekday?: number | null;
  /** Day of month 1–31 for monthly rules (clamped to the month's last day). */
  dayOfMonth?: number | null;
  /** First local date from which payouts may happen. */
  startsOn: string;
}

/** ISO-8601 week key, e.g. "2026-W43". */
export function isoWeekKey(date: string): string {
  const f = localDateToFloating(date);
  const thursday = addFloating(f, 4 - isoWeekday(date), 'day');
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return `${String(year)}-W${String(week).padStart(2, '0')}`;
}

/** Payday and once-key of the period (ISO week or month) containing `date`. */
export function allowancePeriod(
  rule: AllowanceSchedule,
  date: string,
): { periodKey: string; payday: string } {
  if (rule.interval === 'weekly') {
    const weekday = Math.min(7, Math.max(1, rule.weekday ?? 1));
    const monday = addFloating(localDateToFloating(date), 1 - isoWeekday(date), 'day');
    return {
      periodKey: isoWeekKey(date),
      payday: floatingToLocalDate(addFloating(monday, weekday - 1, 'day')),
    };
  }
  const { year, month } = parseLocalDate(date);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(last, Math.max(1, rule.dayOfMonth ?? 1));
  return {
    periodKey: `${String(year)}-${String(month).padStart(2, '0')}`,
    payday: formatLocalDate(year, month, day),
  };
}

/** The payout due on `today` (payday reached in the current period and not before `startsOn`). */
export function dueAllowance(
  rule: AllowanceSchedule,
  today: string,
): { periodKey: string; payday: string } | null {
  const p = allowancePeriod(rule, today);
  if (p.payday > today || p.payday < rule.startsOn) return null;
  return p;
}

/** Next payday on or after `today`. */
export function nextPayday(rule: AllowanceSchedule, today: string): string {
  const from = today < rule.startsOn ? rule.startsOn : today;
  const current = allowancePeriod(rule, from);
  if (current.payday >= from) return current.payday;
  const next = addFloating(
    localDateToFloating(from),
    1,
    rule.interval === 'weekly' ? 'week' : 'month',
  );
  return allowancePeriod(rule, floatingToLocalDate(next)).payday;
}

export function allowanceBalances(
  entries: readonly { memberId: string; amountMinor: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.memberId, (out.get(e.memberId) ?? 0) + e.amountMinor);
  return out;
}

/** Signed ledger amount: payouts/bonuses add, expenses subtract, corrections keep their sign. */
export function signedAllowanceAmount(
  kind: 'payout' | 'bonus' | 'expense' | 'correction',
  amountMinor: number,
): number {
  if (kind === 'correction') return amountMinor;
  const abs = Math.abs(amountMinor);
  return kind === 'expense' ? -abs : abs;
}
