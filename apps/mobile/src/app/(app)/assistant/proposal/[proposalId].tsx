import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingView, ScreenScroll, Text } from '@/components/ui';
import { AssistantGate } from '@/features/assistant/assistant-gate';
import { useProposal } from '@/features/assistant/hooks';
import { ProposalCard } from '@/features/assistant/proposal-card';
import { useIntlLocale } from '@/i18n';

/** Opens a stored proposal (e.g. from a notification or another device). */
export default function ProposalScreen() {
  return (
    <AssistantGate>
      <Proposal />
    </AssistantGate>
  );
}

function Proposal() {
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>();
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const queryClient = useQueryClient();
  const proposal = useProposal(proposalId);
  if (proposal.isPending) return <LoadingView />;
  if (proposal.error && !proposal.data)
    return <ErrorState error={proposal.error} onRetry={() => void proposal.refetch()} />;
  const p = proposal.data;
  return (
    <ScreenScroll>
      <Text variant="caption">
        {t('m.assistant.proposalFrom', {
          date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(p.createdAt),
          ),
        })}
        {' · '}
        {t(`m.assistant.status.${p.status}`)}
      </Text>
      <ProposalCard
        key={`${p.id}-${p.status}`}
        proposal={p}
        onApplied={() => {
          void queryClient.invalidateQueries({ queryKey: ['assistant'] });
        }}
        onDiscarded={() => {
          void queryClient.invalidateQueries({ queryKey: ['assistant'] });
          router.back();
        }}
      />
    </ScreenScroll>
  );
}
