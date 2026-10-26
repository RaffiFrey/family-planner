import { parseAmountToMinor } from '@fp/domain/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, ScreenScroll, Text, TextField } from '@/components/ui';
import { useAmountFormat } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

const TYPES = ['checking', 'savings', 'cash', 'credit_card', 'depot', 'loan', 'other'] as const;
type AccountType = (typeof TYPES)[number];

export default function NewAccountScreen() {
  const { t } = useTranslation();
  const { householdId, household } = useHousehold();
  const queryClient = useQueryClient();
  const format = useAmountFormat();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [institution, setInstitution] = useState('');
  const [opening, setOpening] = useState('');
  const [visibility, setVisibility] = useState<'household' | 'private'>('household');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      let openingBalanceMinor = 0;
      if (opening.trim() !== '') {
        try {
          openingBalanceMinor = parseAmountToMinor(opening, format.exponent, format.style);
        } catch {
          throw new FormError(t('m.finance.enterAmount'));
        }
      }
      return api.finance.createAccount({
        params: { householdId },
        body: {
          name: name.trim(),
          type,
          currency: household.currency,
          institution: institution.trim() || null,
          openingBalanceMinor,
          visibility,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      <TextField label={t('common.name')} value={name} onChangeText={setName} autoFocus />
      <ChipSelect
        label={t('m.finance.accountType')}
        options={TYPES.map((v) => ({ value: v, label: t(`accountTypes.${v}`) }))}
        value={type}
        onChange={setType}
      />
      <TextField
        label={t('m.finance.institution')}
        value={institution}
        onChangeText={setInstitution}
      />
      <TextField
        label={t('m.finance.openingBalance')}
        value={opening}
        onChangeText={setOpening}
        keyboardType="numbers-and-punctuation"
        placeholder={format.style === 'de' ? '1.234,56' : '1,234.56'}
      />
      <ChipSelect
        label={t('m.common.visibility')}
        options={(['household', 'private'] as const).map((v) => ({
          value: v,
          label: t(`visibility.${v}`),
        }))}
        value={visibility}
        onChange={setVisibility}
      />
      {error ? <Text className="text-danger">{error}</Text> : null}
      <Button
        title={t('common.create')}
        disabled={name.trim() === ''}
        loading={create.isPending}
        onPress={() => {
          setError(null);
          create.mutate();
        }}
      />
    </ScreenScroll>
  );
}
