import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function ContactsLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.contacts') }} />
      <Stack.Screen name="[contactId]" options={{ title: '' }} />
      <Stack.Screen
        name="edit"
        options={{ title: t('m.contacts.newTitle'), ...modalPresentation }}
      />
      <Stack.Screen
        name="emergency/[memberId]"
        options={{ title: t('m.contacts.emergencyCard') }}
      />
      <Stack.Screen
        name="emergency-edit"
        options={{ title: t('m.contacts.editEmergencyCard'), ...modalPresentation }}
      />
    </Stack>
  );
}
