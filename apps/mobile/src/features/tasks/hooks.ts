import { apiQuery } from '@fp/api-client';
import type { Task } from '@fp/contracts';
import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';

export type TaskStatusFilter = 'open' | 'done' | 'all';

export function tasksQuery(
  householdId: string,
  status: TaskStatusFilter = 'open',
  dueBefore?: string,
) {
  return apiQuery(api, 'tasks', 'list', {
    params: { householdId },
    query: dueBefore ? { status, dueBefore } : { status },
  });
}

export function useTasks(status: TaskStatusFilter = 'open', dueBefore?: string) {
  const { householdId } = useHousehold();
  return useQuery(tasksQuery(householdId, status, dueBefore));
}

export function useTask(taskId: string | undefined) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'tasks', 'get', { params: { householdId, taskId: taskId ?? '' } }),
    enabled: !!taskId,
  });
}

type Snapshot = [QueryKey, Task[] | undefined][];

/**
 * Complete or skip with an optimistic update: the task disappears from open lists right away
 * (and animates out); on failure every list is restored.
 */
export function useCompleteTask() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, skip }: { task: Task; skip: boolean }) =>
      api.tasks.complete({ params: { householdId, taskId: task.id }, body: { skip } }),
    onMutate: async ({ task, skip }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'list'] });
      const snapshot: Snapshot = queryClient.getQueriesData<Task[]>({
        queryKey: ['tasks', 'list'],
      });
      for (const [key, data] of snapshot) {
        if (!data) continue;
        const status =
          (key[2] as { query?: { status?: string } } | undefined)?.query?.status ?? 'open';
        const updated: Task = {
          ...task,
          status: skip ? 'skipped' : 'done',
          completedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Task[]>(
          key,
          status === 'open'
            ? data.filter((t) => t.id !== task.id)
            : data.map((t) => (t.id === task.id ? updated : t)),
        );
      }
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useReopenTask() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.reopen({ params: { householdId, taskId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
