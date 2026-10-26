import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ChipSelect, DateField, ScreenScroll, Text, TextField } from '@/components/ui';
import { useAsset, useReadings } from '@/features/home-assets/hooks';
import {
  DEFAULT_UNITS,
  type MeterType,
  meterTypesFor,
  normalizeMeterValue,
} from '@/features/home-assets/meters';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

/** Quick meter reading entry (electricity, water, mileage …). */
export default function MeterReadingScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const asset = useAsset(assetId);
  const readings = useReadings(assetId);
  const types = meterTypesFor(asset.data?.kind ?? 'other');
  const [picked, setPicked] = useState<MeterType | null>(null);
  const meterType = picked ?? types[0] ?? 'other';
  const [unit, setUnit] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [readAt, setReadAt] = useState<Date | null>(new Date());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const last = (readings.data ?? [])
    .filter((r) => r.meterType === meterType)
    .sort((a, b) => b.readAt.localeCompare(a.readAt))[0];
  const effectiveUnit = unit ?? last?.unit ?? DEFAULT_UNITS[meterType];

  const save = useMutation({
    mutationFn: () => {
      const normalized = normalizeMeterValue(value);
      if (!normalized) throw new FormError(t('m.homeAssets.invalidReading'));
      if (!effectiveUnit.trim()) throw new FormError(t('m.homeAssets.unitRequired'));
      return api.home.meters.create({
        params: { householdId, assetId },
        body: {
          meterType,
          value: normalized,
          unit: effectiveUnit.trim(),
          ...(readAt ? { readAt: readAt.toISOString() } : {}),
          note: note.trim() || null,
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
      {asset.data ? <Text variant="caption">{asset.data.name}</Text> : null}
      <ChipSelect
        label={t('m.homeAssets.meterType')}
        options={types.map((m) => ({ value: m, label: t(`m.homeAssets.meterTypes.${m}`) }))}
        value={meterType}
        onChange={(m) => {
          setPicked(m);
          setUnit(null);
        }}
      />
      <View className="flex-row gap-2">
        <TextField
          className="flex-1"
          label={t('m.homeAssets.reading')}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          autoFocus
          placeholder={last ? last.value : '0'}
        />
        <TextField
          className="w-24"
          label={t('m.homeAssets.unit')}
          value={effectiveUnit}
          onChangeText={setUnit}
          autoCapitalize="none"
        />
      </View>
      {last ? (
        <Text variant="caption">
          {t('m.homeAssets.lastReading', { value: last.value, unit: last.unit })}
        </Text>
      ) : null}
      <DateField
        label={t('m.homeAssets.readAt')}
        value={readAt}
        onChange={setReadAt}
        mode="datetime"
      />
      <TextField label={t('m.homeAssets.note')} value={note} onChangeText={setNote} />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        loading={save.isPending}
        onPress={() => {
          setError(null);
          save.mutate();
        }}
      />
    </ScreenScroll>
  );
}
