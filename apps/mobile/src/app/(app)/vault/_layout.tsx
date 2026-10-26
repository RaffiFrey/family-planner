import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BiometricGate } from '@/features/settings/biometric-gate';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function VaultLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <BiometricGate>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ title: t('nav.vault') }} />
        <Stack.Screen name="[documentId]" options={{ title: '' }} />
        <Stack.Screen
          name="edit"
          options={{ title: t('m.vault.newDocument'), ...modalPresentation }}
        />
        <Stack.Screen name="expiring" options={{ title: t('m.vault.expiringTitle') }} />
      </Stack>
    </BiometricGate>
  );
}
