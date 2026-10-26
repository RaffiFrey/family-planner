import type { CalendarSubscription, GoogleCalendarConnection } from '@fp/contracts';
import * as WebBrowser from 'expo-web-browser';
import { CalendarSync, RefreshCw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';
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
  ScreenScroll,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { isFeedUrl } from '@/features/integrations/feed-url';
import {
  useCalendarSubscriptions,
  useCalendarSyncMutations,
  useGoogleConnections,
} from '@/features/integrations/hooks';
import { useIntlLocale } from '@/i18n';
import { confirmAsync } from '@/lib/dialogs';
import { WEB_URL } from '@/lib/env';
import { useColors } from '@/lib/theme';

const STATUS_TONE = {
  pending: 'text-muted',
  ok: 'text-success',
  error: 'text-danger',
  active: 'text-success',
  revoked: 'text-muted',
} as const;

/** ICS subscriptions (list/add/refresh/remove) and Google Calendar connection status. */
export default function CalendarSyncScreen() {
  const { t } = useTranslation();
  const { can } = useHousehold();
  const subscriptions = useCalendarSubscriptions();
  const google = useGoogleConnections();
  const writable = can('calendar.write');

  if (subscriptions.isPending) return <LoadingView />;
  if (subscriptions.error && !subscriptions.data)
    return <ErrorState error={subscriptions.error} onRetry={() => void subscriptions.refetch()} />;

  return (
    <ScreenScroll
      refreshControl={
        <RefreshControl
          refreshing={subscriptions.isRefetching}
          onRefresh={() => {
            void subscriptions.refetch();
            void google.refetch();
          }}
        />
      }
    >
      <SectionHeader title={t('m.integrations.subscriptions')} />
      <Text variant="caption">{t('m.integrations.subscriptionsHint')}</Text>
      {subscriptions.data.length === 0 ? (
        <EmptyState title={t('m.integrations.noSubscriptions')} />
      ) : (
        <RowGroup>
          {subscriptions.data.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <SubscriptionRow subscription={s} writable={writable} />
            </View>
          ))}
        </RowGroup>
      )}
      {writable ? <AddSubscription /> : null}

      <SectionHeader title={t('m.integrations.google')} />
      <Text variant="caption">{t('m.integrations.googleHint')}</Text>
      {google.data && google.data.length > 0 ? (
        <RowGroup>
          {google.data.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <GoogleRow connection={c} writable={writable} />
            </View>
          ))}
        </RowGroup>
      ) : (
        <Text variant="caption">{t('m.integrations.noGoogle')}</Text>
      )}
      {writable ? (
        <Button
          variant="secondary"
          title={t('m.integrations.connectGoogle')}
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/settings/integrations`)}
        />
      ) : null}
    </ScreenScroll>
  );
}

function useDateTime() {
  const locale = useIntlLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
}

function SubscriptionRow({
  subscription: s,
  writable,
}: {
  subscription: CalendarSubscription;
  writable: boolean;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const fmt = useDateTime();
  const { refresh, remove } = useCalendarSyncMutations();
  const subtitle = [
    s.urlHost,
    t('m.integrations.eventCount', { count: s.eventCount }),
    s.lastFetchedAt
      ? t('m.integrations.lastFetched', { date: fmt(s.lastFetchedAt) })
      : t('m.integrations.neverFetched'),
  ].join(' · ');
  return (
    <View className="gap-1 py-1">
      <ListRow
        title={s.name}
        subtitle={subtitle}
        left={<CalendarSync size={22} color={colors.primary} />}
        right={
          writable ? (
            <View className="flex-row">
              <IconButton
                label={t('m.integrations.refresh')}
                disabled={refresh.isPending}
                onPress={() => {
                  refresh.mutate(s.id);
                }}
              >
                <RefreshCw size={20} color={colors.text} />
              </IconButton>
              <IconButton
                label={t('m.integrations.unsubscribe')}
                onPress={() => {
                  void confirmAsync(
                    t('m.integrations.unsubscribeTitle'),
                    t('m.integrations.unsubscribeMessage', { name: s.name }),
                    {
                      confirmLabel: t('common.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    },
                  ).then((ok) => {
                    if (ok) remove.mutate(s.id);
                  });
                }}
              >
                <Trash2 size={20} color={colors.danger} />
              </IconButton>
            </View>
          ) : null
        }
      />
      <View className="flex-row gap-2 px-4 pb-2">
        <Text variant="caption" className={STATUS_TONE[s.status]}>
          {t(`m.integrations.status.${s.status}`)}
        </Text>
        {s.lastError ? (
          <Text variant="caption" className="flex-1 text-danger" numberOfLines={2}>
            {s.lastError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function AddSubscription() {
  const { t } = useTranslation();
  const { create } = useCalendarSyncMutations();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  const submit = () => {
    const next: { name?: string; url?: string } = {};
    if (!name.trim()) next.name = t('m.integrations.nameRequired');
    if (!isFeedUrl(url)) next.url = t('m.integrations.invalidUrl');
    setErrors(next);
    if (next.name || next.url) return;
    create.mutate(
      { name: name.trim(), url: url.trim() },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
        },
      },
    );
  };

  return (
    <Card>
      <Text variant="subheading">{t('m.integrations.addSubscription')}</Text>
      <TextField
        label={t('m.integrations.feedName')}
        placeholder={t('m.integrations.feedNamePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={60}
        error={errors.name}
      />
      <TextField
        label={t('m.integrations.feedUrl')}
        placeholder="webcal://"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={errors.url}
      />
      <Button title={t('m.integrations.subscribe')} loading={create.isPending} onPress={submit} />
    </Card>
  );
}

function GoogleRow({
  connection: c,
  writable,
}: {
  connection: GoogleCalendarConnection;
  writable: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useDateTime();
  const { syncGoogle, disconnectGoogle } = useCalendarSyncMutations();
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1" numberOfLines={1}>
          {c.googleCalendarId}
        </Text>
        <Text variant="caption" className={STATUS_TONE[c.status]}>
          {t(`m.integrations.googleStatus.${c.status}`)}
        </Text>
      </View>
      {c.lastSyncedAt ? (
        <Text variant="caption">
          {t('m.integrations.lastSynced', { date: fmt(c.lastSyncedAt) })}
        </Text>
      ) : null}
      {c.lastError ? (
        <Text variant="caption" className="text-danger">
          {c.lastError}
        </Text>
      ) : null}
      {writable ? (
        <View className="flex-row gap-2">
          <Button
            size="sm"
            variant="secondary"
            title={t('m.integrations.syncNow')}
            loading={syncGoogle.isPending}
            disabled={c.status === 'revoked'}
            onPress={() => {
              syncGoogle.mutate(c.id);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            title={t('m.integrations.disconnect')}
            onPress={() => {
              void confirmAsync(
                t('m.integrations.disconnectTitle'),
                t('m.integrations.disconnectMessage'),
                {
                  confirmLabel: t('m.integrations.disconnect'),
                  cancelLabel: t('common.cancel'),
                  destructive: true,
                },
              ).then((ok) => {
                if (ok) disconnectGoogle.mutate(c.id);
              });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
