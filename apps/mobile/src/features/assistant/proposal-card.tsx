import type { AssistantAction, AssistantProposal } from '@fp/contracts';
import { isCurrencyCode } from '@fp/domain/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ListPlus,
  type LucideIcon,
  Receipt,
  SquareCheckBig,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button, Card, ChipSelect, Text } from '@/components/ui';
import { useAccounts, useMoney } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { useLists } from '@/features/lists/hooks';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { assistantErrorMessage } from './errors';
import { APPLIED_MODULES } from './hooks';

const ICONS: Record<AssistantAction['type'], LucideIcon> = {
  create_event: CalendarDays,
  create_task: SquareCheckBig,
  add_list_items: ListPlus,
  create_transaction: Receipt,
};

function useDescribe() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const { household } = useHousehold();
  const lists = useLists();
  const listName = (id: string) => lists.data?.find((l) => l.id === id)?.name ?? '';
  const dt = (iso: string, allDay = false) =>
    new Intl.DateTimeFormat(
      locale,
      allDay ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' },
    ).format(new Date(iso));

  return (a: AssistantAction): { title: string; detail: string } => {
    switch (a.type) {
      case 'create_event':
        return {
          title: t('m.assistant.actions.event', { title: a.title }),
          detail: [dt(a.start, a.allDay), a.location].filter(Boolean).join(' · '),
        };
      case 'create_task':
        return {
          title: t('m.assistant.actions.task', { title: a.title }),
          detail: a.dueAt ? t('m.assistant.due', { date: dt(a.dueAt) }) : '',
        };
      case 'add_list_items':
        return {
          title: t('m.assistant.actions.listItems', {
            count: a.items.length,
            list: listName(a.listId),
          }),
          detail: a.items.map((i) => (i.quantity ? `${i.quantity} ${i.text}` : i.text)).join(', '),
        };
      case 'create_transaction':
        return {
          title: t('m.assistant.actions.transaction', {
            amount: fmt(
              a.amountMinor,
              isCurrencyCode(a.currency) ? a.currency : household.currency,
            ),
          }),
          detail: [a.counterpartyName, dt(`${a.bookingDate}T12:00:00`, true), a.purpose]
            .filter(Boolean)
            .join(' · '),
        };
    }
  };
}

/** Proposed actions with checkboxes; apply creates them with the caller's permissions. */
export function ProposalCard({
  proposal,
  onApplied,
  onDiscarded,
}: {
  proposal: AssistantProposal;
  onApplied: (p: AssistantProposal) => void;
  onDiscarded: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const describe = useDescribe();
  const needsAccount = proposal.actions.some(
    (a) => a.type === 'create_transaction' && a.accountId === null,
  );
  const accounts = useAccounts();
  const [selected, setSelected] = useState<number[]>(() => proposal.actions.map((_, i) => i));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appliedIndexes = new Set(proposal.results.map((r) => r.index));
  const open = proposal.status === 'pending';

  const apply = useMutation({
    mutationFn: () =>
      api.assistant.apply({
        params: { householdId, proposalId: proposal.id },
        body: {
          actionIndexes: selected.filter((i) => !appliedIndexes.has(i)),
          ...(accountId ? { accountId } : {}),
        },
      }),
    onSuccess: (p) => {
      setError(null);
      for (const m of APPLIED_MODULES) void queryClient.invalidateQueries({ queryKey: [m] });
      onApplied(p);
    },
    onError: (e) => {
      setError(assistantErrorMessage(e, t));
    },
  });
  const discard = useMutation({
    mutationFn: () => api.assistant.discard({ params: { householdId, proposalId: proposal.id } }),
    onSuccess: onDiscarded,
    onError: (e) => {
      setError(assistantErrorMessage(e, t));
    },
  });

  const toggle = (i: number) => {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };
  const transactionSelected = proposal.actions.some(
    (a, i) => a.type === 'create_transaction' && a.accountId === null && selected.includes(i),
  );
  const missingAccount = needsAccount && transactionSelected && !accountId;

  return (
    <Card>
      <Text variant="subheading">{t('m.assistant.proposal')}</Text>
      {proposal.message ? <Text variant="caption">{proposal.message}</Text> : null}
      {proposal.actions.length === 0 ? (
        <Text variant="caption">{t('m.assistant.nothingFound')}</Text>
      ) : (
        <View className="gap-1" accessibilityRole="list">
          {proposal.actions.map((a, i) => {
            const Icon = ICONS[a.type];
            const { title, detail } = describe(a);
            const done = appliedIndexes.has(i);
            const checked = done || selected.includes(i);
            return (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: done || !open }}
                accessibilityLabel={detail ? `${title}, ${detail}` : title}
                disabled={done || !open}
                onPress={() => {
                  toggle(i);
                }}
                className="min-h-14 flex-row items-center gap-3 rounded-md py-2"
              >
                <View
                  className={`h-6 w-6 items-center justify-center rounded border-2 ${checked ? 'border-primary bg-primary' : 'border-border'}`}
                >
                  {checked ? <Check size={14} color={colors.primaryText} /> : null}
                </View>
                <Icon size={20} color={colors.primary} />
                <View className="flex-1">
                  <Text className={done ? 'text-muted' : ''}>{title}</Text>
                  {detail ? <Text variant="caption">{detail}</Text> : null}
                </View>
                {done ? (
                  <Text className="text-xs text-success">{t('m.assistant.created')}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {proposal.issues.length > 0 ? (
        <View className="gap-1">
          <Text variant="label">{t('m.assistant.issues')}</Text>
          {proposal.issues.map((issue) => (
            <Text key={`${issue.index}-${issue.code}`} variant="caption" className="text-warning">
              {issue.message}
            </Text>
          ))}
        </View>
      ) : null}
      {open && needsAccount && transactionSelected ? (
        <ChipSelect
          label={t('m.finance.account')}
          value={accountId}
          onChange={setAccountId}
          options={(accounts.data ?? []).map((acc) => ({ value: acc.id, label: acc.name }))}
        />
      ) : null}
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {open && proposal.actions.length > 0 ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            title={t('m.assistant.discard')}
            loading={discard.isPending}
            onPress={() => {
              discard.mutate();
            }}
          />
          <Button
            className="flex-1"
            title={t('m.assistant.apply')}
            loading={apply.isPending}
            disabled={selected.length === 0 || missingAccount}
            onPress={() => {
              apply.mutate();
            }}
          />
        </View>
      ) : null}
      {proposal.status === 'applied' ? (
        <Text className="text-success" accessibilityLiveRegion="polite">
          {t('m.assistant.applied')}
        </Text>
      ) : null}
    </Card>
  );
}
