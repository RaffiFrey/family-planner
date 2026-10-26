import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function TravelLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.travel') }} />
      <Stack.Screen name="[tripId]" options={{ title: '' }} />
      <Stack.Screen name="new" options={{ title: t('m.travel.newTrip'), ...modalPresentation }} />
      <Stack.Screen
        name="item-new"
        options={{ title: t('m.travel.newItem'), ...modalPresentation }}
      />
    </Stack>
  );
}
