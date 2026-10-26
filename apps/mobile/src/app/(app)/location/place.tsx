import type { GeoPlace } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Locate, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ChipSelect, LoadingView, ScreenScroll, Text, TextField } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { currentPosition, usePlaces } from '@/features/location/hooks';
import { PlaceSubscriptions } from '@/features/location/place-subscriptions';
import { parseCoordinate } from '@/features/location/share';
import { api } from '@/lib/api';
import { confirmAsync, notify, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

const RADII = ['50', '100', '200', '500', '1000'] as const;

function formatCoord(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/** Create or edit a place (geofence): name, position (address search or current position), radius. */
export default function PlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const places = usePlaces();
  if (placeId && places.isPending) return <LoadingView />;
  const place = placeId ? places.data?.find((p) => p.id === placeId) : undefined;
  return <PlaceForm key={place?.id ?? 'new'} place={place} />;
}

function PlaceForm({ place }: { place: GeoPlace | undefined }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const writable = can('location.write');
  const queryClient = useQueryClient();
  const [name, setName] = useState(place?.name ?? '');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(place ? formatCoord(place.lat) : '');
  const [lng, setLng] = useState(place ? formatCoord(place.lng) : '');
  const [radius, setRadius] = useState<string>(String(place?.radiusM ?? 100));
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const latValue = parseCoordinate(lat, 'lat');
  const lngValue = parseCoordinate(lng, 'lng');
  const nameError = submitted && name.trim() === '' ? t('m.location.nameRequired') : undefined;
  const coordError =
    submitted && (latValue === null || lngValue === null)
      ? t('m.location.coordsRequired')
      : undefined;

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['location'] });
    router.back();
  };

  const save = useMutation({
    mutationFn: (body: { name: string; lat: number; lng: number; radiusM: number }) =>
      place
        ? api.location.places.update({ params: { householdId, placeId: place.id }, body })
        : api.location.places.create({ params: { householdId }, body }),
    onSuccess: done,
    onError: (e) => {
      showError(e, t);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api.location.places.remove({ params: { householdId, placeId: id } }),
    onSuccess: done,
    onError: (e) => {
      showError(e, t);
    },
  });

  const locateMe = async () => {
    setLocating(true);
    try {
      const pos = await currentPosition();
      if (!pos) {
        notify(t('m.location.positionUnavailable'));
        return;
      }
      setLat(formatCoord(pos.lat));
      setLng(formatCoord(pos.lng));
    } finally {
      setLocating(false);
    }
  };

  const searchAddress = async () => {
    if (address.trim() === '') return;
    setLocating(true);
    try {
      const results = await Location.geocodeAsync(address.trim());
      const first = results[0];
      if (!first) {
        notify(t('m.location.addressNotFound'));
        return;
      }
      setLat(formatCoord(first.latitude));
      setLng(formatCoord(first.longitude));
      if (name.trim() === '') setName(address.trim());
    } catch {
      notify(t('m.location.addressUnavailable'));
    } finally {
      setLocating(false);
    }
  };

  const submit = () => {
    setSubmitted(true);
    if (name.trim() === '' || latValue === null || lngValue === null) return;
    save.mutate({ name: name.trim(), lat: latValue, lng: lngValue, radiusM: Number(radius) });
  };

  const confirmDelete = async () => {
    if (!place) return;
    const ok = await confirmAsync(t('m.location.deletePlace'), place.name, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(place.id);
  };

  return (
    <ScreenScroll>
      <TextField
        label={t('common.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('m.location.namePlaceholder')}
        error={nameError}
        maxLength={100}
      />
      <View className="gap-2">
        <TextField
          label={t('m.location.address')}
          value={address}
          onChangeText={setAddress}
          placeholder={t('m.location.addressPlaceholder')}
          returnKeyType="search"
          onSubmitEditing={() => void searchAddress()}
        />
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            title={t('m.location.searchAddress')}
            icon={<Search size={16} color={colors.text} />}
            disabled={address.trim() === '' || locating}
            onPress={() => void searchAddress()}
          />
          <Button
            className="flex-1"
            size="sm"
            variant="secondary"
            title={t('m.location.useMyPosition')}
            icon={<Locate size={16} color={colors.text} />}
            loading={locating}
            onPress={() => void locateMe()}
          />
        </View>
      </View>
      <View className="flex-row gap-2">
        <TextField
          className="flex-1"
          label={t('m.location.latitude')}
          value={lat}
          onChangeText={setLat}
          keyboardType="numbers-and-punctuation"
          placeholder="52.520008"
        />
        <TextField
          className="flex-1"
          label={t('m.location.longitude')}
          value={lng}
          onChangeText={setLng}
          keyboardType="numbers-and-punctuation"
          placeholder="13.404954"
        />
      </View>
      {coordError ? (
        <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
          {coordError}
        </Text>
      ) : null}
      <ChipSelect
        label={t('m.location.radiusLabel')}
        options={RADII.map((r) => ({ value: r, label: `${r} m` }))}
        value={RADII.includes(radius as (typeof RADII)[number]) ? radius : null}
        onChange={setRadius}
      />
      <Text variant="caption">{t('m.location.radiusHint')}</Text>
      {writable ? (
        <Button title={t('common.save')} loading={save.isPending} onPress={submit} />
      ) : null}
      {place ? <PlaceSubscriptions placeId={place.id} /> : null}
      {place && writable ? (
        <Button
          title={t('m.location.deletePlace')}
          variant="ghost"
          loading={remove.isPending}
          onPress={() => void confirmDelete()}
        />
      ) : null}
    </ScreenScroll>
  );
}
