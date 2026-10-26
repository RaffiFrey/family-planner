'use client';

import { ApiError, apiQuery } from '@fp/api-client';
import type { Task } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, QueryView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { TaskFormDialog } from './task-form-dialog';
import { TaskRow } from './task-row';
import { groupTasks, TASK_GROUPS } from './task-utils';

type Scope = 'mine' | 'all';
type Status = 'open' | 'done';

function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-sm px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === o.value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TasksPage() {
  const t = useTranslations('tasks');
  const tn = useTranslations('nav');
  const { householdId, member, can } = useHousehold();
  const fmt = useFormat();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('task');

  const [scope, setScope] = React.useState<Scope>('all');
  const [status, setStatus] = React.useState<Status>('open');
  const [editing, setEditing] = React.useState<{ task: Task | null } | null>(null);

  const query = useQuery(
    apiQuery(api, 'tasks', 'list', {
      params: { householdId },
      query: { status, ...(scope === 'mine' ? { assigneeMemberId: member.id } : {}) },
    }),
  );

  const deepLinkInList = deepLinkId ? query.data?.find((x) => x.id === deepLinkId) : undefined;
  const deepLinkQuery = useQuery({
    ...apiQuery(api, 'tasks', 'get', { params: { householdId, taskId: deepLinkId ?? '' } }),
    enabled: Boolean(deepLinkId) && query.isSuccess && !deepLinkInList,
  });
  const deepLinkTask = deepLinkInList ?? deepLinkQuery.data;

  const deepLinkMissing =
    deepLinkQuery.error instanceof ApiError && deepLinkQuery.error.status === 404;
  React.useEffect(() => {
    if (!deepLinkMissing) return;
    toast.error(t('notFound'));
    router.replace(pathname);
  }, [deepLinkMissing, t, router, pathname]);

  const dialogTask = editing ? editing.task : (deepLinkTask ?? null);
  const dialogOpen = editing !== null || Boolean(deepLinkTask);

  const closeDialog = (open: boolean) => {
    if (open) return;
    setEditing(null);
    if (deepLinkId) router.replace(pathname);
  };

  const canWrite = can('tasks.write');

  return (
    <>
      <PageHeader
        title={tn('tasks')}
        description={t('pageDescription')}
        actions={
          canWrite ? (
            <Button onClick={() => setEditing({ task: null })}>
              <Plus aria-hidden />
              {t('newTask')}
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Scope>
          label={t('filter.label')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: t('filter.all') },
            { value: 'mine', label: t('filter.mine') },
          ]}
        />
        <Segmented<Status>
          label={t('filter.label')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: t('filter.open') },
            { value: 'done', label: t('filter.done') },
          ]}
        />
      </div>

      <QueryView query={query} rows={5}>
        {(tasks) => {
          if (tasks.length === 0) {
            return (
              <EmptyState
                icon={<CheckSquare />}
                title={status === 'open' ? t('emptyOpen') : t('emptyDone')}
                description={status === 'open' ? t('emptyOpenHint') : undefined}
                action={
                  status === 'open' && canWrite ? (
                    <Button variant="secondary" onClick={() => setEditing({ task: null })}>
                      <Plus aria-hidden />
                      {t('newTask')}
                    </Button>
                  ) : null
                }
              />
            );
          }
          if (status === 'done') {
            const sorted = [...tasks].sort((a, b) =>
              (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
            );
            return (
              <section aria-labelledby="tasks-done">
                <h2 id="tasks-done" className="mb-2 text-sm font-semibold text-muted">
                  {t('groups.done')}
                </h2>
                <ul className="grid gap-2">
                  {sorted.map((task) => (
                    <TaskRow key={task.id} task={task} onEdit={(x) => setEditing({ task: x })} />
                  ))}
                </ul>
              </section>
            );
          }
          const groups = groupTasks(tasks, now, fmt.timeZone);
          return (
            <div className="grid gap-6">
              {TASK_GROUPS.filter((g) => groups[g].length > 0).map((g) => (
                <section key={g} aria-labelledby={`tasks-${g}`}>
                  <h2
                    id={`tasks-${g}`}
                    className={cn(
                      'mb-2 text-sm font-semibold',
                      g === 'overdue' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {t(`groups.${g}`)} <span className="font-normal">({groups[g].length})</span>
                  </h2>
                  <ul className="grid gap-2">
                    {groups[g].map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        overdue={g === 'overdue'}
                        onEdit={(x) => setEditing({ task: x })}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryView>

      <TaskFormDialog open={dialogOpen} onOpenChange={closeDialog} task={dialogTask} />
    </>
  );
}
