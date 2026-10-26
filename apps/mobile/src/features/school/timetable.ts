import type { Member, TimetableEntry } from '@fp/contracts';

export type WeekFilter = 'all' | 'A' | 'B';

/** Lessons grouped by ISO weekday (1 = Monday), ordered by period; weekends only when used. */
export function groupByWeekday(
  entries: readonly TimetableEntry[],
  week: WeekFilter = 'all',
): { weekday: number; entries: TimetableEntry[] }[] {
  const visible = entries.filter((e) => week === 'all' || e.week === null || e.week === week);
  const days = new Map<number, TimetableEntry[]>();
  for (let d = 1; d <= 5; d++) days.set(d, []);
  for (const e of visible) {
    const list = days.get(e.weekday) ?? [];
    list.push(e);
    days.set(e.weekday, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, list]) => ({
      weekday,
      entries: [...list].sort(
        (a, b) => a.period - b.period || a.startTime.localeCompare(b.startTime),
      ),
    }));
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/** The member a school screen opens with: the first child or teen, else the current member. */
export function defaultSchoolMemberId(members: readonly Member[], meId: string): string {
  return members.find((m) => m.role === 'child' || m.role === 'teen')?.id ?? meId;
}

/** Holidays overlapping today or later, as `{ ...holiday, current }`. */
export function upcomingHolidays<H extends { start: string; end: string }>(
  holidays: readonly H[],
  todayKey: string,
): (H & { current: boolean })[] {
  return holidays
    .filter((h) => h.end >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((h) => ({ ...h, current: h.start <= todayKey }));
}
