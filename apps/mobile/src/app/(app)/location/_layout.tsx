import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LocationSharingProvider } from '@/features/location/sharing-context';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function LocationLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <LocationSharingProvider>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ title: t('nav.location') }} />
        <Stack.Screen
          name="share"
          options={{ title: t('m.location.shareTitle'), ...modalPresentation }}
        />
        <Stack.Screen
          name="place"
          options={{ title: t('m.location.place'), ...modalPresentation }}
        />
        <Stack.Screen name="history" options={{ title: t('m.location.history') }} />
      </Stack>
    </LocationSharingProvider>
  );
}
