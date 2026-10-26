import type { VaultDocumentType } from '@fp/contracts';
import { router } from 'expo-router';
import { CalendarClock, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { FeatureGate, ModuleGate } from '@/components/gates';
import {
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { compareDocuments } from '@/features/vault/expiry';
import { DocumentRow } from '@/features/vault/document-row';
import { useVaultDocuments, useVaultSearch } from '@/features/vault/hooks';
import { useTypeLabel, VAULT_TYPES } from '@/features/vault/ui';
import { useColors } from '@/lib/theme';
import { useDebounced } from '@/lib/use-debounced';

export default function VaultScreen() {
  return (
    <ModuleGate action="vault.read">
      <FeatureGate feature="vault">
        <VaultList />
      </FeatureGate>
    </ModuleGate>
  );
}

function VaultList() {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const typeLabel = useTypeLabel();
  const docs = useVaultDocuments();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<VaultDocumentType | null>(null);
  const q = useDebounced(query.trim(), 300);
  const search = useVaultSearch(q);

  if (docs.isPending) return <LoadingView />;
  if (docs.isError && !docs.data)
    return <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />;

  const all = [...docs.data].sort(compareDocuments);
  const filtered = type ? all.filter((d) => d.type === type) : all;
  const attention = filtered.filter(
    (d) => d.expiryState === 'expired' || d.expiryState === 'expiring',
  );
  const rest = filtered.filter((d) => d.expiryState !== 'expired' && d.expiryState !== 'expiring');
  const usedTypes = VAULT_TYPES.filter((ty) => all.some((d) => d.type === ty));

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={docs.isRefetching} onRefresh={() => void docs.refetch()} />
        }
      >
        <View className="min-h-12 flex-row items-center gap-2 rounded-md border border-border bg-surface px-3">
          <Search size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('m.vault.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('m.vault.searchPlaceholder')}
            returnKeyType="search"
            maxFontSizeMultiplier={2}
            className="min-h-12 flex-1 text-base text-text"
          />
        </View>

        {q.length > 0 ? (
          search.isPending ? (
            <LoadingView />
          ) : search.isError ? (
            <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          ) : search.data.length === 0 ? (
            <EmptyState title={t('m.vault.noResults')} />
          ) : (
            <RowGroup>
              {search.data.map((hit, i) => (
                <View key={hit.document.id}>
                  {i > 0 ? <Divider /> : null}
                  <DocumentRow doc={hit.document} snippet={hit.snippet} />
                </View>
              ))}
            </RowGroup>
          )
        ) : all.length === 0 ? (
          <EmptyState title={t('m.vault.empty')} message={t('m.vault.emptyHint')} />
        ) : (
          <>
            <RowGroup>
              <ListRow
                title={t('m.vault.expiringTitle')}
                subtitle={t('m.vault.expiringSubtitle')}
                left={<CalendarClock size={22} color={colors.primary} />}
                chevron
                onPress={() => {
                  router.push('/vault/expiring');
                }}
              />
            </RowGroup>
            {usedTypes.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                <Chip
                  label={t('common.all')}
                  selected={type === null}
                  onPress={() => {
                    setType(null);
                  }}
                />
                {usedTypes.map((ty) => (
                  <Chip
                    key={ty}
                    label={typeLabel(ty)}
                    selected={type === ty}
                    onPress={() => {
                      setType(ty);
                    }}
                  />
                ))}
              </ScrollView>
            ) : null}
            {attention.length > 0 ? (
              <>
                <SectionHeader title={t('m.vault.needsAttention')} />
                <RowGroup>
                  {attention.map((d, i) => (
                    <View key={d.id}>
                      {i > 0 ? <Divider /> : null}
                      <DocumentRow doc={d} />
                    </View>
                  ))}
                </RowGroup>
              </>
            ) : null}
            {rest.length > 0 ? (
              <>
                <SectionHeader title={t('m.vault.allDocuments')} />
                <RowGroup>
                  {rest.map((d, i) => (
                    <View key={d.id}>
                      {i > 0 ? <Divider /> : null}
                      <DocumentRow doc={d} />
                    </View>
                  ))}
                </RowGroup>
              </>
            ) : null}
            <Text variant="caption" className="text-center">
              {t('m.vault.count', { count: filtered.length })}
            </Text>
          </>
        )}
      </ScrollView>
      {can('vault.write') ? (
        <Fab
          label={t('m.vault.newDocument')}
          onPress={() => {
            router.push('/vault/edit');
          }}
        />
      ) : null}
    </View>
  );
}
