import type { Task } from '@fp/contracts';
import { fromWallTime, parseLocalDate, toLocalDate, toWallTime } from '@fp/domain/time';

export type TaskGroup = 'overdue' | 'today' | 'upcoming' | 'noDate';
export const TASK_GROUPS: readonly TaskGroup[] = ['overdue', 'today', 'upcoming', 'noDate'];

/** Without an explicit time a task is due at the end of its day. */
const END_OF_DAY = { hour: 23, minute: 59 } as const;

export function groupOf(task: Task, now: Date, timeZone: string): TaskGroup {
  if (!task.dueAt) return 'noDate';
  const due = new Date(task.dueAt);
  if (due < now) return 'overdue';
  return toLocalDate(due, timeZone) === toLocalDate(now, timeZone) ? 'today' : 'upcoming';
}

export function groupTasks(
  tasks: readonly Task[],
  now: Date,
  timeZone: string,
): Record<TaskGroup, Task[]> {
  const groups: Record<TaskGroup, Task[]> = { overdue: [], today: [], upcoming: [], noDate: [] };
  for (const task of tasks) groups[groupOf(task, now, timeZone)].push(task);
  const byDue = (a: Task, b: Task) =>
    (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.title.localeCompare(b.title);
  for (const g of TASK_GROUPS) groups[g].sort(byDue);
  return groups;
}

/** `YYYY-MM-DD` + optional `HH:mm` in the household zone to an ISO instant. */
export function toDueAt(date: string, time: string, timeZone: string): string | null {
  if (!date) return null;
  const { year, month, day } = parseLocalDate(date);
  const [h, m] = time ? time.split(':').map(Number) : [END_OF_DAY.hour, END_OF_DAY.minute];
  return fromWallTime(
    { year, month, day, hour: h ?? 0, minute: m ?? 0, second: 0 },
    timeZone,
  ).toISOString();
}

export function fromDueAt(dueAt: string | null, timeZone: string): { date: string; time: string } {
  if (!dueAt) return { date: '', time: '' };
  const w = toWallTime(new Date(dueAt), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${String(w.year).padStart(4, '0')}-${pad(w.month)}-${pad(w.day)}`;
  const endOfDay = w.hour === END_OF_DAY.hour && w.minute === END_OF_DAY.minute;
  return { date, time: endOfDay ? '' : `${pad(w.hour)}:${pad(w.minute)}` };
}

/** True when the due instant carries an explicit time (not the end-of-day default). */
export function hasDueTime(dueAt: string, timeZone: string): boolean {
  return fromDueAt(dueAt, timeZone).time !== '';
}
