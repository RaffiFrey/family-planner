import type { Transaction } from '@fp/contracts';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, View } from 'react-native';
import { EmptyState, ErrorState, Fab, LoadingView, Text } from '@/components/ui';
import { useCategoryLabels, useMoney, useTransactions } from '@/features/finance/hooks';
import { useHousehold } from '@/features/household/household';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useColors } from '@/lib/theme';

export default function TransactionsScreen() {
  const { accountId, title } = useLocalSearchParams<{ accountId?: string; title?: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { householdId, can } = useHousehold();
  const fmt = useMoney();
  const labels = useCategoryLabels();
  const queryClient = useQueryClient();
  const query = useTransactions(accountId);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.finance.deleteTransaction({ params: { householdId, transactionId: id } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance'] }),
    onError: (e) => {
      Alert.alert(t('common.unknownError'), errorMessage(e, t));
    },
  });

  const renderItem = ({ item }: { item: Transaction }) => {
    const name = item.counterpartyName ?? (item.purpose || t('m.finance.noDescription'));
    const category = item.categoryId ? labels.get(item.categoryId) : t('categories.uncategorized');
    const date = dateFmt.format(new Date(`${item.bookingDate}T12:00:00`));
    const amount = fmt(item.amountMinor, item.currency);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${amount}, ${date}, ${category ?? ''}`}
        onPress={() => {
          if (can('finance.write'))
            router.push({ pathname: '/finance/transaction', params: { id: item.id } });
        }}
        onLongPress={() => {
          if (!can('finance.write')) return;
          Alert.alert(t('m.finance.deleteTransaction'), `${name} (${amount})`, [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: () => {
                remove.mutate(item.id);
              },
            },
          ]);
        }}
        className="min-h-16 flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-surface-muted"
      >
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1}>{name}</Text>
          <Text variant="caption" numberOfLines={1}>
            {date} · {category}
            {item.status === 'pending' ? ` · ${t('m.finance.pending')}` : ''}
          </Text>
        </View>
        <Text className={`font-semibold ${item.amountMinor < 0 ? 'text-text' : 'text-success'}`}>
          {amount}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: title ?? t('m.finance.transactions') }} />
      {query.isPending ? (
        <LoadingView />
      ) : query.error && !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListEmptyComponent={<EmptyState title={t('m.finance.noTransactions')} />}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator className="py-4" color={colors.primary} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}
      {can('finance.write') ? (
        <Fab
          label={t('m.finance.newTransaction')}
          onPress={() => {
            router.push({
              pathname: '/finance/transaction',
              params: accountId ? { accountId } : {},
            });
          }}
        />
      ) : null}
    </View>
  );
}
