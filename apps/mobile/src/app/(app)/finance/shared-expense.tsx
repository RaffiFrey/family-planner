import type { Output } from '@fp/api-client';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipMultiSelect,
  ChipSelect,
  DateField,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { useAmountFormat, useMoney } from '@/features/finance/hooks';
import {
  useFinancePlusMutation,
  useParties,
  useSharedExpenses,
} from '@/features/finance-plus/hooks';
import { MoneyField, useParseMoney } from '@/features/finance-plus/money-field';
import { minorToMoneyText } from '@/features/finance-plus/money-text';
import { buildSplit, type SplitMethod } from '@/features/finance-plus/split';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';

type SharedExpense = Output<'financePlus', 'listSharedExpenses'>['items'][number];

const METHODS: readonly SplitMethod[] = ['equal', 'exact', 'percent', 'shares'];

/** Add (or edit with `?expenseId=`) a shared expense with any split method. */
export default function SharedExpenseScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const { t } = useTranslation();
  const parties = useParties();
  const expenses = useSharedExpenses();
  if (parties.isPending || (expenseId && expenses.isPending)) return <LoadingView />;
  if (parties.error && !parties.data)
    return <ErrorState error={parties.error} onRetry={() => void parties.refetch()} />;
  const expense = expenseId ? expenses.data?.items.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !expense) return <ErrorState error={expenses.error ?? new Error('not found')} />;
  return (
    <>
      {expense ? <Stack.Screen options={{ title: t('m.financePlus.editExpense') }} /> : null}
      <ExpenseForm expense={expense} />
    </>
  );
}

function ExpenseForm({ expense }: { expense: SharedExpense | undefined }) {
  const { t } = useTranslation();
  const { me, household } = useHousehold();
  const fmt = useMoney();
  const parse = useParseMoney();
  const format = useAmountFormat();
  const parties = useParties();
  const all = parties.data ?? [];
  const inExpense = new Set(
    expense ? [expense.paidByPartyId, ...expense.shares.map((s) => s.partyId)] : [],
  );
  const active = all.filter((p) => !p.archived || inExpense.has(p.id));

  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(
    expense ? minorToMoneyText(expense.amountMinor, format.exponent, format.style) : '',
  );
  const [date, setDate] = useState<Date | null>(expense ? parseDayKey(expense.date) : new Date());
  const [paidBy, setPaidBy] = useState<string | null>(expense?.paidByPartyId ?? null);
  const [between, setBetween] = useState<string[] | null>(
    expense ? expense.shares.map((s) => s.partyId) : null,
  );
  const [method, setMethod] = useState<SplitMethod>(expense?.splitMethod ?? 'equal');
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (expense?.shares ?? []).map((s) => [
        s.partyId,
        s.value === null
          ? ''
          : expense?.splitMethod === 'exact'
            ? minorToMoneyText(s.value, format.exponent, format.style)
            : String(s.value).replace('.', format.style === 'de' ? ',' : '.'),
      ]),
    ),
  );
  const [errors, setErrors] = useState<{ title?: string; amount?: string; parties?: string }>({});

  const remove = useFinancePlusMutation(
    (householdId, expenseId: string) =>
      api.financePlus.deleteSharedExpense({ params: { householdId, expenseId } }),
    () => {
      router.back();
    },
  );
  const save = useFinancePlusMutation(
    (householdId, body: Parameters<typeof api.financePlus.createSharedExpense>[0]['body']) =>
      expense
        ? api.financePlus.updateSharedExpense({
            params: { householdId, expenseId: expense.id },
            body,
          })
        : api.financePlus.createSharedExpense({ params: { householdId }, body }),
    () => {
      router.back();
    },
  );

  // Defaults until the user picks: I paid, split between everybody.
  const payer = paidBy ?? active.find((p) => p.memberId === me.id)?.id ?? active[0]?.id ?? null;
  const selected = between ?? active.filter((p) => !p.archived).map((p) => p.id);
  const amountMinor = parse(amount);
  const split = buildSplit(method, amountMinor, selected, inputs, {
    ...format,
    currency: household.currency,
  });
  const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? '?';

  const submit = () => {
    const next: typeof errors = {};
    if (title.trim() === '') next.title = t('m.financePlus.titleRequired');
    if (amountMinor === null) next.amount = t('m.finance.enterAmount');
    if (!payer || selected.length === 0) next.parties = t('m.financePlus.choosePeople');
    setErrors(next);
    if (Object.keys(next).length > 0 || amountMinor === null || !payer || !split.amounts) return;
    save.mutate({
      title: title.trim(),
      amountMinor,
      date: dayKey(date ?? new Date()),
      paidByPartyId: payer,
      splitMethod: method,
      shares: split.shares,
    });
  };

  const valueLabel =
    method === 'exact'
      ? t('m.finance.amount')
      : method === 'percent'
        ? t('m.financePlus.percent')
        : t('m.financePlus.shareCount');

  return (
    <ScreenScroll>
      <TextField
        label={t('m.financePlus.expenseTitle')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('m.financePlus.expenseTitlePlaceholder')}
        error={errors.title}
        autoFocus={!expense}
      />
      <MoneyField
        label={t('m.finance.amount')}
        value={amount}
        onChangeText={setAmount}
        error={errors.amount}
      />
      <ChipSelect
        label={t('m.financePlus.paidByLabel')}
        value={payer}
        onChange={setPaidBy}
        options={active.map((p) => ({ value: p.id, label: p.name }))}
      />
      <ChipMultiSelect
        label={t('m.financePlus.splitBetween')}
        value={selected}
        onChange={setBetween}
        options={active.map((p) => ({ value: p.id, label: p.name }))}
      />
      {errors.parties ? (
        <Text variant="caption" className="text-danger">
          {errors.parties}
        </Text>
      ) : null}
      <Segmented
        label={t('m.financePlus.splitMethod')}
        value={method}
        onChange={setMethod}
        options={METHODS.map((m) => ({ value: m, label: t(`m.financePlus.methods.${m}`) }))}
      />
      {method !== 'equal'
        ? selected.map((id) => (
            <TextField
              key={id}
              label={`${nameOf(id)} – ${valueLabel}`}
              value={inputs[id] ?? ''}
              onChangeText={(v) => {
                setInputs((s) => ({ ...s, [id]: v }));
              }}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={method === 'shares' ? '1' : method === 'percent' ? '50' : '0,00'}
            />
          ))
        : null}
      <View accessibilityLiveRegion="polite" className="gap-0.5">
        {split.amounts && amountMinor !== null ? (
          selected.map((id, i) => (
            <Text key={id} variant="caption">
              {t('m.financePlus.sharePreview', {
                name: nameOf(id),
                amount: fmt(split.amounts?.[i] ?? 0),
              })}
            </Text>
          ))
        ) : split.error ? (
          <Text variant="caption" className="text-danger" testID="split-error">
            {t(`m.financePlus.splitErrors.${split.error}`)}
          </Text>
        ) : null}
      </View>
      <DateField label={t('m.finance.date')} value={date} onChange={setDate} />
      <Button
        title={t('common.save')}
        loading={save.isPending}
        disabled={!split.amounts && amountMinor !== null}
        onPress={submit}
      />
      {expense ? (
        <Button
          title={t('m.financePlus.deleteExpense', { title: expense.title })}
          variant="ghost"
          loading={remove.isPending}
          onPress={() => {
            void confirmAsync(
              t('m.financePlus.deleteExpense', { title: expense.title }),
              undefined,
              {
                confirmLabel: t('common.delete'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              },
            ).then((ok) => {
              if (ok) remove.mutate(expense.id);
            });
          }}
        />
      ) : null}
    </ScreenScroll>
  );
}
