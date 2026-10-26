import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, DateField, ScreenScroll, TextField } from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useFinancePlusMutation } from '@/features/finance-plus/hooks';
import { MoneyField, useParseMoney } from '@/features/finance-plus/money-field';
import { api } from '@/lib/api';

const TYPES = ['subscription', 'insurance', 'utility', 'loan', 'other'] as const;
const INTERVALS = ['weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'] as const;

/** Quick form for a contract or subscription (details can be edited on the web). */
export default function NewContractScreen() {
  const { t } = useTranslation();
  const parse = useParseMoney();
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('subscription');
  const [interval, setPeriod] = useState<(typeof INTERVALS)[number]>('monthly');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const [termEnd, setTermEnd] = useState<Date | null>(null);
  const [errors, setErrors] = useState<{ name?: string; amount?: string; notice?: string }>({});

  const create = useFinancePlusMutation(
    (householdId, body: Parameters<typeof api.financePlus.createContract>[0]['body']) =>
      api.financePlus.createContract({ params: { householdId }, body }),
    () => {
      router.back();
    },
  );

  const submit = () => {
    const amountMinor = parse(amount);
    const noticeDays = notice.trim() === '' ? null : Number(notice);
    const next: typeof errors = {};
    if (name.trim() === '') next.name = t('m.financePlus.nameRequired');
    if (amountMinor === null) next.amount = t('m.finance.enterAmount');
    if (noticeDays !== null && (!Number.isInteger(noticeDays) || noticeDays < 0))
      next.notice = t('m.financePlus.invalidDays');
    setErrors(next);
    if (Object.keys(next).length > 0 || amountMinor === null) return;
    create.mutate({
      name: name.trim(),
      contractType: type,
      direction: 'out',
      amountMinor,
      interval,
      noticePeriodDays: noticeDays,
      nextDueDate: nextDue ? dayKey(nextDue) : null,
      minimumTermEnd: termEnd ? dayKey(termEnd) : null,
    });
  };

  return (
    <ScreenScroll>
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('m.financePlus.contractNamePlaceholder')}
        error={errors.name}
        autoFocus
      />
      <ChipSelect
        label={t('m.financePlus.type')}
        value={type}
        onChange={setType}
        options={TYPES.map((v) => ({ value: v, label: t(`m.financePlus.types.${v}`) }))}
      />
      <MoneyField
        label={t('m.finance.amount')}
        value={amount}
        onChangeText={setAmount}
        error={errors.amount}
      />
      <ChipSelect
        label={t('m.financePlus.interval')}
        value={interval}
        onChange={setPeriod}
        options={INTERVALS.map((v) => ({ value: v, label: t(`m.financePlus.intervals.${v}`) }))}
      />
      <DateField
        label={t('m.financePlus.nextDue')}
        value={nextDue}
        onChange={setNextDue}
        clearable
      />
      <DateField
        label={t('m.financePlus.minimumTermEnd')}
        value={termEnd}
        onChange={setTermEnd}
        clearable
      />
      <TextField
        label={t('m.financePlus.noticeDays')}
        value={notice}
        onChangeText={setNotice}
        keyboardType="number-pad"
        inputMode="numeric"
        error={errors.notice}
      />
      <Button title={t('common.save')} loading={create.isPending} onPress={submit} />
    </ScreenScroll>
  );
}
