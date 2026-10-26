import { parseAmountToMinor } from '@fp/domain/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DateField, ScreenScroll, Text, TextField } from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useAmountFormat } from '@/features/finance/hooks';
import { useMaintenance } from '@/features/home-assets/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

/** Logs a completed maintenance (date, optional cost and notes); the next due date follows. */
export default function CompleteMaintenanceScreen() {
  const { planId, assetId } = useLocalSearchParams<{ planId: string; assetId: string }>();
  const { t } = useTranslation();
  const { householdId, household } = useHousehold();
  const queryClient = useQueryClient();
  const format = useAmountFormat();
  const plans = useMaintenance({ assetId });
  const plan = plans.data?.find((p) => p.id === planId);
  const [doneOn, setDoneOn] = useState<Date | null>(new Date());
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const complete = useMutation({
    mutationFn: () => {
      let costMinor: number | null = null;
      if (cost.trim() !== '') {
        try {
          costMinor = parseAmountToMinor(cost, format.exponent, format.style);
        } catch {
          throw new FormError(t('m.finance.enterAmount'));
        }
        if (costMinor < 0) throw new FormError(t('m.finance.enterAmount'));
      }
      return api.home.maintenance.complete({
        params: { householdId, planId },
        body: {
          ...(doneOn ? { doneOn: dayKey(doneOn) } : {}),
          costMinor,
          notes: notes.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  return (
    <ScreenScroll>
      {plan ? <Text variant="heading">{plan.title}</Text> : null}
      <DateField label={t('m.homeAssets.doneOn')} value={doneOn} onChange={setDoneOn} />
      <TextField
        label={t('m.homeAssets.cost', { currency: household.currency })}
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        placeholder={format.style === 'de' ? '89,90' : '89.90'}
      />
      <TextField
        label={t('m.homeAssets.notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder={t('m.homeAssets.completeNotesPlaceholder')}
      />
      <Text variant="caption">{t('m.homeAssets.completeHint')}</Text>
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('m.homeAssets.saveCompletion')}
        loading={complete.isPending}
        onPress={() => {
          setError(null);
          complete.mutate();
        }}
      />
    </ScreenScroll>
  );
}
