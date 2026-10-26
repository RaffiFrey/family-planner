import type { Output } from '@fp/api-client';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Building2, Link2, RefreshCw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { FeatureGate } from '@/components/gates';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import {
  useBankConnections,
  useBanks,
  useFinancePlusMutation,
} from '@/features/finance-plus/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { API_URL, WEB_URL } from '@/lib/env';
import { confirmAsync } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useDebounced } from '@/lib/use-debounced';

export default function BankSyncScreen() {
  return (
    <FeatureGate feature="bank_sync">
      <BankSync />
    </FeatureGate>
  );
}

type ConnectionStatus = Output<'financePlus', 'listConnections'>[number]['status'];

const STATUS_TONE: Record<ConnectionStatus, string> = {
  active: 'text-success',
  pending: 'text-warning',
  error: 'text-danger',
  expired: 'text-danger',
};

/**
 * Bank connections: the bank login + SCA happen on the aggregator's web form, opened in an auth
 * session that closes when the API redirects back to the web app's bank-sync page.
 */
function BankSync() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const writable = can('finance.write');
  const connections = useBankConnections();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const banks = useBanks(q, writable);

  const complete = useFinancePlusMutation((hid, connectionId: string) =>
    api.financePlus.completeConnection({ params: { householdId: hid, connectionId } }),
  );
  const sync = useFinancePlusMutation((hid, connectionId: string) =>
    api.financePlus.syncConnection({ params: { householdId: hid, connectionId } }),
  );
  const remove = useFinancePlusMutation((hid, connectionId: string) =>
    api.financePlus.deleteConnection({ params: { householdId: hid, connectionId } }),
  );
  const start = useFinancePlusMutation(async (hid, bankId: string) => {
    const { connectionId, redirectUrl } = await api.financePlus.startConnection({
      params: { householdId: hid },
      body: { bankId },
    });
    if (redirectUrl.startsWith(`${API_URL}/v1/bank-sync/callback`)) {
      // Nothing to show at the aggregator (mock provider): resolve the callback directly.
      await fetch(redirectUrl, { headers: { accept: 'application/json' } }).catch(() => undefined);
    } else {
      await WebBrowser.openAuthSessionAsync(redirectUrl, `${WEB_URL}/finance/bank-sync`);
    }
    // Finish connections that are still pending after the browser closed.
    const all = await api.financePlus.listConnections({ params: { householdId: hid } });
    const conn = all.find((c) => c.id === connectionId);
    if (conn?.status === 'pending')
      await api.financePlus.completeConnection({ params: { householdId: hid, connectionId } });
    setQuery('');
  });

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  if (connections.isPending) return <LoadingView />;
  if (connections.error && !connections.data)
    return <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={connections.isRefetching}
          onRefresh={() => void connections.refetch()}
        />
      }
    >
      <SectionHeader title={t('m.financePlus.connections')} />
      {connections.data.length === 0 ? (
        <EmptyState
          title={t('m.financePlus.noConnections')}
          message={t('m.financePlus.noConnectionsHint')}
        />
      ) : (
        connections.data.map((c) => (
          <Card key={c.id}>
            <View className="flex-row items-center gap-2">
              <Building2 size={22} color={colors.primary} />
              <Text variant="subheading" className="flex-1">
                {c.bankName}
              </Text>
              <Text className={`text-sm font-semibold ${STATUS_TONE[c.status]}`}>
                {t(`m.financePlus.connectionStatus.${c.status}`)}
              </Text>
            </View>
            {c.lastSyncedAt ? (
              <Text variant="caption">
                {t('m.financePlus.lastSynced', { date: dateTime(c.lastSyncedAt) })}
              </Text>
            ) : null}
            {c.consentExpiresAt ? (
              <Text variant="caption">
                {t('m.financePlus.consentUntil', { date: dateTime(c.consentExpiresAt) })}
              </Text>
            ) : null}
            {c.lastError ? (
              <Text variant="caption" className="text-danger">
                {c.lastError}
              </Text>
            ) : null}
            {c.accounts.length > 0 ? (
              <RowGroup>
                {c.accounts.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={a.name}
                      subtitle={[
                        a.ibanLast4 ? `•••• ${a.ibanLast4}` : null,
                        a.accountId ? t('m.financePlus.linked') : t('m.financePlus.notLinked'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      left={
                        <Link2 size={20} color={a.accountId ? colors.success : colors.textMuted} />
                      }
                      {...(writable && !a.accountId
                        ? {
                            chevron: true,
                            onPress: () => {
                              router.push({
                                pathname: '/finance/bank-link',
                                params: { connectionId: c.id, bankAccountId: a.id },
                              });
                            },
                          }
                        : {})}
                    />
                  </View>
                ))}
              </RowGroup>
            ) : null}
            {writable ? (
              <View className="flex-row items-center gap-2">
                {c.status === 'pending' ? (
                  <Button
                    className="flex-1"
                    size="sm"
                    title={t('m.financePlus.completeConnection')}
                    loading={complete.isPending}
                    onPress={() => {
                      complete.mutate(c.id);
                    }}
                  />
                ) : (
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="secondary"
                    title={t('m.financePlus.syncNow')}
                    icon={<RefreshCw size={16} color={colors.text} />}
                    loading={sync.isPending && sync.variables === c.id}
                    onPress={() => {
                      sync.mutate(c.id);
                    }}
                  />
                )}
                <IconButton
                  label={t('m.financePlus.removeConnection')}
                  onPress={() => {
                    void confirmAsync(
                      t('m.financePlus.removeConnection'),
                      t('m.financePlus.removeConnectionHint'),
                      {
                        confirmLabel: t('common.delete'),
                        cancelLabel: t('common.cancel'),
                        destructive: true,
                      },
                    ).then((ok) => {
                      if (ok) remove.mutate(c.id);
                    });
                  }}
                >
                  <Trash2 size={18} color={colors.textMuted} />
                </IconButton>
              </View>
            ) : null}
          </Card>
        ))
      )}
      {sync.data ? (
        <Text accessibilityLiveRegion="polite" variant="caption">
          {t('m.financePlus.syncResult', {
            imported: sync.data.imported,
            duplicates: sync.data.duplicates,
          })}
        </Text>
      ) : null}

      {writable ? (
        <>
          <SectionHeader title={t('m.financePlus.connectBank')} />
          <TextField
            label={t('m.financePlus.searchBank')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('m.financePlus.searchBankPlaceholder')}
            autoCorrect={false}
          />
          {start.isPending ? (
            <Text accessibilityLiveRegion="polite">{t('m.financePlus.connecting')}</Text>
          ) : null}
          <RowGroup>
            {(banks.data ?? []).slice(0, 20).map((b, i) => (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={b.name}
                  subtitle={[b.bic, b.city].filter(Boolean).join(' · ') || null}
                  left={<Building2 size={20} color={colors.textMuted} />}
                  chevron
                  onPress={() => {
                    if (!start.isPending) start.mutate(b.id);
                  }}
                />
              </View>
            ))}
          </RowGroup>
          <Text variant="caption">{t('m.financePlus.redirectHint')}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
