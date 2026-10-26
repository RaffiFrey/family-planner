import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions } from '@/lib/stack-options';

export default function IntegrationsLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="calendar-sync" options={{ title: t('m.integrations.calendarSync') }} />
      <Stack.Screen name="support" options={{ title: t('m.integrations.supportAccess') }} />
    </Stack>
  );
}
