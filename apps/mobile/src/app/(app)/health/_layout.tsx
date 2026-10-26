import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function HealthLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.health') }} />
      <Stack.Screen
        name="medication"
        options={{ title: t('m.health.addMedication'), ...modalPresentation }}
      />
      <Stack.Screen
        name="vaccination"
        options={{ title: t('m.health.addVaccination'), ...modalPresentation }}
      />
      <Stack.Screen name="schedule" options={{ title: t('m.health.schedule') }} />
    </Stack>
  );
}
