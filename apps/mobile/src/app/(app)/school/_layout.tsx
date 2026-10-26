import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function SchoolLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.school') }} />
      <Stack.Screen
        name="lesson"
        options={{ title: t('m.school.addLesson'), ...modalPresentation }}
      />
    </Stack>
  );
}
