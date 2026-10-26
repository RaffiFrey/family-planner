'use client';

import { TRIP_ITEM_KINDS, type TripItem } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { fromLocalInput, toLocalInput } from './utils';

type Kind = TripItem['kind'];

interface FormValues {
  kind: Kind;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  confirmationCode: string;
  notes: string;
}

export function ItemDialog({
  open,
  onOpenChange,
  tripId,
  item,
  defaultStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  item: TripItem | null;
  /** `YYYY-MM-DD` used to prefill new items (trip start). */
  defaultStart: string;
}) {
  const t = useTranslations('travel.itinerary');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      kind: item?.kind ?? 'activity',
      title: item?.title ?? '',
      startAt: item ? toLocalInput(item.startAt) : `${defaultStart}T09:00`,
      endAt: toLocalInput(item?.endAt),
      location: item?.location ?? '',
      confirmationCode: item?.confirmationCode ?? '',
      notes: item?.notes ?? '',
    }),
    [item, defaultStart],
  );
  const { register, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (body: {
      kind: Kind;
      title: string;
      startAt: string | null;
      endAt: string | null;
      location: string | null;
      confirmationCode: string | null;
      notes: string | null;
    }) =>
      item
        ? api.travel.updateItem({ params: { householdId, tripId, itemId: item.id }, body })
        : api.travel.addItem({ params: { householdId, tripId }, body }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['travel'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    const startAt = fromLocalInput(v.startAt);
    const endAt = fromLocalInput(v.endAt);
    if (startAt && endAt && endAt < startAt) {
      setError('endAt', { message: t('endBeforeStart') });
      return;
    }
    mutation.mutate({
      kind: v.kind,
      title: v.title.trim(),
      startAt,
      endAt,
      location: v.location.trim() || null,
      confirmationCode: v.confirmationCode.trim() || null,
      notes: v.notes.trim() || null,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('title')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label={t('kind')}>
              {(p) => (
                <NativeSelect {...p} {...register('kind')}>
                  {TRIP_ITEM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('itemTitle')} error={formState.errors.title?.message}>
              {(p) => <Input {...p} {...register('title', { required: tu('required') })} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('startAt')}>
              {(p) => <Input type="datetime-local" {...p} {...register('startAt')} />}
            </Field>
            <Field label={t('endAt')} error={formState.errors.endAt?.message}>
              {(p) => <Input type="datetime-local" {...p} {...register('endAt')} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('location')}>{(p) => <Input {...p} {...register('location')} />}</Field>
            <Field label={t('confirmationCode')}>
              {(p) => <Input {...p} autoComplete="off" {...register('confirmationCode')} />}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={3} {...register('notes')} />}
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
