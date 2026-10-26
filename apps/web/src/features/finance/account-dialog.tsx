'use client';

import { type Account, AccountType, Visibility } from '@fp/contracts';
import { type CurrencyCode, SUPPORTED_CURRENCIES } from '@fp/domain/money';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/color-picker';
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
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { randomPresetColor } from '@/lib/utils';
import { useInvalidateFinance } from './hooks';
import { MoneyInput } from './money-input';

interface FormValues {
  name: string;
  type: Account['type'];
  currency: CurrencyCode;
  institution: string;
  iban: string;
  openingBalance: string;
  color: string;
  visibility: Account['visibility'];
}

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set. */
  account?: Account | null;
}) {
  const t = useTranslations('finance.accounts');
  const tc = useTranslations('common');
  const tt = useTranslations('accountTypes');
  const tv = useTranslations('visibility');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, household } = useHousehold();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      name: account?.name ?? '',
      type: account?.type ?? 'checking',
      currency: account?.currency ?? household.currency,
      institution: account?.institution ?? '',
      iban: '',
      openingBalance: account ? fmt.moneyInput(account.openingBalanceMinor, account.currency) : '',
      color: account?.color ?? randomPresetColor(),
      visibility: account?.visibility ?? 'household',
    }),
    [account, household.currency, fmt],
  );

  const form = useForm<FormValues>({ defaultValues: defaults() });
  const { register, handleSubmit, control, reset, setError, formState } = form;

  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues & { openingBalanceMinor: number }) => {
      if (account) {
        return api.finance.updateAccount({
          params: { householdId, accountId: account.id },
          body: {
            name: v.name,
            type: v.type,
            institution: v.institution.trim() || null,
            openingBalanceMinor: v.openingBalanceMinor,
            color: v.color,
            visibility: v.visibility,
          },
        });
      }
      return api.finance.createAccount({
        params: { householdId },
        body: {
          name: v.name,
          type: v.type,
          currency: v.currency,
          institution: v.institution.trim() || null,
          iban: v.iban.replace(/\s+/g, '') || null,
          openingBalanceMinor: v.openingBalanceMinor,
          color: v.color,
          visibility: v.visibility,
        },
      });
    },
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
    let openingBalanceMinor = 0;
    if (v.openingBalance.trim()) {
      try {
        openingBalanceMinor = fmt.parseMoney(v.openingBalance, v.currency);
      } catch {
        setError('openingBalance', { message: tu('invalidAmount') });
        return;
      }
    }
    mutation.mutate({ ...v, openingBalanceMinor });
  });

  const currency = useWatch({ control, name: 'currency' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">
            {account ? t('edit') : t('add')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('name')} error={formState.errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                {...register('name', { required: tu('required'), maxLength: 80 })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('type')}>
              {(p) => (
                <NativeSelect {...p} {...register('type')}>
                  {AccountType.options.map((type) => (
                    <option key={type} value={type}>
                      {tt(type)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('currency')}>
              {(p) => (
                <NativeSelect {...p} disabled={Boolean(account)} {...register('currency')}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={`${t('institution')} (${tc('optional')})`}>
            {(p) => <Input {...p} {...register('institution', { maxLength: 80 })} />}
          </Field>
          {account ? null : (
            <Field
              label={`${t('iban')} (${tc('optional')})`}
              hint={t('ibanHint')}
              error={formState.errors.iban?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  autoComplete="off"
                  spellCheck={false}
                  {...register('iban', { maxLength: 42 })}
                />
              )}
            </Field>
          )}
          <Field
            label={t('openingBalance')}
            hint={tu('moneyHint')}
            error={formState.errors.openingBalance?.message}
          >
            {(p) => (
              <MoneyInput
                {...p}
                currency={currency}
                placeholder="0"
                {...register('openingBalance')}
              />
            )}
          </Field>
          <Field label={t('visibility')}>
            {(p) => (
              <NativeSelect {...p} {...register('visibility')}>
                {Visibility.options.map((v) => (
                  <option key={v} value={v}>
                    {tv(v)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('color')}</span>
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <ColorPicker value={field.value} onChange={field.onChange} label={t('color')} />
              )}
            />
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
