import { ShieldCheck } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { FeatureGate } from '@/components/gates';
import { Button, Card, ErrorState, LoadingView, SwitchRow, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useColors } from '@/lib/theme';
import { assistantErrorMessage } from './errors';
import { useAssistantSettings, useEnableAssistant } from './hooks';

/**
 * Plan gate (Family Plus) + household opt-in: nothing is sent to the AI provider before an
 * owner/admin consented. Other members see a hint.
 */
export function AssistantGate({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="ai_assistant">
      <ConsentGate>{children}</ConsentGate>
    </FeatureGate>
  );
}

function ConsentGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const settings = useAssistantSettings();
  const enable = useEnableAssistant();
  const [accepted, setAccepted] = useState(false);

  if (settings.isPending) return <LoadingView />;
  if (settings.error && !settings.data)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const s = settings.data;
  if (s.enabled && s.available) return <>{children}</>;

  return (
    <View className="flex-1 gap-4 bg-background p-4">
      <Card>
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={22} color={colors.primary} />
          <Text variant="subheading" className="flex-1">
            {t('m.assistant.consentTitle')}
          </Text>
        </View>
        {!s.available ? (
          <Text testID="assistant-unavailable">{t('m.assistant.errors.notConfigured')}</Text>
        ) : can('household.manage') ? (
          <>
            <Text variant="caption">{t('m.assistant.consentText')}</Text>
            <SwitchRow
              title={t('m.assistant.consentCheckbox')}
              value={accepted}
              onValueChange={setAccepted}
            />
            {enable.error ? (
              <Text className="text-danger">{assistantErrorMessage(enable.error, t)}</Text>
            ) : null}
            <Button
              title={t('m.assistant.enable')}
              disabled={!accepted}
              loading={enable.isPending}
              onPress={() => {
                enable.mutate();
              }}
            />
          </>
        ) : (
          <Text variant="caption" testID="assistant-ask-admin">
            {t('m.assistant.askAdmin')}
          </Text>
        )}
      </Card>
    </View>
  );
}
