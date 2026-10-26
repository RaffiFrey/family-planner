'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MoreVertical, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
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
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { BudgetRow } from './budget-row';
import { CategorySelect } from './category-select';
import { type BudgetStatus, useInvalidateFinance } from './hooks';
import { MoneyInput } from './money-input';

type Budget = BudgetStatus['budget'];

export function BudgetsPage() {
  const t = useTranslations('finance.budgets');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('finance.write');
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const query = useQuery(apiQuery(api, 'finance', 'listBudgets', { params: { householdId } }));
  const [dialog, setDialog] = React.useState<{ open: boolean; budget: Budget | null }>({
    open: false,
    budget: null,
  });
  const [deleting, setDeleting] = React.useState<Budget | null>(null);

  const remove = useMutation({
    mutationFn: (b: Budget) =>
      api.finance.deleteBudget({ params: { householdId, budgetId: b.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const addButton = canWrite ? (
    <Button onClick={() => setDialog({ open: true, budget: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader title={t('title')} actions={addButton} />
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3">
          {query.data.map((s) => (
            <li key={s.budget.id}>
              <Card>
                <CardContent className="grid gap-1 pt-4">
                  <BudgetRow
                    status={s}
                    actions={
                      canWrite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                              <MoreVertical aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => setDialog({ open: true, budget: s.budget })}
                            >
                              <Pencil aria-hidden />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleting(s.budget)}
                            >
                              <Trash2 aria-hidden />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null
                    }
                  />
                  <p className="text-xs text-muted">
                    {t(`periods.${s.budget.period}`)} ·{' '}
                    {t('periodRange', {
                      from: fmt.date(s.periodStart),
                      // periodEnd is exclusive.
                      to: fmt.date(new Date(new Date(s.periodEnd).getTime() - 1)),
                    })}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <BudgetDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        budget={dialog.budget}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

interface FormValues {
  categoryId: string;
  period: Budget['period'];
  limit: string;
  rollover: boolean;
}

function BudgetDialog({
  open,
  onOpenChange,
  budget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget | null;
}) {
  const t = useTranslations('finance.budgets');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      categoryId: budget?.categoryId ?? '',
      period: budget?.period ?? 'monthly',
      limit: budget ? fmt.moneyInput(budget.limitMinor) : '',
      rollover: budget?.rollover ?? false,
    }),
    [budget, fmt],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (v: {
      categoryId: string;
      period: Budget['period'];
      limitMinor: number;
      rollover: boolean;
    }) =>
      budget
        ? api.finance.updateBudget({
            params: { householdId, budgetId: budget.id },
            body: { period: v.period, limitMinor: v.limitMinor, rollover: v.rollover },
          })
        : api.finance.createBudget({ params: { householdId }, body: v }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    let limitMinor: number;
    try {
      limitMinor = fmt.parseMoney(v.limit);
    } catch {
      setError('limit', { message: tu('invalidAmount') });
      return;
    }
    if (limitMinor <= 0) {
      setError('limit', { message: tu('invalidAmount') });
      return;
    }
    mutation.mutate({
      categoryId: v.categoryId,
      period: v.period,
      limitMinor,
      rollover: v.rollover,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{budget ? t('edit') : t('add')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('category')} error={formState.errors.categoryId?.message}>
            {(p) => (
              <CategorySelect
                {...p}
                kind="expense"
                emptyLabel=""
                disabled={Boolean(budget)}
                {...register('categoryId', { required: tu('required') })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('period')}>
              {(p) => (
                <NativeSelect {...p} {...register('period')}>
                  <option value="monthly">{t('periods.monthly')}</option>
                  <option value="yearly">{t('periods.yearly')}</option>
                </NativeSelect>
              )}
            </Field>
            <Field
              label={t('limit')}
              hint={tu('moneyHint')}
              error={formState.errors.limit?.message}
            >
              {(p) => (
                <MoneyInput
                  {...p}
                  currency={fmt.currency}
                  {...register('limit', { required: tu('required') })}
                />
              )}
            </Field>
          </div>
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="rollover"
              render={({ field }) => (
                <Checkbox
                  id="budget-rollover"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="budget-rollover" className="leading-snug font-normal">
              {t('rollover')}
            </Label>
          </div>
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
