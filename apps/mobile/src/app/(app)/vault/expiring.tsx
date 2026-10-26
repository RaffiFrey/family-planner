import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { FeatureGate, ModuleGate } from '@/components/gates';
import {
  Divider,
  EmptyState,
  ErrorState,
  LoadingView,
  RowGroup,
  SectionHeader,
  Segmented,
  Text,
} from '@/components/ui';
import { DocumentRow } from '@/features/vault/document-row';
import { compareDocuments } from '@/features/vault/expiry';
import { useVaultExpiring } from '@/features/vault/hooks';

const WINDOWS = ['30', '90', '183', '365'] as const;
type Window = (typeof WINDOWS)[number];

export default function VaultExpiringScreen() {
  return (
    <ModuleGate action="vault.read">
      <FeatureGate feature="vault">
        <ExpiringList />
      </FeatureGate>
    </ModuleGate>
  );
}

/** Documents that expired or expire within the chosen window (vault `expiring` endpoint). */
function ExpiringList() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Window>('183');
  const expiring = useVaultExpiring(Number(range));
  const labels: Record<Window, string> = {
    '30': t('m.vault.window30'),
    '90': t('m.vault.window90'),
    '183': t('m.vault.window183'),
    '365': t('m.vault.window365'),
  };
  const docs = [...(expiring.data ?? [])].sort(compareDocuments);
  const expired = docs.filter((d) => d.expiryState === 'expired');
  const upcoming = docs.filter((d) => d.expiryState !== 'expired');

  const section = (title: string, list: typeof docs) =>
    list.length > 0 ? (
      <View className="gap-2">
        <SectionHeader title={title} />
        <RowGroup>
          {list.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <DocumentRow doc={d} />
            </View>
          ))}
        </RowGroup>
      </View>
    ) : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={expiring.isRefetching}
          onRefresh={() => void expiring.refetch()}
        />
      }
    >
      <Segmented
        label={t('m.vault.window')}
        options={WINDOWS.map((w) => ({ value: w, label: labels[w] }))}
        value={range}
        onChange={setRange}
      />
      {expiring.isPending ? (
        <LoadingView />
      ) : expiring.isError && !expiring.data ? (
        <ErrorState error={expiring.error} onRetry={() => void expiring.refetch()} />
      ) : docs.length === 0 ? (
        <EmptyState title={t('m.vault.nothingExpiring')} />
      ) : (
        <>
          {section(t('m.vault.expiredSection'), expired)}
          {section(t('m.vault.upcomingSection'), upcoming)}
          <Text variant="caption" className="text-center">
            {t('m.vault.count', { count: docs.length })}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
