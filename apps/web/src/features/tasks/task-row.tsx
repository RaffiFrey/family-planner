'use client';

import type { Task } from '@fp/contracts';
import {
  Ellipsis,
  Flame,
  ListChecks,
  Pencil,
  Repeat,
  RotateCcw,
  SkipForward,
  Star,
  Trash,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHousehold } from '@/features/household/household-context';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { hasDueTime } from './task-utils';
import { useTaskMutations } from './use-task-mutations';

export function TaskRow({
  task,
  overdue = false,
  onEdit,
}: {
  task: Task;
  overdue?: boolean;
  onEdit: (task: Task) => void;
}) {
  const t = useTranslations('tasks');
  const tp = useTranslations('priority');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { memberById, can } = useHousehold();
  const { complete, reopen, toggleChecklist, remove } = useTaskMutations();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showChecklist, setShowChecklist] = React.useState(false);

  const assignee = memberById(task.assigneeMemberId);
  const isOpen = task.status === 'open';
  const canComplete = can('tasks.complete');
  const canWrite = can('tasks.write');
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const checklistId = `task-${task.id}-checklist`;

  const dueLabel = task.dueAt
    ? hasDueTime(task.dueAt, fmt.timeZone)
      ? fmt.date(task.dueAt, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : fmt.date(task.dueAt, { weekday: 'short', day: 'numeric', month: 'short' })
    : null;

  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          className="mt-0.5"
          checked={!isOpen}
          disabled={!canComplete || complete.isPending || reopen.isPending}
          aria-label={t('complete', { title: task.title })}
          onCheckedChange={(checked) => {
            if (checked === true && isOpen) complete.mutate({ task, skip: false });
            else if (checked === false && !isOpen) reopen.mutate(task);
          }}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => canWrite && onEdit(task)}
            className={cn(
              'block max-w-full truncate text-left font-medium outline-none focus-visible:underline',
              !isOpen && 'text-muted line-through',
              canWrite && 'hover:underline',
            )}
          >
            {task.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {dueLabel ? (
              <span className={cn(overdue && isOpen && 'font-medium text-danger')}>
                {isOpen || !task.completedAt
                  ? t('dueAt', { date: dueLabel })
                  : t('completedAt', {
                      date: fmt.date(task.completedAt, { day: 'numeric', month: 'short' }),
                    })}
              </span>
            ) : null}
            {task.priority !== 'normal' ? (
              <Badge variant={task.priority === 'high' ? 'danger' : 'secondary'}>
                {tp(task.priority)}
              </Badge>
            ) : null}
            {task.recurrence ? (
              <Badge variant="secondary">
                <Repeat aria-hidden />
                {t('recurring')}
              </Badge>
            ) : null}
            {task.streak > 0 ? (
              <Badge variant="warning">
                <Flame aria-hidden />
                {t('streak', { count: task.streak })}
              </Badge>
            ) : null}
            {task.points > 0 ? (
              <Badge variant="outline">
                <Star aria-hidden />
                {t('pointsBadge', { count: task.points })}
              </Badge>
            ) : null}
            {task.checklist.length > 0 ? (
              <button
                type="button"
                aria-expanded={showChecklist}
                aria-controls={checklistId}
                onClick={() => setShowChecklist((s) => !s)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ListChecks className="size-3" aria-hidden />
                <span className="sr-only">{t('checklist')}</span>
                {t('checklistProgress', { done: checklistDone, total: task.checklist.length })}
              </button>
            ) : null}
          </div>
        </div>
        {assignee ? <MemberAvatar member={assignee} size="sm" /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('moreActions', { title: task.title })}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canWrite ? (
              <DropdownMenuItem onSelect={() => onEdit(task)}>
                <Pencil aria-hidden />
                {tc('edit')}
              </DropdownMenuItem>
            ) : null}
            {isOpen && canComplete && task.recurrence ? (
              <DropdownMenuItem onSelect={() => complete.mutate({ task, skip: true })}>
                <SkipForward aria-hidden />
                {t('skip')}
              </DropdownMenuItem>
            ) : null}
            {!isOpen && canComplete ? (
              <DropdownMenuItem onSelect={() => reopen.mutate(task)}>
                <RotateCcw aria-hidden />
                {t('reopen')}
              </DropdownMenuItem>
            ) : null}
            {canWrite ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash aria-hidden />
                  {t('delete')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showChecklist && task.checklist.length > 0 ? (
        <ul id={checklistId} className="grid gap-1 border-t border-border px-3 py-2 pl-11">
          {task.checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${checklistId}-${item.id}`}
                checked={item.done}
                disabled={!canComplete}
                onCheckedChange={(checked) =>
                  toggleChecklist.mutate({ task, itemId: item.id, done: checked === true })
                }
              />
              <label
                htmlFor={`${checklistId}-${item.id}`}
                className={cn(item.done && 'text-muted line-through')}
              >
                {item.text}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('delete')}
        description={t('deleteConfirm', { title: task.title })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(task, { onSuccess: () => setConfirmDelete(false) })}
      />
    </li>
  );
}
