import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BiometricGate } from '@/features/settings/biometric-gate';
import { useColors } from '@/lib/theme';

export default function FilesLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <BiometricGate>
      <Stack
        screenOptions={{
          title: t('nav.storage'),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </BiometricGate>
  );
}
