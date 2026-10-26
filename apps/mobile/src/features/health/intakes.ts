import { dayKey } from '@/features/calendar/dates';

export interface Intake {
  at: string;
  time: string;
  medicationId: string;
  name: string;
  dose: string | null;
}

/** Intakes of several medications merged, sorted and grouped by local day (`YYYY-MM-DD`). */
export function groupIntakesByDay(
  intakes: readonly Intake[],
): { day: string; intakes: Intake[] }[] {
  const days = new Map<string, Intake[]>();
  for (const i of [...intakes].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = dayKey(new Date(i.at));
    const list = days.get(key) ?? [];
    list.push(i);
    days.set(key, list);
  }
  return [...days.entries()].map(([day, list]) => ({ day, intakes: list }));
}
