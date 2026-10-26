'use client';

import type { Transaction } from '@fp/contracts';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { CategorySelect } from './category-select';
import { accountById, todayLocalDate, useAccounts, useInvalidateFinance } from './hooks';
import { MoneyInput } from './money-input';

type Kind = 'expense' | 'income' | 'transfer';

interface SplitValues {
  categoryId: string;
  amount: string;
  memberId: string;
  note: string;
}

interface FormValues {
  accountId: string;
  bookingDate: string;
  kind: Kind;
  amount: string;
  counterpartyName: string;
  purpose: string;
  categoryId: string;
  tags: string;
  notes: string;
  transferAccountId: string;
  splits: SplitValues[];
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  defaultAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultAccountId?: string;
}) {
  const t = useTranslations('finance.transactions');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, members } = useHousehold();
  const accounts = useAccounts();
  const invalidate = useInvalidateFinance();
  const toastError = useToastError();
  const editing = Boolean(transaction);
  const accountList = React.useMemo(() => accounts.data ?? [], [accounts.data]);

  const defaults = React.useCallback((): FormValues => {
    if (transaction) {
      const kind: Kind = transaction.transferAccountId
        ? 'transfer'
        : transaction.amountMinor >= 0
          ? 'income'
          : 'expense';
      return {
        accountId: transaction.accountId,
        bookingDate: transaction.bookingDate,
        kind,
        amount: fmt.moneyInput(Math.abs(transaction.amountMinor), transaction.currency),
        counterpartyName: transaction.counterpartyName ?? '',
        purpose: transaction.purpose,
        categoryId: transaction.categoryId ?? '',
        tags: transaction.tags.join(', '),
        notes: transaction.notes ?? '',
        transferAccountId: transaction.transferAccountId ?? '',
        splits: transaction.splits.map((s) => ({
          categoryId: s.categoryId ?? '',
          amount: fmt.moneyInput(Math.abs(s.amountMinor), transaction.currency),
          memberId: s.memberId ?? '',
          note: s.note ?? '',
        })),
      };
    }
    return {
      accountId: defaultAccountId ?? '',
      bookingDate: todayLocalDate(),
      kind: 'expense',
      amount: '',
      counterpartyName: '',
      purpose: '',
      categoryId: '',
      tags: '',
      notes: '',
      transferAccountId: '',
      splits: [],
    };
  }, [transaction, defaultAccountId, fmt]);

  const { register, handleSubmit, control, reset, setError, setValue, formState } =
    useForm<FormValues>({
      defaultValues: defaults(),
    });
  const splits = useFieldArray({ control, name: 'splits' });

  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  // Preselect the first account once accounts are loaded.
  const accountId = useWatch({ control, name: 'accountId' });
  React.useEffect(() => {
    if (open && !accountId && accountList[0]) setValue('accountId', accountList[0].id);
  }, [open, accountId, accountList, setValue]);

  const kind = useWatch({ control, name: 'kind' });
  const account = accountById(accountList, accountId);
  const currency = account?.currency ?? transaction?.currency ?? fmt.currency;

  const parse = (input: string): number | null => {
    try {
      return fmt.parseMoney(input, currency);
    } catch {
      return null;
    }
  };

  const amountMinorAbs = parse(useWatch({ control, name: 'amount' }));
  const splitValues = useWatch({ control, name: 'splits' });
  const splitSum = splitValues.reduce((sum, s) => sum + Math.abs(parse(s.amount) ?? 0), 0);
  const remaining = amountMinorAbs === null ? null : amountMinorAbs - splitSum;

  const mutation = useMutation({
    mutationFn: async (body: {
      amountMinor: number;
      splits: {
        categoryId: string | null;
        amountMinor: number;
        memberId: string | null;
        note: string | null;
      }[];
      v: FormValues;
    }) => {
      const { v } = body;
      const tags = v.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const common = {
        bookingDate: v.bookingDate,
        amountMinor: body.amountMinor,
        counterpartyName: v.counterpartyName.trim() || null,
        purpose: v.purpose,
        categoryId: v.categoryId || null,
        tags,
        notes: v.notes.trim() || null,
        splits: body.splits,
      };
      if (transaction) {
        return api.finance.updateTransaction({
          params: { householdId, transactionId: transaction.id },
          body: common,
        });
      }
      return api.finance.createTransaction({
        params: { householdId },
        body: {
          ...common,
          accountId: v.accountId,
          transferAccountId: v.kind === 'transfer' ? v.transferAccountId || null : null,
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
    const abs = parse(v.amount);
    if (abs === null || abs === 0) {
      setError('amount', { message: tu('invalidAmount') });
      return;
    }
    const sign = v.kind === 'income' ? 1 : -1;
    const parsedSplits: {
      categoryId: string | null;
      amountMinor: number;
      memberId: string | null;
      note: string | null;
    }[] = [];
    for (const [i, s] of v.splits.entries()) {
      const a = parse(s.amount);
      if (a === null) {
        setError(`splits.${i}.amount`, { message: tu('invalidAmount') });
        return;
      }
      parsedSplits.push({
        categoryId: s.categoryId || null,
        amountMinor: sign * Math.abs(a),
        memberId: s.memberId || null,
        note: s.note.trim() || null,
      });
    }
    if (parsedSplits.length > 0) {
      const sum = parsedSplits.reduce((acc, s) => acc + Math.abs(s.amountMinor), 0);
      if (sum !== Math.abs(abs)) {
        setError('splits', { message: t('splitMismatch') });
        return;
      }
    }
    if (v.kind === 'transfer' && !editing && !v.transferAccountId) {
      setError('transferAccountId', { message: tu('required') });
      return;
    }
    mutation.mutate({ amountMinor: sign * Math.abs(abs), splits: parsedSplits, v });
  });

  const kinds: Kind[] = ['expense', 'income', 'transfer'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? t('edit') : t('add')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t('kind')}</legend>
            <div className="inline-flex w-fit rounded-md border border-border p-1">
              {kinds.map((k) => {
                // Transfers cannot be converted after creation (the counter-booking is server-managed).
                const locked = editing && (k === 'transfer') !== (kind === 'transfer');
                return (
                  <label
                    key={k}
                    className={cn(
                      'cursor-pointer rounded-sm px-3 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                      kind === k
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-foreground',
                      locked && 'pointer-events-none opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      value={k}
                      className="sr-only"
                      disabled={locked}
                      {...register('kind')}
                    />
                    {t(k)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('account')} error={formState.errors.accountId?.message}>
              {(p) => (
                <NativeSelect
                  {...p}
                  disabled={editing}
                  {...register('accountId', { required: tu('required') })}
                >
                  {accountList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            {kind === 'transfer' ? (
              <Field
                label={t('transferTo')}
                hint={t('transferHint')}
                error={formState.errors.transferAccountId?.message}
              >
                {(p) => (
                  <NativeSelect {...p} disabled={editing} {...register('transferAccountId')}>
                    <option value="">{tc('none')}</option>
                    {accountList
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </NativeSelect>
                )}
              </Field>
            ) : (
              <Field label={t('category')}>
                {(p) => (
                  <CategorySelect
                    {...p}
                    kind={kind}
                    includeId={transaction?.categoryId}
                    emptyLabel={t('uncategorized')}
                    {...register('categoryId')}
                  />
                )}
              </Field>
            )}
            <Field label={t('date')} error={formState.errors.bookingDate?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  {...register('bookingDate', { required: tu('required') })}
                />
              )}
            </Field>
            <Field
              label={t('amount')}
              hint={tu('moneyHint')}
              error={formState.errors.amount?.message}
            >
              {(p) => (
                <MoneyInput
                  {...p}
                  currency={currency}
                  {...register('amount', { required: tu('required') })}
                />
              )}
            </Field>
          </div>

          <Field label={`${t('counterparty')} (${tc('optional')})`}>
            {(p) => <Input {...p} {...register('counterpartyName', { maxLength: 200 })} />}
          </Field>
          <Field label={`${t('purpose')} (${tc('optional')})`}>
            {(p) => <Input {...p} {...register('purpose', { maxLength: 500 })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('tags')} (${tc('optional')})`} hint={t('tagsHint')}>
              {(p) => <Input {...p} {...register('tags')} />}
            </Field>
            <Field label={`${t('notes')} (${tc('optional')})`}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={1}
                  className="min-h-10"
                  {...register('notes', { maxLength: 2000 })}
                />
              )}
            </Field>
          </div>

          {kind !== 'transfer' ? (
            <fieldset className="grid gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t('splits')}</legend>
              {splits.fields.map((f, i) => (
                <div
                  key={f.id}
                  className="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[1fr_8rem_8rem_auto]"
                >
                  <CategorySelect
                    aria-label={`${t('category')} ${i + 1}`}
                    kind={kind}
                    emptyLabel={t('uncategorized')}
                    {...register(`splits.${i}.categoryId`)}
                  />
                  <MoneyInput
                    aria-label={`${t('splitAmount')} ${i + 1}`}
                    aria-invalid={Boolean(formState.errors.splits?.[i]?.amount)}
                    currency={currency}
                    {...register(`splits.${i}.amount`, { required: true })}
                  />
                  <NativeSelect
                    aria-label={`${t('splitMember')} ${i + 1}`}
                    {...register(`splits.${i}.memberId`)}
                  >
                    <option value="">{t('noMember')}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('removeSplit')} ${i + 1}`}
                    onClick={() => splits.remove(i)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                  <Input
                    aria-label={`${t('splitNote')} ${i + 1}`}
                    placeholder={t('splitNote')}
                    className="sm:col-span-4"
                    {...register(`splits.${i}.note`, { maxLength: 200 })}
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={splits.fields.length >= 20}
                  onClick={() =>
                    splits.append({
                      categoryId: '',
                      amount:
                        remaining !== null && remaining > 0
                          ? fmt.moneyInput(remaining, currency)
                          : '',
                      memberId: '',
                      note: '',
                    })
                  }
                >
                  <Plus aria-hidden />
                  {t('addSplit')}
                </Button>
                {splits.fields.length > 0 && remaining !== null ? (
                  <span
                    className={cn(
                      'text-sm tabular-nums',
                      remaining !== 0 ? 'text-danger' : 'text-muted',
                    )}
                    aria-live="polite"
                  >
                    {t('splitRemaining', { amount: fmt.money(remaining, currency) })}
                  </span>
                ) : null}
              </div>
              {formState.errors.splits?.message ? (
                <p role="alert" className="text-xs text-danger">
                  {formState.errors.splits.message}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={accountList.length === 0}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
