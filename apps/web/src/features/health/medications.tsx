'use client';

import type { Medication, Member } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, MoreVertical, Pencil, Pill, Plus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { BYDAY, todayIso, weekdayNames } from './dates';

function medKey(householdId: string, memberId: string) {
  return ['health', 'medications.list', householdId, memberId] as const;
}

/** Weekday indices (0 = Monday) from an RRULE BYDAY part; null = every day. */
function parseDays(rrule: string): number[] | null {
  const m = /BYDAY=([A-Z,]+)/.exec(rrule);
  if (!m?.[1]) return null;
  return m[1]
    .split(',')
    .map((d) => BYDAY.indexOf(d as (typeof BYDAY)[number]))
    .filter((i) => i >= 0);
}

export function MedicationsPanel({ member }: { member: Member }) {
  const t = useTranslations('health.medications');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const locale = useLocale();
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('health.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: medKey(householdId, member.id),
    queryFn: () =>
      api.health.medications.list({ params: { householdId }, query: { memberId: member.id } }),
  });
  const [dialog, setDialog] = React.useState<{ open: boolean; item: Medication | null }>({
    open: false,
    item: null,
  });
  const [deleting, setDeleting] = React.useState<Medication | null>(null);
  const [scheduleFor, setScheduleFor] = React.useState<Medication | null>(null);
  const days = weekdayNames(locale);

  const remove = useMutation({
    mutationFn: (m: Medication) =>
      api.health.medications.remove({ params: { householdId, medicationId: m.id } }),
    onMutate: async (m) => {
      const key = medKey(householdId, member.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Medication[]>(key);
      queryClient.setQueryData<Medication[]>(key, (old) => old?.filter((x) => x.id !== m.id));
      return { prev };
    },
    onError: (err, _m, ctx) => {
      queryClient.setQueryData(medKey(householdId, member.id), ctx?.prev);
      toastError(err);
    },
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('deleted'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  });

  const addButton = canWrite ? (
    <Button onClick={() => setDialog({ open: true, item: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="grid gap-4">
      {query.data.length > 0 && addButton ? (
        <div className="flex justify-end">{addButton}</div>
      ) : null}
      {query.data.length === 0 ? (
        <EmptyState
          icon={<Pill />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {query.data.map((m) => {
            const dayIdx = parseDays(m.rrule);
            return (
              <li key={m.id}>
                <Card className="h-full">
                  <CardContent className="grid gap-2 pt-4">
                    <div className="flex items-start gap-3">
                      <Pill className="mt-0.5 size-5 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {m.name}
                          {m.dose ? <span className="text-muted"> · {m.dose}</span> : null}
                        </p>
                        <p className="text-sm text-muted">
                          {dayIdx ? dayIdx.map((i) => days[i]).join(', ') : t('daily')} ·{' '}
                          {m.times.join(', ')}
                        </p>
                      </div>
                      {m.reminders ? (
                        <Bell className="size-4 text-muted" aria-label={t('remindersOn')} />
                      ) : null}
                      {canWrite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                              <MoreVertical aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDialog({ open: true, item: m })}>
                              <Pencil aria-hidden />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(m)}>
                              <Trash2 aria-hidden />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.nextAt ? (
                        <Badge variant="secondary">
                          {t('next', { date: fmt.dateTime(m.nextAt) })}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t('ended')}</Badge>
                      )}
                      <Button variant="link" size="sm" onClick={() => setScheduleFor(m)}>
                        <CalendarClock aria-hidden />
                        {t('schedule')}
                      </Button>
                    </div>
                    {m.notes ? <p className="text-sm">{m.notes}</p> : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <MedicationDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        item={dialog.item}
        member={member}
      />
      <ScheduleDialog medication={scheduleFor} onClose={() => setScheduleFor(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.name ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function ScheduleDialog({
  medication,
  onClose,
}: {
  medication: Medication | null;
  onClose: () => void;
}) {
  const t = useTranslations('health.medications');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const range = React.useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 3600_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const query = useQuery({
    queryKey: ['health', 'medications.schedule', householdId, medication?.id, range.from],
    queryFn: () =>
      api.health.medications.schedule({
        params: { householdId, medicationId: medication?.id ?? '' },
        query: range,
      }),
    enabled: medication !== null,
  });

  const grouped = React.useMemo(() => {
    const out = new Map<string, string[]>();
    for (const i of query.data ?? []) {
      const day = fmt.date(i.at, { weekday: 'long', day: 'numeric', month: 'long' });
      out.set(day, [...(out.get(day) ?? []), fmt.time(i.at)]);
    }
    return [...out.entries()];
  }, [query.data, fmt]);

  return (
    <Dialog open={medication !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('scheduleTitle', { name: medication?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('scheduleRange')}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted">{t('noIntakes')}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {grouped.map(([day, times]) => (
              <div key={day} className="contents">
                <dt className="text-muted">{day}</dt>
                <dd className="tabular-nums">{times.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormValues {
  name: string;
  dose: string;
  times: { value: string }[];
  mode: 'daily' | 'weekdays';
  days: number[];
  startOn: string;
  endOn: string;
  reminders: boolean;
  notes: string;
}

function MedicationDialog({
  open,
  onOpenChange,
  item,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Medication | null;
  member: Member;
}) {
  const t = useTranslations('health.medications');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const locale = useLocale();
  const days = weekdayNames(locale);
  const { householdId, household } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const defaults = React.useCallback((): FormValues => {
    const parsed = item ? parseDays(item.rrule) : null;
    return {
      name: item?.name ?? '',
      dose: item?.dose ?? '',
      times: (item?.times ?? ['08:00']).map((value) => ({ value })),
      mode: parsed ? 'weekdays' : 'daily',
      days: parsed ?? [0, 1, 2, 3, 4],
      startOn: item?.startOn ?? todayIso(),
      endOn: item?.endOn ?? '',
      reminders: item?.reminders ?? true,
      notes: item?.notes ?? '',
    };
  }, [item]);
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  const times = useFieldArray({ control, name: 'times' });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);
  const mode = useWatch({ control, name: 'mode' });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const rrule =
        v.mode === 'daily'
          ? 'FREQ=DAILY'
          : `FREQ=WEEKLY;BYDAY=${[...v.days]
              .sort()
              .map((d) => BYDAY[d])
              .join(',')}`;
      const body = {
        name: v.name.trim(),
        dose: v.dose.trim() || null,
        times: [...new Set(v.times.map((x) => x.value).filter(Boolean))].sort(),
        rrule,
        timezone: item?.timezone ?? household.timezone,
        startOn: v.startOn,
        endOn: v.endOn || null,
        reminders: v.reminders,
        notes: v.notes.trim() || null,
      };
      return item
        ? api.health.medications.update({ params: { householdId, medicationId: item.id }, body })
        : api.health.medications.create({
            params: { householdId },
            body: { ...body, memberId: member.id },
          });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['health'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    if (!v.times.some((x) => x.value)) {
      setError('times', { message: t('timeInvalid') });
      return;
    }
    if (v.mode === 'weekdays' && v.days.length === 0) {
      setError('days', { message: t('pickDay') });
      return;
    }
    mutation.mutate(v);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{member.displayName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('name')} error={formState.errors.name?.message}>
              {(p) => (
                <Input
                  {...p}
                  {...register('name', { validate: (v) => v.trim().length > 0 || tu('required') })}
                />
              )}
            </Field>
            <Field label={t('dose')}>
              {(p) => <Input {...p} placeholder={t('dosePlaceholder')} {...register('dose')} />}
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('times')}</legend>
            <div className="flex flex-wrap gap-2">
              {times.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-1">
                  <Input
                    type="time"
                    className="w-32"
                    aria-label={`${t('times')} ${i + 1}`}
                    {...register(`times.${i}.value`)}
                  />
                  {times.fields.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('removeTime')}
                      onClick={() => times.remove(i)}
                    >
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="self-center"
                disabled={times.fields.length >= 12}
                onClick={() => times.append({ value: '' })}
              >
                <Plus aria-hidden />
                {t('addTime')}
              </Button>
            </div>
            {formState.errors.times?.message ? (
              <p role="alert" className="text-xs text-danger">
                {formState.errors.times.message}
              </p>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('days')}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" value="daily" {...register('mode')} />
                {t('daily')}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" value="weekdays" {...register('mode')} />
                {t('weekdays')}
              </label>
            </div>
            {mode === 'weekdays' ? (
              <Controller
                control={control}
                name="days"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('days')}>
                    {days.map((d, i) => {
                      const on = field.value.includes(i);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            field.onChange(
                              on ? field.value.filter((x) => x !== i) : [...field.value, i],
                            )
                          }
                          className={cn(
                            'h-9 min-w-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-surface-muted',
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            ) : null}
            {formState.errors.days?.message ? (
              <p role="alert" className="text-xs text-danger">
                {formState.errors.days.message}
              </p>
            ) : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('startOn')}>
              {(p) => <Input {...p} type="date" {...register('startOn', { required: true })} />}
            </Field>
            <Field label={t('endOn')}>
              {(p) => <Input {...p} type="date" {...register('endOn')} />}
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="reminders"
              render={({ field }) => (
                <Checkbox
                  id="med-reminders"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="med-reminders" className="font-normal">
              {t('reminders')}
            </Label>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
