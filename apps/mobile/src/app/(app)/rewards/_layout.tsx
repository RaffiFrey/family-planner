import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function Layout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('nav.rewards') }} />
      <Stack.Screen
        name="reward-new"
        options={{ title: t('m.rewards.newReward'), ...modalPresentation }}
      />
      <Stack.Screen name="member/[memberId]" options={{ title: '' }} />
      <Stack.Screen
        name="allowance-rule"
        options={{ title: t('m.rewards.newRule'), ...modalPresentation }}
      />
      <Stack.Screen name="allowance" options={{ title: t('m.rewards.allowance') }} />
    </Stack>
  );
}
