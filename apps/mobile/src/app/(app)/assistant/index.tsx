import type { AssistantProposal } from '@fp/contracts';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChartPie, ChefHat, ScanLine, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { UpsellState } from '@/components/gates';
import {
  Button,
  Card,
  Divider,
  ListRow,
  RowGroup,
  ScreenScroll,
  Text,
  TextField,
} from '@/components/ui';
import { AssistantGate } from '@/features/assistant/assistant-gate';
import { assistantErrorMessage } from '@/features/assistant/errors';
import { useAssistantSettings, useDisableAssistant } from '@/features/assistant/hooks';
import { ProposalCard } from '@/features/assistant/proposal-card';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { isPlanLimit } from '@/lib/errors';
import { useColors } from '@/lib/theme';

export default function AssistantScreen() {
  return (
    <AssistantGate>
      <QuickCapture />
    </AssistantGate>
  );
}

/** Text in, proposal out: "Zahnarzt Lea Dienstag 15 Uhr, Milch auf die Einkaufsliste". */
function QuickCapture() {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const settings = useAssistantSettings();
  const disable = useDisableAssistant();
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);

  const capture = useMutation({
    mutationFn: (input: string) =>
      api.assistant.capture({ params: { householdId }, body: { text: input } }),
    onSuccess: (p) => {
      setProposal(p);
      void settings.refetch();
    },
  });

  const writable = can('assistant.write');
  const tooShort = text.trim().length < 2;

  return (
    <ScreenScroll>
      {writable ? (
        <Card>
          <TextField
            label={t('m.assistant.captureLabel')}
            value={text}
            onChangeText={setText}
            placeholder={t('m.assistant.capturePlaceholder')}
            multiline
            maxLength={1000}
            autoFocus
          />
          <Button
            title={t('m.assistant.understand')}
            icon={<Sparkles size={18} color={colors.primaryText} />}
            loading={capture.isPending}
            disabled={tooShort}
            onPress={() => {
              setProposal(null);
              capture.mutate(text.trim());
            }}
          />
          {settings.data ? (
            <Text variant="caption">
              {t('m.assistant.usage', {
                used: settings.data.usedToday,
                limit: settings.data.dailyLimit,
              })}
            </Text>
          ) : null}
        </Card>
      ) : (
        <Text variant="caption">{t('errors.forbidden')}</Text>
      )}

      {capture.error ? (
        isPlanLimit(capture.error) ? (
          <UpsellState feature="ai_assistant" compact />
        ) : (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {assistantErrorMessage(capture.error, t)}
          </Text>
        )
      ) : null}

      {proposal ? (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          onApplied={(p) => {
            setProposal(p);
            setText('');
          }}
          onDiscarded={() => {
            setProposal(null);
          }}
        />
      ) : null}

      <RowGroup>
        {can('finance.write') ? (
          <ListRow
            title={t('m.assistant.scanReceipt')}
            subtitle={t('m.assistant.scanReceiptHint')}
            left={<ScanLine size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/assistant/receipt');
            }}
          />
        ) : null}
        {can('finance.write') ? <Divider /> : null}
        {can('finance.read') ? (
          <ListRow
            title={t('m.assistant.insights')}
            subtitle={t('m.assistant.insightsHint')}
            left={<ChartPie size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/assistant/insights');
            }}
          />
        ) : null}
        {can('finance.read') ? <Divider /> : null}
        <ListRow
          title={t('m.assistant.mealIdeas')}
          subtitle={t('m.assistant.mealIdeasHint')}
          left={<ChefHat size={22} color={colors.primary} />}
          chevron
          onPress={() => {
            router.push('/assistant/meals');
          }}
        />
      </RowGroup>
      {can('household.manage') ? (
        <View className="gap-1 pt-4">
          <Button
            title={t('m.assistant.disable')}
            variant="ghost"
            loading={disable.isPending}
            onPress={() => {
              void confirmAsync(t('m.assistant.disable'), t('m.assistant.disableHint'), {
                confirmLabel: t('m.assistant.disableConfirm'),
                cancelLabel: t('common.cancel'),
                destructive: true,
              }).then((ok) => {
                if (ok) disable.mutate();
              });
            }}
          />
        </View>
      ) : null}
    </ScreenScroll>
  );
}
