'use client';

import type { CreateTaskBody, Task, UpdateTaskBody } from '@fp/contracts';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';

type Snapshot = [QueryKey, Task[] | undefined][];
const LIST_KEY = ['tasks', 'list'] as const;

export function useTaskMutations() {
  const { householdId, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const t = useTranslations('tasks');
  const fmt = useFormat();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  /** Patches every cached task list; returns a snapshot for rollback. */
  const optimistic = async (taskId: string, patch: (task: Task) => Task): Promise<Snapshot> => {
    await queryClient.cancelQueries({ queryKey: ['tasks'] });
    const snapshot = queryClient.getQueriesData<Task[]>({ queryKey: LIST_KEY });
    queryClient.setQueriesData<Task[]>({ queryKey: LIST_KEY }, (old) =>
      old?.map((task) => (task.id === taskId ? patch(task) : task)),
    );
    return snapshot;
  };

  const rollback = (snapshot: Snapshot | undefined) => {
    for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
  };

  const complete = useMutation({
    mutationFn: ({ task, skip }: { task: Task; skip: boolean }) =>
      api.tasks.complete({ params: { householdId, taskId: task.id }, body: { skip } }),
    onMutate: ({ task, skip }) =>
      optimistic(task.id, (x) => ({
        ...x,
        status: skip ? 'skipped' : 'done',
        completedAt: new Date().toISOString(),
      })),
    onError: (err, _vars, snapshot) => {
      rollback(snapshot);
      toastError(err);
    },
    onSuccess: ({ next }, { task, skip }) => {
      let description: string | undefined;
      if (next?.dueAt) {
        const date = fmt.date(next.dueAt, { weekday: 'short', day: 'numeric', month: 'short' });
        const assignee = memberById(next.assigneeMemberId);
        description = assignee
          ? t('nextInstanceFor', { date, name: assignee.displayName })
          : t('nextInstance', { date });
      }
      toast.success(
        skip ? t('skipped', { title: task.title }) : t('completed', { title: task.title }),
        {
          description,
          action: {
            label: t('reopen'),
            onClick: () => reopen.mutate(task),
          },
        },
      );
    },
    onSettled: invalidate,
  });

  const reopen = useMutation({
    mutationFn: (task: Task) => api.tasks.reopen({ params: { householdId, taskId: task.id } }),
    onMutate: (task) => optimistic(task.id, (x) => ({ ...x, status: 'open', completedAt: null })),
    onError: (err, _vars, snapshot) => {
      rollback(snapshot);
      toastError(err);
    },
    onSuccess: () => toast.success(t('reopened')),
    onSettled: invalidate,
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ task, itemId, done }: { task: Task; itemId: string; done: boolean }) =>
      api.tasks.toggleChecklistItem({
        params: { householdId, taskId: task.id, itemId },
        body: { done },
      }),
    onMutate: ({ task, itemId, done }) =>
      optimistic(task.id, (x) => ({
        ...x,
        checklist: x.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)),
      })),
    onError: (err, _vars, snapshot) => {
      rollback(snapshot);
      toastError(err);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (task: Task) => api.tasks.remove({ params: { householdId, taskId: task.id } }),
    onSuccess: () => toast.success(t('deleted')),
    onError: toastError,
    onSettled: invalidate,
  });

  const create = useMutation({
    mutationFn: (body: z.input<typeof CreateTaskBody>) =>
      api.tasks.create({ params: { householdId }, body }),
    onSuccess: () => toast.success(t('saved')),
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: z.input<typeof UpdateTaskBody> }) =>
      api.tasks.update({ params: { householdId, taskId }, body }),
    onSuccess: () => toast.success(t('saved')),
    onSettled: invalidate,
  });

  return { complete, reopen, toggleChecklist, remove, create, update };
}
