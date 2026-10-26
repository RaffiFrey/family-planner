'use client';

import type { Trip } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from '@/features/finance/category-select';
import { MoneyInput } from '@/features/finance/money-input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { asCurrency, todayLocalDate } from './utils';

interface FormValues {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  financeCategoryId: string;
  memberIds: string[];
  notes: string;
}

export function TripDialog({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip | null;
}) {
  const t = useTranslations('travel');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { householdId, can } = useHousehold();
  const toastError = useToastError();
  const canFinance = can('finance.read');
  const tripCurrency = asCurrency(trip?.currency ?? fmt.currency, fmt.currency);

  const defaults = React.useCallback((): FormValues => {
    const today = todayLocalDate();
    return {
      name: trip?.name ?? '',
      destination: trip?.destination ?? '',
      startDate: trip?.startDate ?? today,
      endDate: trip?.endDate ?? today,
      budget: trip?.budgetMinor != null ? fmt.moneyInput(trip.budgetMinor, tripCurrency) : '',
      financeCategoryId: trip?.financeCategoryId ?? '',
      memberIds: trip?.memberIds ?? [],
      notes: trip?.notes ?? '',
    };
  }, [trip, fmt, tripCurrency]);

  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (body: {
      name: string;
      destination: string | null;
      startDate: string;
      endDate: string;
      budgetMinor: number | null;
      financeCategoryId?: string | null;
      memberIds: string[];
      notes: string | null;
    }) =>
      trip
        ? api.travel.update({ params: { householdId, tripId: trip.id }, body })
        : api.travel.create({ params: { householdId }, body }),
    onSuccess: async (saved) => {
      toast.success(trip ? t('saved') : t('created'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['travel'] });
      if (!trip) router.push(`/travel/${saved.id}`);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    if (v.endDate < v.startDate) {
      setError('endDate', { message: t('endBeforeStart') });
      return;
    }
    let budgetMinor: number | null = null;
    if (v.budget.trim()) {
      try {
        budgetMinor = fmt.parseMoney(v.budget, tripCurrency);
      } catch {
        setError('budget', { message: tu('invalidAmount') });
        return;
      }
      if (budgetMinor < 0) {
        setError('budget', { message: tu('invalidAmount') });
        return;
      }
    }
    mutation.mutate({
      name: v.name.trim(),
      destination: v.destination.trim() || null,
      startDate: v.startDate,
      endDate: v.endDate,
      budgetMinor,
      ...(canFinance ? { financeCategoryId: v.financeCategoryId || null } : {}),
      memberIds: v.memberIds,
      notes: v.notes.trim() || null,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{trip ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('name')} error={formState.errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                placeholder={t('namePlaceholder')}
                {...register('name', { required: tu('required') })}
              />
            )}
          </Field>
          <Field label={t('destination')}>
            {(p) => <Input {...p} {...register('destination')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('startDate')} error={formState.errors.startDate?.message}>
              {(p) => (
                <Input
                  type="date"
                  {...p}
                  {...register('startDate', { required: tu('required') })}
                />
              )}
            </Field>
            <Field label={t('endDate')} error={formState.errors.endDate?.message}>
              {(p) => (
                <Input type="date" {...p} {...register('endDate', { required: tu('required') })} />
              )}
            </Field>
          </div>
          {canFinance ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('budget')}
                hint={t('budgetHint')}
                error={formState.errors.budget?.message}
              >
                {(p) => <MoneyInput {...p} currency={tripCurrency} {...register('budget')} />}
              </Field>
              <Field label={t('financeCategory')} hint={t('financeCategoryHint')}>
                {(p) => (
                  <CategorySelect
                    {...p}
                    kind="expense"
                    emptyLabel={t('noCategory')}
                    includeId={trip?.financeCategoryId}
                    {...register('financeCategoryId')}
                  />
                )}
              </Field>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{t('members')}</Label>
            <Controller
              control={control}
              name="memberIds"
              render={({ field }) => (
                <MemberPicker value={field.value} onChange={field.onChange} label={t('members')} />
              )}
            />
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
