import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  Button,
  ChipSelect,
  DateField,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useAsset, useTemplates } from '@/features/home-assets/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

const CUSTOM = 'custom';

/** New maintenance plan from a built-in template (HU, tyres, …) or with an own interval. */
export default function NewMaintenanceScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const asset = useAsset(assetId);
  const templates = useTemplates();
  const [choice, setChoice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [months, setMonths] = useState('12');
  const [firstDue, setFirstDue] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (selected: string) => {
      const due = firstDue ? { nextDueOn: dayKey(firstDue) } : {};
      if (selected !== CUSTOM) {
        return api.home.maintenance.create({
          params: { householdId },
          body: { assetId, templateKey: selected, ...due },
        });
      }
      if (!title.trim()) throw new FormError(t('m.homeAssets.titleRequired'));
      const m = Number(months);
      if (!Number.isInteger(m) || m < 1 || m > 240)
        throw new FormError(t('m.homeAssets.invalidMonths'));
      return api.home.maintenance.create({
        params: { householdId },
        body: { assetId, title: title.trim(), recurrence: { mode: 'interval', months: m }, ...due },
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

  if (asset.isPending || templates.isPending) return <LoadingView />;
  const kind = asset.data?.kind;
  const options = (templates.data ?? []).filter((tpl) => !kind || tpl.assetKinds.includes(kind));
  const selected = choice ?? options[0]?.key ?? CUSTOM;

  return (
    <ScreenScroll>
      {asset.data ? <Text variant="caption">{asset.data.name}</Text> : null}
      <ChipSelect
        label={t('m.homeAssets.template')}
        options={[
          ...options.map((tpl) => ({ value: tpl.key, label: tpl.title })),
          { value: CUSTOM, label: t('m.homeAssets.customPlan') },
        ]}
        value={selected}
        onChange={setChoice}
      />
      {selected === CUSTOM ? (
        <View className="gap-4">
          <TextField
            label={t('m.homeAssets.planTitle')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('m.homeAssets.planTitlePlaceholder')}
          />
          <TextField
            label={t('m.homeAssets.intervalMonths')}
            value={months}
            onChangeText={setMonths}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      ) : null}
      <DateField
        label={t('m.homeAssets.firstDue')}
        value={firstDue}
        onChange={setFirstDue}
        clearable
      />
      <Text variant="caption">{t('m.homeAssets.firstDueHint')}</Text>
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.create')}
        loading={create.isPending}
        onPress={() => {
          setError(null);
          create.mutate(selected);
        }}
      />
    </ScreenScroll>
  );
}
