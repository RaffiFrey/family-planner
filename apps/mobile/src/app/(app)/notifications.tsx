import { apiQuery } from '@fp/api-client';
import type { Notification, Preferences } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingView,
  Segmented,
  Text,
} from '@/components/ui';
import { notificationsQuery } from '@/features/notifications/queries';
import { useIntlLocale } from '@/i18n';
import { api } from '@/lib/api';
import { notificationLinkToRoute } from '@/lib/links';

/** In-app inbox plus digest preference. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const queryClient = useQueryClient();
  const list = useQuery(notificationsQuery());
  const prefs = useQuery(apiQuery(api, 'notifications', 'getPreferences'));
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.notifications.markRead({ body: ids ? { ids } : {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const updatePrefs = useMutation({
    mutationFn: (p: Preferences) => api.notifications.updatePreferences({ body: p }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) router.push(notificationLinkToRoute(n.link));
  };

  if (list.isPending) return <LoadingView />;
  if (list.error && !list.data)
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () =>
            list.data.unreadCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                title={t('m.notifications.markAllRead')}
                onPress={() => {
                  markRead.mutate(undefined);
                }}
              />
            ) : null,
        }}
      />
      <FlatList
        data={list.data.items}
        keyExtractor={(n) => n.id}
        contentContainerClassName="pb-12"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
        ListHeaderComponent={
          prefs.data ? (
            <Card className="m-4">
              <Text variant="label">{t('m.notifications.digest')}</Text>
              <Segmented
                options={(['off', 'daily', 'weekly'] as const).map((d) => ({
                  value: d,
                  label: t(`m.notifications.digestOptions.${d}`),
                }))}
                value={prefs.data.digest}
                onChange={(digest) => {
                  updatePrefs.mutate({ ...prefs.data, digest });
                }}
              />
            </Card>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState title={t('m.notifications.empty')} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.readAt ? '' : `${t('m.notifications.unread')}, `}${item.title}, ${item.body}`}
            onPress={() => {
              open(item);
            }}
            className="flex-row gap-3 border-b border-border px-4 py-3 active:bg-surface-muted"
          >
            <View
              className={`mt-2 h-2 w-2 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-primary'}`}
            />
            <View className="flex-1 gap-0.5">
              <Text className={item.readAt ? '' : 'font-semibold'}>{item.title}</Text>
              <Text variant="caption">{item.body}</Text>
              <Text variant="caption">{fmt.format(new Date(item.createdAt))}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
