'use client';

import type { TimetableEntry } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { weekdayNames } from '@/features/health/dates';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';

export interface LessonDraft {
  memberId: string;
  entry?: TimetableEntry;
  weekday?: number;
  period?: number;
  startTime?: string | undefined;
  endTime?: string | undefined;
}

interface FormValues {
  weekday: string;
  period: string;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
  teacher: string;
  week: '' | 'A' | 'B';
  validFrom: string;
  validTo: string;
}

/** Typical German school day: 45-minute lessons from 08:00 with short breaks. */
function defaultTimes(period: number): [string, string] {
  const start = 8 * 60 + (Math.max(period, 1) - 1) * 50;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return [fmt(start), fmt(start + 45)];
}

export function LessonDialog({
  draft,
  onClose,
  onDelete,
}: {
  draft: LessonDraft | null;
  onClose: () => void;
  onDelete: (e: TimetableEntry) => void;
}) {
  const t = useTranslations('school.lessons');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const locale = useLocale();
  const days = weekdayNames(locale, 'long');
  const { householdId, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const open = draft !== null;
  const entry = draft?.entry;

  const defaults = React.useCallback((): FormValues => {
    const period = entry?.period ?? draft?.period ?? 1;
    const [s, e] = defaultTimes(period);
    return {
      weekday: String(entry?.weekday ?? draft?.weekday ?? 1),
      period: String(period),
      startTime: entry?.startTime ?? draft?.startTime ?? s,
      endTime: entry?.endTime ?? draft?.endTime ?? e,
      subject: entry?.subject ?? '',
      room: entry?.room ?? '',
      teacher: entry?.teacher ?? '',
      week: entry?.week ?? '',
      validFrom: entry?.validFrom ?? '',
      validTo: entry?.validTo ?? '',
    };
  }, [entry, draft]);
  const { register, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        weekday: Number(v.weekday),
        period: Number(v.period),
        startTime: v.startTime,
        endTime: v.endTime,
        subject: v.subject.trim(),
        room: v.room.trim() || null,
        teacher: v.teacher.trim() || null,
        week: v.week || null,
        validFrom: v.validFrom || null,
        validTo: v.validTo || null,
      };
      return entry
        ? api.school.timetable.update({ params: { householdId, entryId: entry.id }, body })
        : api.school.timetable.create({
            params: { householdId },
            body: { ...body, memberId: draft?.memberId ?? '' },
          });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['school'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    if (v.startTime >= v.endTime) {
      setError('endTime', { message: t('endAfterStart') });
      return;
    }
    mutation.mutate(v);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{memberById(draft?.memberId)?.displayName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('subject')} error={formState.errors.subject?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('subject', {
                  validate: (v) => v.trim().length > 0 || tu('required'),
                })}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('weekday')}>
              {(p) => (
                <NativeSelect {...p} {...register('weekday')}>
                  {days.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('period')}>
              {(p) => <Input {...p} type="number" min={0} max={20} {...register('period')} />}
            </Field>
            <Field label={t('startTime')}>
              {(p) => <Input {...p} type="time" {...register('startTime', { required: true })} />}
            </Field>
            <Field label={t('endTime')} error={formState.errors.endTime?.message}>
              {(p) => <Input {...p} type="time" {...register('endTime', { required: true })} />}
            </Field>
            <Field label={t('room')}>{(p) => <Input {...p} {...register('room')} />}</Field>
            <Field label={t('teacher')}>{(p) => <Input {...p} {...register('teacher')} />}</Field>
          </div>
          <Field label={t('week')}>
            {(p) => (
              <NativeSelect {...p} {...register('week')}>
                <option value="">{t('everyWeek')}</option>
                <option value="A">{t('onlyA')}</option>
                <option value="B">{t('onlyB')}</option>
              </NativeSelect>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('validFrom')}>
              {(p) => <Input {...p} type="date" {...register('validFrom')} />}
            </Field>
            <Field label={t('validTo')}>
              {(p) => <Input {...p} type="date" {...register('validTo')} />}
            </Field>
          </div>
          <DialogFooter className="sm:justify-between">
            {entry ? (
              <Button variant="ghost" className="text-danger" onClick={() => onDelete(entry)}>
                <Trash2 aria-hidden />
                {tc('delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={onClose}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {tc('save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
