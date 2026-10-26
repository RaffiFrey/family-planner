import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ShoppingCart, ListTodo, Luggage, Gift, List as ListIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  Divider,
  EmptyState,
  ErrorState,
  Fab,
  ListRow,
  LoadingView,
  RowGroup,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useLists } from '@/features/lists/hooks';
import { api } from '@/lib/api';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

const KIND_ICONS = {
  shopping: ShoppingCart,
  todo: ListTodo,
  packing: Luggage,
  wishlist: Gift,
  other: ListIcon,
} as const;

export default function ListsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const lists = useLists();
  const remove = useMutation({
    mutationFn: (listId: string) => api.lists.remove({ params: { householdId, listId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['lists'] }),
    onError: (e) => {
      showError(e, t);
    },
  });

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl refreshing={lists.isRefetching} onRefresh={() => void lists.refetch()} />
        }
      >
        {lists.isPending ? (
          <LoadingView />
        ) : lists.error && !lists.data ? (
          <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
        ) : lists.data.length === 0 ? (
          <EmptyState title={t('m.lists.empty')} message={t('m.lists.emptyHint')} />
        ) : (
          <RowGroup>
            {lists.data.map((list, i) => {
              const Icon = KIND_ICONS[list.kind];
              return (
                <View key={list.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={list.name}
                    subtitle={`${t(`listKinds.${list.kind}`)} · ${t('m.lists.openCount', { count: list.openCount })}`}
                    left={<Icon size={22} color={colors.primary} />}
                    right={
                      list.openCount > 0 ? (
                        <View className="min-w-7 items-center rounded-full bg-primary px-2 py-0.5">
                          <Text className="text-xs font-semibold text-primary-text">
                            {list.openCount}
                          </Text>
                        </View>
                      ) : null
                    }
                    chevron
                    accessibilityHint={
                      can('lists.write') ? t('m.lists.longPressDelete') : undefined
                    }
                    onPress={() => {
                      router.push({ pathname: '/lists/[listId]', params: { listId: list.id } });
                    }}
                    onLongPress={() => {
                      if (!can('lists.write')) return;
                      void confirmAsync(t('m.lists.deleteTitle'), list.name, {
                        confirmLabel: t('common.delete'),
                        cancelLabel: t('common.cancel'),
                        destructive: true,
                      }).then((ok) => {
                        if (ok) remove.mutate(list.id);
                      });
                    }}
                  />
                </View>
              );
            })}
          </RowGroup>
        )}
      </ScrollView>
      {can('lists.write') ? (
        <Fab
          label={t('m.lists.newList')}
          onPress={() => {
            router.push('/lists/new');
          }}
        />
      ) : null}
    </View>
  );
}
