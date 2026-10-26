'use client';

import type { Task } from '@fp/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { MemberPicker } from '@/components/member-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { RecurrencePicker } from '@/features/recurrence/recurrence-picker';
import { buildRRule, DEFAULT_RECURRENCE } from '@/features/recurrence/rrule';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { fromDueAt, toDueAt } from './task-utils';
import { useTaskMutations } from './use-task-mutations';

const PRIORITIES = ['low', 'normal', 'high'] as const;
const VISIBILITIES = ['household', 'private', 'members'] as const;
const UNITS = ['day', 'week', 'month', 'year'] as const;

function makeSchema(messages: { titleRequired: string; dueRequired: string }) {
  return z
    .object({
      title: z.string().trim().min(1, messages.titleRequired).max(200),
      notes: z.string().max(5000),
      assigneeMemberId: z.string(),
      dueDate: z.string(),
      dueTime: z.string(),
      priority: z.enum(PRIORITIES),
      recurrenceMode: z.enum(['none', 'fixed', 'floating']),
      rrule: z.string(),
      floatingInterval: z.number().int().min(1).max(1000),
      floatingUnit: z.enum(UNITS),
      rotationMemberIds: z.array(z.string()),
      points: z.number().int().min(0).max(1000),
      checklist: z.array(z.object({ text: z.string().trim().max(200), done: z.boolean() })),
      visibility: z.enum(VISIBILITIES),
    })
    .refine((v) => v.recurrenceMode === 'none' || v.dueDate !== '', {
      message: messages.dueRequired,
      path: ['dueDate'],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function defaults(task: Task | null, timeZone: string, myMemberId: string): FormValues {
  const due = fromDueAt(task?.dueAt ?? null, timeZone);
  const rec = task?.recurrence ?? null;
  return {
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    assigneeMemberId: task ? (task.assigneeMemberId ?? '') : myMemberId,
    dueDate: due.date,
    dueTime: due.time,
    priority: task?.priority ?? 'normal',
    recurrenceMode: rec?.mode ?? 'none',
    rrule: rec?.mode === 'fixed' ? rec.rrule : buildRRule(DEFAULT_RECURRENCE),
    floatingInterval: rec?.mode === 'floating' ? rec.interval : 7,
    floatingUnit: rec?.mode === 'floating' ? rec.unit : 'day',
    rotationMemberIds: task?.rotationMemberIds ?? [],
    points: task?.points ?? 0,
    checklist: task?.checklist.map((c) => ({ text: c.text, done: c.done })) ?? [],
    visibility: task?.visibility ?? 'household',
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new task. */
  task: Task | null;
}) {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const tr = useTranslations('recurrence');
  const tp = useTranslations('priority');
  const tv = useTranslations('visibility');
  const { members, member } = useHousehold();
  const fmt = useFormat();
  const toastError = useToastError();
  const { create, update } = useTaskMutations();

  const schema = React.useMemo(
    () => makeSchema({ titleRequired: t('titleRequired'), dueRequired: t('dueRequired') }),
    [t],
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(task, fmt.timeZone, member.id),
  });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const checklist = useFieldArray({ control, name: 'checklist' });

  React.useEffect(() => {
    if (open) reset(defaults(task, fmt.timeZone, member.id));
  }, [open, task, fmt.timeZone, member.id, reset]);

  const mode = useWatch({ control, name: 'recurrenceMode' });
  const floatingInterval = useWatch({ control, name: 'floatingInterval' });
  const dueDate = useWatch({ control, name: 'dueDate' });

  const onSubmit = handleSubmit(async (v) => {
    const recurrence =
      v.recurrenceMode === 'fixed'
        ? { mode: 'fixed' as const, rrule: v.rrule }
        : v.recurrenceMode === 'floating'
          ? { mode: 'floating' as const, interval: v.floatingInterval, unit: v.floatingUnit }
          : null;
    const body = {
      title: v.title.trim(),
      notes: v.notes.trim() || null,
      assigneeMemberId: v.assigneeMemberId || null,
      dueAt: toDueAt(v.dueDate, v.dueTime, fmt.timeZone),
      priority: v.priority,
      recurrence,
      rotationMemberIds: recurrence ? v.rotationMemberIds : [],
      points: v.points,
      checklist: v.checklist
        .filter((c) => c.text.trim() !== '')
        .map((c) => ({ text: c.text.trim(), done: c.done })),
      visibility: v.visibility,
    };
    try {
      if (task) await update.mutateAsync({ taskId: task.id, body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toastError(err);
    }
  });

  const errors = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{task ? t('editTask') : t('newTask')}</DialogTitle>
          <DialogDescription className="sr-only">{t('pageDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('title')} error={errors.title?.message}>
            {(p) => (
              <Input {...p} {...register('title')} placeholder={t('titlePlaceholder')} autoFocus />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('assignee')}>
              {(p) => (
                <NativeSelect {...p} {...register('assigneeMemberId')}>
                  <option value="">{t('unassigned')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('priority')}>
              {(p) => (
                <NativeSelect {...p} {...register('priority')}>
                  {PRIORITIES.map((x) => (
                    <option key={x} value={x}>
                      {tp(x)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('dueDate')} error={errors.dueDate?.message}>
              {(p) => <Input {...p} type="date" {...register('dueDate')} />}
            </Field>
            <Field label={t('dueTime')} hint={tc('optional')}>
              {(p) => <Input {...p} type="time" disabled={!dueDate} {...register('dueTime')} />}
            </Field>
          </div>

          <fieldset className="grid gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t('recurrenceMode')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm" role="radiogroup">
              {(['none', 'fixed', 'floating'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input
                    type="radio"
                    value={m}
                    className="accent-(--fp-primary)"
                    {...register('recurrenceMode')}
                  />
                  {tr(m)}
                </label>
              ))}
            </div>

            {mode === 'fixed' ? (
              <Controller
                control={control}
                name="rrule"
                render={({ field }) => (
                  <RecurrencePicker
                    required
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? buildRRule(DEFAULT_RECURRENCE))}
                    start={dueDate ? new Date(`${dueDate}T12:00:00`) : undefined}
                  />
                )}
              />
            ) : null}

            {mode === 'floating' ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Label htmlFor="task-floating-interval">{t('floatingEvery')}</Label>
                <Input
                  id="task-floating-interval"
                  type="number"
                  min={1}
                  max={1000}
                  className="w-20"
                  {...register('floatingInterval', { valueAsNumber: true })}
                />
                <NativeSelect
                  aria-label={t('floatingEvery')}
                  className="w-auto"
                  {...register('floatingUnit')}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {t(`floatingUnit.${u}`, {
                        count: Number.isFinite(floatingInterval) ? floatingInterval : 1,
                      })}
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-muted">{t('floatingAfter')}</span>
              </div>
            ) : null}

            {mode !== 'none' ? (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">{t('rotation')}</span>
                <Controller
                  control={control}
                  name="rotationMemberIds"
                  render={({ field }) => (
                    <MemberPicker
                      ordered
                      value={field.value}
                      onChange={field.onChange}
                      label={t('rotation')}
                    />
                  )}
                />
                <p className="text-xs text-muted">{t('rotationHint')}</p>
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('points')} error={errors.points?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  max={1000}
                  {...register('points', { valueAsNumber: true })}
                />
              )}
            </Field>
            <Field label={t('visibility')}>
              {(p) => (
                <NativeSelect {...p} {...register('visibility')}>
                  {VISIBILITIES.map((x) => (
                    <option key={x} value={x}>
                      {tv(x)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('checklist')}</legend>
            {checklist.fields.map((f, index) => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-(--fp-primary)"
                  aria-label={`${t('checklistItem', { index: index + 1 })}: ${tc('done')}`}
                  {...register(`checklist.${index}.done`)}
                />
                <Input
                  aria-label={t('checklistItem', { index: index + 1 })}
                  {...register(`checklist.${index}.text`)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('removeChecklistItem')}
                  onClick={() => checklist.remove(index)}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={checklist.fields.length >= 50}
              onClick={() => checklist.append({ text: '', done: false })}
            >
              <Plus aria-hidden />
              {t('addChecklistItem')}
            </Button>
          </fieldset>

          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={3} {...register('notes')} />}
          </Field>

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
