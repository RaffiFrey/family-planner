'use client';

import { apiQuery } from '@fp/api-client';
import type { Calendar, Occurrence } from '@fp/contracts';
import { floatingToLocalDate, parseLocalDate, toLocalDate } from '@fp/domain/time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Repeat, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Controller,
  type FieldPath,
  useForm,
  type UseFormSetError,
  useWatch,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ColorPicker } from '@/components/color-picker';
import { MemberPicker } from '@/components/member-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { RecurrencePicker } from '@/features/recurrence/recurrence-picker';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { addDays, atTime, type DayKey, timeOf } from './date-utils';
import { type EditScope, ScopeDialog } from './scope-dialog';

export type EventDialogState =
  { mode: 'create'; day: DayKey; time?: string } | { mode: 'edit'; occurrence: Occurrence };

const REMINDER_PRESETS = [0, 10, 30, 60, 1440] as const;
const MAX_REMINDERS = 5;

interface EventFormValues {
  title: string;
  calendarId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  rrule: string | null;
  attendeeMemberIds: string[];
  reminders: number[];
  useColor: boolean;
  color: string;
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const next = Math.min((h ?? 0) + 1, 23);
  return `${String(next).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

function defaultsFor(
  state: EventDialogState,
  calendars: Calendar[],
  timeZone: string,
): EventFormValues {
  if (state.mode === 'create') {
    const startTime = state.time ?? '09:00';
    return {
      title: '',
      calendarId: calendars[0]?.id ?? '',
      allDay: false,
      startDate: state.day,
      startTime,
      endDate: state.day,
      endTime: state.time === '23:00' ? '23:59' : addHour(startTime),
      location: '',
      description: '',
      rrule: null,
      attendeeMemberIds: [],
      reminders: [],
      useColor: false,
      color: calendars[0]?.color ?? '#1d5ef1',
    };
  }
  const o = state.occurrence;
  const start = new Date(o.start);
  const end = new Date(o.end);
  let startDate: string;
  let endDate: string;
  let startTime = '09:00';
  let endTime = '10:00';
  if (o.allDay) {
    startDate = floatingToLocalDate(start);
    const endExcl = floatingToLocalDate(end);
    endDate = endExcl > startDate ? addDays(endExcl, -1) : startDate;
  } else {
    startDate = toLocalDate(start, timeZone);
    endDate = toLocalDate(end, timeZone);
    startTime = timeOf(start, timeZone);
    endTime = timeOf(end, timeZone);
  }
  return {
    title: o.title,
    calendarId: o.calendarId,
    allDay: o.allDay,
    startDate,
    startTime,
    endDate,
    endTime,
    location: o.location ?? '',
    description: o.description ?? '',
    rrule: o.rrule,
    attendeeMemberIds: o.attendeeMemberIds,
    reminders: o.reminders,
    useColor: o.color !== null,
    color: o.color ?? calendars.find((c) => c.id === o.calendarId)?.color ?? '#1d5ef1',
  };
}

/** Start/end instants as ISO strings. All-day: midnight UTC of the first day, exclusive end. */
function toRange(
  v: Pick<EventFormValues, 'allDay' | 'startDate' | 'startTime' | 'endDate' | 'endTime'>,
  timeZone: string,
) {
  if (v.allDay) {
    return { start: `${v.startDate}T00:00:00.000Z`, end: `${addDays(v.endDate, 1)}T00:00:00.000Z` };
  }
  return {
    start: atTime(v.startDate, v.startTime, timeZone).toISOString(),
    end: atTime(v.endDate, v.endTime, timeZone).toISOString(),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface EventDialogProps {
  state: EventDialogState | null;
  onClose: () => void;
  calendars: Calendar[];
  /** Calendars mirroring an ICS subscription; their events open read-only. */
  readOnlyIds?: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

export function EventDialog({ state, onClose, calendars, readOnlyIds = NO_IDS }: EventDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      {state ? (
        <DialogContent className="max-w-2xl">
          <EventForm
            key={
              state.mode === 'edit'
                ? `${state.occurrence.eventId}-${state.occurrence.originalStart}`
                : state.day
            }
            state={state}
            onClose={onClose}
            calendars={calendars}
            readOnlyIds={readOnlyIds}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EventForm({
  state,
  onClose,
  calendars: allCalendars,
  readOnlyIds,
}: {
  state: EventDialogState;
  onClose: () => void;
  calendars: Calendar[];
  readOnlyIds: ReadonlySet<string>;
}) {
  const ti = useTranslations('integrations.readOnly');
  const t = useTranslations('calendar.event');
  const tr = useTranslations('calendar.reminderOptions');
  const tc = useTranslations('common');
  const { householdId, household, can } = useHousehold();
  const timeZone = household.timezone;
  const occurrence = state.mode === 'edit' ? state.occurrence : null;
  const readOnly = occurrence ? readOnlyIds.has(occurrence.calendarId) : false;
  const canWrite = can('calendar.write') && !readOnly;
  // New or moved events can only go into writable (non-subscribed) calendars.
  const calendars = React.useMemo(
    () =>
      allCalendars.filter(
        (c) => !readOnlyIds.has(c.id) || (occurrence && c.id === occurrence.calendarId),
      ),
    [allCalendars, readOnlyIds, occurrence],
  );
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const isRecurring = Boolean(occurrence?.rrule);

  const schema = React.useMemo(
    () =>
      z
        .object({
          title: z.string().trim().min(1, t('titleRequired')).max(200),
          calendarId: z.string().min(1, t('calendarRequired')),
          allDay: z.boolean(),
          startDate: z.string().regex(DATE_RE),
          startTime: z.string(),
          endDate: z.string().regex(DATE_RE),
          endTime: z.string(),
          location: z.string().max(300),
          description: z.string().max(5000),
          rrule: z.string().nullable(),
          attendeeMemberIds: z.array(z.string()),
          reminders: z.array(z.number().int().min(0)).max(MAX_REMINDERS),
          useColor: z.boolean(),
          color: z.string(),
        })
        .superRefine((v, ctx) => {
          if (!v.allDay && (!TIME_RE.test(v.startTime) || !TIME_RE.test(v.endTime))) {
            ctx.addIssue({ code: 'custom', path: ['endTime'], message: t('endBeforeStart') });
            return;
          }
          const { start, end } = toRange(v, timeZone);
          if (end < start || (v.allDay && v.endDate < v.startDate)) {
            ctx.addIssue({ code: 'custom', path: ['endDate'], message: t('endBeforeStart') });
          }
        }),
    [t, timeZone],
  );

  const form = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(state, calendars, timeZone),
  });
  const { register, control, handleSubmit, setError, setValue, formState } = form;
  const allDay = useWatch({ control, name: 'allDay' });
  const useColor = useWatch({ control, name: 'useColor' });
  const startDate = useWatch({ control, name: 'startDate' });
  const reminders = useWatch({ control, name: 'reminders' });

  const [scopeKind, setScopeKind] = React.useState<'edit' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pending, setPending] = React.useState<EventFormValues | null>(null);

  const remapErrors: UseFormSetError<EventFormValues> = (name, error, options) => {
    const map: Record<string, FieldPath<EventFormValues>> = {
      start: 'startDate',
      end: 'endDate',
      attendees: 'attendeeMemberIds',
    };
    setError(map[name] ?? name, error, options);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar'] });
  const onError = (err: unknown) => {
    if (!applyFieldErrors(err, remapErrors)) toastError(err);
  };

  const fields = (v: EventFormValues) => ({
    calendarId: v.calendarId,
    title: v.title.trim(),
    description: v.description.trim() || null,
    location: v.location.trim() || null,
    allDay: v.allDay,
    timezone: timeZone,
    attendeeMemberIds: v.attendeeMemberIds,
    reminders: v.reminders,
    color: v.useColor ? v.color : null,
  });

  const createMutation = useMutation({
    mutationFn: (v: EventFormValues) =>
      api.calendar.createEvent({
        params: { householdId },
        body: { ...fields(v), ...toRange(v, timeZone), rrule: v.rrule },
      }),
    onSuccess: () => {
      toast.success(t('created'));
      onClose();
    },
    onError,
    onSettled: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ v, scope }: { v: EventFormValues; scope: EditScope }) => {
      if (!occurrence) throw new Error('No occurrence');
      const params = { householdId, eventId: occurrence.eventId };
      const range = toRange(v, timeZone);
      if (scope === 'this') {
        return api.calendar.updateEvent({
          params,
          body: { ...fields(v), ...range, scope, occurrenceStart: occurrence.originalStart },
        });
      }
      if (scope === 'following') {
        return api.calendar.updateEvent({
          params,
          body: {
            ...fields(v),
            ...range,
            rrule: v.rrule,
            scope,
            occurrenceStart: occurrence.originalStart,
          },
        });
      }
      // "All": shift the series by however much this occurrence was moved.
      const startDelta = new Date(range.start).getTime() - new Date(occurrence.start).getTime();
      const newDuration = new Date(range.end).getTime() - new Date(range.start).getTime();
      const oldDuration = new Date(occurrence.end).getTime() - new Date(occurrence.start).getTime();
      const timingChanged =
        startDelta !== 0 || newDuration !== oldDuration || v.allDay !== occurrence.allDay;
      let timing = {};
      if (timingChanged) {
        const series = isRecurring
          ? await queryClient.query(apiQuery(api, 'calendar', 'getEvent', { params }))
          : occurrence;
        const seriesStart = new Date(new Date(series.start).getTime() + startDelta);
        timing = {
          start: seriesStart.toISOString(),
          end: new Date(seriesStart.getTime() + newDuration).toISOString(),
        };
      }
      return api.calendar.updateEvent({
        params,
        body: { ...fields(v), ...timing, rrule: v.rrule, scope: 'all' },
      });
    },
    onSuccess: () => {
      toast.success(t('updated'));
      setScopeKind(null);
      onClose();
    },
    onError: (err) => {
      setScopeKind(null);
      onError(err);
    },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (scope: EditScope) => {
      if (!occurrence) throw new Error('No occurrence');
      return api.calendar.deleteEvent({
        params: { householdId, eventId: occurrence.eventId },
        query: scope === 'all' ? { scope } : { scope, occurrenceStart: occurrence.originalStart },
      });
    },
    onSuccess: () => {
      toast.success(t('deleted'));
      setScopeKind(null);
      setConfirmDelete(false);
      onClose();
    },
    onError: toastError,
    onSettled: invalidate,
  });

  const onSubmit = handleSubmit((v) => {
    if (!occurrence) {
      createMutation.mutate(v);
    } else if (isRecurring) {
      setPending(v);
      setScopeKind('edit');
    } else {
      updateMutation.mutate({ v, scope: 'all' });
    }
  });

  const onDelete = () => {
    if (isRecurring) setScopeKind('delete');
    else setConfirmDelete(true);
  };

  const startForPicker = React.useMemo(() => {
    try {
      const { year, month, day } = parseLocalDate(startDate);
      return new Date(year, month - 1, day);
    } catch {
      return new Date();
    }
  }, [startDate]);

  const reminderOptions = [...new Set<number>([...REMINDER_PRESETS, ...reminders])].sort(
    (a, b) => a - b,
  );
  const reminderLabel = (m: number) => {
    switch (m) {
      case 0:
        return tr('r0');
      case 10:
        return tr('r10');
      case 30:
        return tr('r30');
      case 60:
        return tr('r60');
      case 1440:
        return tr('r1440');
      default:
        return tr('custom', { count: m });
    }
  };
  const toggleReminder = (m: number, on: boolean) => {
    const next = on ? [...reminders, m] : reminders.filter((r) => r !== m);
    setValue(
      'reminders',
      next.sort((a, b) => a - b),
      { shouldDirty: true },
    );
  };

  const title = !occurrence ? t('createTitle') : canWrite ? t('editTitle') : t('viewTitle');
  const errors = formState.errors;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {title}
          {isRecurring ? (
            <Badge variant="secondary">
              <Repeat aria-hidden />
              {t('recurring')}
            </Badge>
          ) : null}
          {readOnly ? (
            <Badge variant="outline">
              <Lock aria-hidden />
              {ti('label')}
            </Badge>
          ) : null}
        </DialogTitle>
        <DialogDescription>{readOnly ? ti('eventHint') : t('description')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
        <fieldset disabled={!canWrite} className="grid gap-4">
          <Field label={t('titleLabel')} error={errors.title?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('title')}
                placeholder={t('titlePlaceholder')}
                autoFocus={!occurrence}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('calendar')} error={errors.calendarId?.message}>
              {(p) => (
                <NativeSelect {...p} {...register('calendarId')}>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <div className="flex items-end pb-2">
              <Controller
                control={control}
                name="allDay"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="event-all-day"
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c === true)}
                    />
                    <Label htmlFor="event-all-day">{t('allDay')}</Label>
                  </div>
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label={t('startDate')} error={errors.startDate?.message}>
                {(p) => <Input {...p} type="date" {...register('startDate')} />}
              </Field>
              {allDay ? null : (
                <Field label={t('startTime')} error={errors.startTime?.message}>
                  {(p) => <Input {...p} type="time" className="w-28" {...register('startTime')} />}
                </Field>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label={t('endDate')} error={errors.endDate?.message}>
                {(p) => <Input {...p} type="date" {...register('endDate')} />}
              </Field>
              {allDay ? null : (
                <Field label={t('endTime')} error={errors.endTime?.message}>
                  {(p) => <Input {...p} type="time" className="w-28" {...register('endTime')} />}
                </Field>
              )}
            </div>
          </div>

          <Controller
            control={control}
            name="rrule"
            render={({ field }) => (
              <RecurrencePicker
                value={field.value}
                onChange={field.onChange}
                start={startForPicker}
              />
            )}
          />

          <Field label={t('location')} error={errors.location?.message}>
            {(p) => <Input {...p} {...register('location')} />}
          </Field>

          <Field label={t('notes')} error={errors.description?.message}>
            {(p) => <Textarea {...p} rows={3} {...register('description')} />}
          </Field>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('attendees')}</span>
            <Controller
              control={control}
              name="attendeeMemberIds"
              render={({ field }) => (
                <MemberPicker
                  value={field.value}
                  onChange={field.onChange}
                  label={t('attendees')}
                />
              )}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('reminders')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {reminderOptions.map((m) => {
                const checked = reminders.includes(m);
                const id = `event-reminder-${m}`;
                return (
                  <div key={m} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={!checked && reminders.length >= MAX_REMINDERS}
                      onCheckedChange={(c) => toggleReminder(m, c === true)}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {reminderLabel(m)}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Controller
              control={control}
              name="useColor"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="event-use-color"
                    checked={field.value}
                    onCheckedChange={(c) => field.onChange(c === true)}
                  />
                  <Label htmlFor="event-use-color">{t('customColor')}</Label>
                </div>
              )}
            />
            {useColor ? (
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <ColorPicker value={field.value} onChange={field.onChange} />
                )}
              />
            ) : null}
          </div>
        </fieldset>

        <DialogFooter className="sm:justify-between">
          {occurrence && canWrite ? (
            <Button variant="ghost" className="text-danger" onClick={onDelete}>
              <Trash2 aria-hidden />
              {tc('delete')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={onClose}>
              {canWrite ? tc('cancel') : tc('close')}
            </Button>
            {canWrite ? (
              <Button
                type="submit"
                loading={
                  createMutation.isPending || (updateMutation.isPending && scopeKind === null)
                }
              >
                {tc('save')}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </form>

      <ScopeDialog
        open={scopeKind !== null}
        onOpenChange={(open) => !open && setScopeKind(null)}
        kind={scopeKind === 'delete' ? 'delete' : 'edit'}
        loading={updateMutation.isPending || deleteMutation.isPending}
        onConfirm={(scope) => {
          if (scopeKind === 'delete') deleteMutation.mutate(scope);
          else if (pending) updateMutation.mutate({ v: pending, scope });
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle')}
        description={t('deleteBody', { title: occurrence?.title ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate('all')}
      />
    </>
  );
}
