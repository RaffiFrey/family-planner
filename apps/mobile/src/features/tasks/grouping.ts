import type { Task } from '@fp/contracts';
import { addDays, startOfDay } from 'date-fns';

export const TASK_GROUPS = ['overdue', 'today', 'upcoming', 'someday'] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

type Groupable = Pick<Task, 'id' | 'dueAt' | 'priority' | 'title'>;

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function taskGroup(task: Pick<Task, 'dueAt'>, now: Date): TaskGroup {
  if (!task.dueAt) return 'someday';
  const due = new Date(task.dueAt);
  const today = startOfDay(now);
  if (due < today) return 'overdue';
  if (due < addDays(today, 1)) return 'today';
  return 'upcoming';
}

/** Open tasks grouped for the task tab: overdue, today, upcoming, without date. Empty groups are dropped. */
export function groupTasks<T extends Groupable>(
  tasks: readonly T[],
  now: Date,
): { group: TaskGroup; tasks: T[] }[] {
  const buckets = new Map<TaskGroup, T[]>(TASK_GROUPS.map((g) => [g, []]));
  for (const t of tasks) buckets.get(taskGroup(t, now))?.push(t);
  return TASK_GROUPS.map((group) => ({
    group,
    tasks: (buckets.get(group) ?? []).sort((a, b) => {
      const byDue = (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
      if (byDue !== 0) return byDue;
      const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return byPriority !== 0 ? byPriority : a.title.localeCompare(b.title);
    }),
  })).filter((g) => g.tasks.length > 0);
}
