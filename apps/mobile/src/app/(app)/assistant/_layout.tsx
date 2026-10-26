import { router, Stack } from 'expo-router';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { useStackScreenOptions } from '@/lib/stack-options';
import { useColors } from '@/lib/theme';

/** Presented as a modal from the app stack (quick capture + receipt scan). */
export default function AssistantLayout() {
  const { t } = useTranslation();
  const colors = useColors();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('m.assistant.title'),
          headerLeft: () => (
            <IconButton
              label={t('common.close')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
            >
              <X size={22} color={colors.text} />
            </IconButton>
          ),
        }}
      />
      <Stack.Screen name="receipt" options={{ title: t('m.assistant.scanReceipt') }} />
      <Stack.Screen name="insights" options={{ title: t('m.assistant.insights') }} />
      <Stack.Screen name="meals" options={{ title: t('m.assistant.mealIdeas') }} />
      <Stack.Screen name="proposal/[proposalId]" options={{ title: t('m.assistant.proposal') }} />
    </Stack>
  );
}
