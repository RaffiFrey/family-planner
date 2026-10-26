import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function Layout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.pinboard') }} />
      <Stack.Screen
        name="poll-new"
        options={{ title: t('m.pinboard.newPoll'), ...modalPresentation }}
      />
    </Stack>
  );
}
