import type { FinContract } from '@fp/contracts';
import { router } from 'expo-router';
import { AlarmClock, Check, FileText, ShieldCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { FeatureGate } from '@/components/gates';
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Segmented,
  Text,
} from '@/components/ui';
import { useMoney } from '@/features/finance/hooks';
import {
  useContracts,
  useContractSuggestions,
  useContractSummary,
  useFinancePlusMutation,
} from '@/features/finance-plus/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

type StatusFilter = 'active' | 'cancelled' | 'all';

export default function ContractsScreen() {
  return (
    <FeatureGate feature="contracts">
      <Contracts />
    </FeatureGate>
  );
}

function formatDay(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(`${key}T12:00:00`),
  );
}

function Contracts() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const fmt = useMoney();
  const { can } = useHousehold();
  const writable = can('finance.write');
  const [status, setStatus] = useState<StatusFilter>('active');
  const contracts = useContracts(status);
  const summary = useContractSummary();
  const suggestions = useContractSuggestions(writable);

  const confirm = useFinancePlusMutation((householdId, key: string) =>
    api.financePlus.confirmSuggestion({ params: { householdId }, body: { key } }),
  );
  const dismiss = useFinancePlusMutation((householdId, key: string) =>
    api.financePlus.dismissSuggestion({ params: { householdId }, body: { key } }),
  );
  const update = useFinancePlusMutation(
    (householdId, v: { id: string; status: 'active' | 'cancelled' }) =>
      api.financePlus.updateContract({
        params: { householdId, contractId: v.id },
        body: { status: v.status },
      }),
  );
  const remove = useFinancePlusMutation((householdId, id: string) =>
    api.financePlus.deleteContract({ params: { householdId, contractId: id } }),
  );

  const openActions = async (c: FinContract) => {
    if (!writable) return;
    if (c.status === 'active') {
      const ok = await confirmAsync(t('m.financePlus.markCancelled'), c.name, {
        confirmLabel: t('m.financePlus.markCancelled'),
        cancelLabel: t('common.cancel'),
      });
      if (ok) update.mutate({ id: c.id, status: 'cancelled' });
      return;
    }
    const ok = await confirmAsync(t('m.financePlus.deleteContract'), c.name, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(c.id);
  };

  const refresh = () => {
    void contracts.refetch();
    void summary.refetch();
    if (writable) void suggestions.refetch();
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={<RefreshControl refreshing={contracts.isRefetching} onRefresh={refresh} />}
      >
        {summary.data ? (
          <Card>
            <Text variant="caption">{t('m.financePlus.monthlyCosts')}</Text>
            <Text variant="title">{fmt(summary.data.monthlyMinor, summary.data.currency)}</Text>
            <Text variant="caption">
              {t('m.financePlus.yearlyCosts', {
                amount: fmt(summary.data.yearlyMinor, summary.data.currency),
              })}
              {' · '}
              {t('m.financePlus.activeCount', { count: summary.data.activeCount })}
            </Text>
          </Card>
        ) : null}

        {summary.data && summary.data.upcomingDeadlines.length > 0 ? (
          <>
            <SectionHeader title={t('m.financePlus.deadlines')} />
            <RowGroup>
              {summary.data.upcomingDeadlines.map((d, i) => (
                <View key={d.contractId}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={d.name}
                    subtitle={t('m.financePlus.deadlineIn', {
                      count: d.daysLeft,
                      date: formatDay(d.cancellationDeadline, locale),
                    })}
                    left={
                      <AlarmClock
                        size={22}
                        color={d.daysLeft <= 14 ? colors.danger : colors.warning}
                      />
                    }
                  />
                </View>
              ))}
            </RowGroup>
          </>
        ) : null}

        {writable && suggestions.data && suggestions.data.length > 0 ? (
          <>
            <SectionHeader title={t('m.financePlus.suggestions')} />
            <Text variant="caption">{t('m.financePlus.suggestionsHint')}</Text>
            <RowGroup>
              {suggestions.data.map((s, i) => (
                <View key={s.key}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={s.name}
                    subtitle={`${fmt(s.averageAmountMinor, s.currency)} · ${t(`m.financePlus.intervals.${s.interval}`)} · ${t('m.financePlus.occurrences', { count: s.occurrences })}`}
                    right={
                      <View className="flex-row">
                        <IconButton
                          label={t('m.financePlus.confirmSuggestion', { name: s.name })}
                          onPress={() => {
                            confirm.mutate(s.key);
                          }}
                        >
                          <Check size={22} color={colors.success} />
                        </IconButton>
                        <IconButton
                          label={t('m.financePlus.dismissSuggestion', { name: s.name })}
                          onPress={() => {
                            dismiss.mutate(s.key);
                          }}
                        >
                          <X size={22} color={colors.textMuted} />
                        </IconButton>
                      </View>
                    }
                  />
                </View>
              ))}
            </RowGroup>
          </>
        ) : null}

        <RowGroup>
          <ListRow
            title={t('m.financePlus.insurance')}
            left={<ShieldCheck size={22} color={colors.primary} />}
            chevron
            onPress={() => {
              router.push('/finance/insurance');
            }}
          />
        </RowGroup>

        <SectionHeader title={t('m.financePlus.contracts')} />
        <Segmented
          label={t('m.financePlus.status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: t('m.financePlus.statusActive') },
            { value: 'cancelled', label: t('m.financePlus.statusCancelled') },
            { value: 'all', label: t('common.all') },
          ]}
        />
        {contracts.isPending ? (
          <LoadingView />
        ) : contracts.error && !contracts.data ? (
          <ErrorState error={contracts.error} onRetry={() => void contracts.refetch()} />
        ) : contracts.data.length === 0 ? (
          <EmptyState
            title={t('m.financePlus.noContracts')}
            message={t('m.financePlus.noContractsHint')}
          />
        ) : (
          <RowGroup>
            {contracts.data.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={c.name}
                  subtitle={[
                    t(`m.financePlus.types.${c.contractType}`),
                    c.cancellationDeadline
                      ? t('m.financePlus.cancelBy', {
                          date: formatDay(c.cancellationDeadline, locale),
                        })
                      : null,
                    c.status === 'cancelled' ? t('m.financePlus.statusCancelled') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  left={<FileText size={22} color={colors.primary} />}
                  right={
                    <View className="items-end">
                      <Text
                        className={`font-semibold ${c.direction === 'in' ? 'text-success' : 'text-text'}`}
                      >
                        {fmt(c.amountMinor, c.currency)}
                      </Text>
                      <Text variant="caption">{t(`m.financePlus.intervals.${c.interval}`)}</Text>
                    </View>
                  }
                  accessibilityHint={
                    writable
                      ? c.status === 'active'
                        ? t('m.financePlus.tapToCancel')
                        : t('m.financePlus.tapToDelete')
                      : undefined
                  }
                  {...(writable ? { onPress: () => void openActions(c) } : {})}
                />
              </View>
            ))}
          </RowGroup>
        )}
      </ScrollView>
      {writable ? (
        <Fab
          label={t('m.financePlus.newContract')}
          onPress={() => {
            router.push('/finance/contract-new');
          }}
        />
      ) : null}
    </View>
  );
}
