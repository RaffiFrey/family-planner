import type { HomeAsset } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChipSelect,
  DateField,
  ErrorState,
  LoadingView,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { dayKey, parseDayKey } from '@/features/calendar/dates';
import { ASSET_KINDS, type AssetKind, DETAIL_FIELDS, useAsset } from '@/features/home-assets/hooks';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { errorMessage, FormError } from '@/lib/errors';

export default function AssetEditScreen() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  const existing = useAsset(assetId ?? '');
  if (assetId && existing.isPending) return <LoadingView />;
  if (assetId && existing.error && !existing.data)
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  return <AssetForm key={assetId ?? 'new'} asset={assetId ? existing.data : undefined} />;
}

function AssetForm({ asset }: { asset: HomeAsset | undefined }) {
  const { t } = useTranslation();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'vehicle');
  const [name, setName] = useState(asset?.name ?? '');
  const [details, setDetails] = useState<Record<string, string>>(asset?.details ?? {});
  const [purchaseDate, setPurchaseDate] = useState<Date | null>(
    asset?.purchaseDate ? parseDayKey(asset.purchaseDate) : null,
  );
  const [warrantyUntil, setWarrantyUntil] = useState<Date | null>(
    asset?.warrantyUntil ? parseDayKey(asset.warrantyUntil) : null,
  );
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new FormError(t('m.homeAssets.nameRequired'));
      const cleanDetails = Object.fromEntries(
        Object.entries(details)
          .map(([k, v]) => [k, v.trim()] as const)
          .filter(([, v]) => v !== ''),
      );
      const body = {
        kind,
        name: name.trim(),
        details: cleanDetails,
        purchaseDate: purchaseDate ? dayKey(purchaseDate) : null,
        warrantyUntil: warrantyUntil ? dayKey(warrantyUntil) : null,
        notes: notes.trim() || null,
      };
      return asset
        ? api.home.assets.update({ params: { householdId, assetId: asset.id }, body })
        : api.home.assets.create({ params: { householdId }, body });
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
      <Stack.Screen
        options={{ title: asset ? t('m.homeAssets.editAsset') : t('m.homeAssets.addAsset') }}
      />
      <ChipSelect
        label={t('m.homeAssets.kind')}
        options={ASSET_KINDS.map((k) => ({ value: k, label: t(`m.homeAssets.kinds.${k}`) }))}
        value={kind}
        onChange={setKind}
      />
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('m.homeAssets.namePlaceholder')}
        autoFocus={!asset}
      />
      {DETAIL_FIELDS[kind].map((field) => (
        <TextField
          key={field}
          label={t(`m.homeAssets.fields.${field}`)}
          value={details[field] ?? ''}
          autoCapitalize={field === 'plate' || field === 'vin' ? 'characters' : 'sentences'}
          onChangeText={(v) => {
            setDetails({ ...details, [field]: v });
          }}
        />
      ))}
      <DateField
        label={t('m.homeAssets.purchaseDate')}
        value={purchaseDate}
        onChange={setPurchaseDate}
        clearable
      />
      <DateField
        label={t('m.homeAssets.warrantyDate')}
        value={warrantyUntil}
        onChange={setWarrantyUntil}
        clearable
      />
      <TextField label={t('m.homeAssets.notes')} value={notes} onChangeText={setNotes} multiline />
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
