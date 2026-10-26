import type { GeoPlace } from '@fp/contracts';
import { router } from 'expo-router';
import { Locate, MapPin, Plus, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import {
  Avatar,
  Button,
  Card,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  LoadingView,
  RowGroup,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import {
  useMemberLocations,
  useMyShare,
  usePlaces,
  usePlaceSubscriptions,
  useStopSharing,
} from '@/features/location/hooks';
import type { MapMember } from '@/features/location/map-types';
import { MemberMap } from '@/features/location/member-map';
import { useSharingState } from '@/features/location/sharing-context';
import { useIntlLocale } from '@/i18n';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

function useRelativeTime() {
  const locale = useIntlLocale();
  const now = useNow(30_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return (iso: string) => {
    const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 48) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
  };
}

export default function LocationScreen() {
  return (
    <ModuleGate action="location.read">
      <LocationContent />
    </ModuleGate>
  );
}

function LocationContent() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const relative = useRelativeTime();
  const { can, me } = useHousehold();
  const members = useMemberMap();
  const share = useMyShare();
  const latest = useMemberLocations();
  const places = usePlaces();
  const subscriptions = usePlaceSubscriptions();
  const subscribedPlaces = new Set((subscriptions.data ?? []).map((sub) => sub.placeId));
  const stop = useStopSharing();
  const state = useSharingState();
  const writable = can('location.write');

  if (share.isPending) return <LoadingView />;
  if (share.isError && share.data === undefined)
    return <ErrorState error={share.error} onRetry={() => void share.refetch()} />;

  const placeById = new Map((places.data ?? []).map((p) => [p.id, p]));
  const mapMembers: MapMember[] = (latest.data ?? []).map((l) => {
    const m = members.get(l.memberId);
    return {
      memberId: l.memberId,
      name: m?.displayName ?? '?',
      color: m?.color ?? colors.primary,
      lat: l.lat,
      lng: l.lng,
      accuracyM: l.accuracyM,
    };
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const openPlace = (place?: GeoPlace) => {
    router.push(
      place ? { pathname: '/location/place', params: { placeId: place.id } } : '/location/place',
    );
  };

  const stopSharing = async () => {
    const ok = await confirmAsync(t('m.location.stopTitle'), t('m.location.stopMessage'), {
      confirmLabel: t('m.location.stop'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    stop.mutate(undefined, {
      onError: (e) => {
        showError(e, t);
      },
    });
  };

  const statusText = {
    idle: '',
    waiting: t('m.location.statusWaiting'),
    sending: state.lastSentAt
      ? t('m.location.statusSending', { time: timeFmt.format(state.lastSentAt) })
      : t('m.location.statusWaiting'),
    denied: t('m.location.statusDenied'),
    unavailable: t('m.location.statusUnavailable'),
  }[state.status];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={latest.isRefetching}
          onRefresh={() => {
            void share.refetch();
            void latest.refetch();
            void places.refetch();
          }}
        />
      }
    >
      {state.sharing && share.data ? (
        <Card className="border-success">
          <View className="flex-row items-center gap-2">
            <Locate size={20} color={colors.success} />
            <Text variant="subheading" className="flex-1" accessibilityRole="header">
              {t('m.location.sharingUntil', { time: timeFmt.format(new Date(share.data.until)) })}
            </Text>
          </View>
          {statusText ? (
            <Text
              variant="caption"
              className={
                state.status === 'denied' || state.status === 'unavailable' ? 'text-danger' : ''
              }
              accessibilityLiveRegion="polite"
            >
              {statusText}
            </Text>
          ) : null}
          <Text variant="caption">
            {state.backgroundRunning ? t('m.location.backgroundOn') : t('m.location.backgroundOff')}
          </Text>
          <Text variant="caption">
            {share.data.sharedWith
              ? t('m.location.audienceSome', { count: share.data.sharedWith.length })
              : t('m.location.audienceAll')}
          </Text>
          <Button
            title={t('m.location.stop')}
            variant="danger"
            loading={stop.isPending}
            onPress={() => void stopSharing()}
          />
        </Card>
      ) : writable ? (
        <Card>
          <View className="flex-row items-center gap-2">
            <ShieldCheck size={22} color={colors.primary} />
            <Text variant="heading" className="flex-1">
              {t('m.location.optInTitle')}
            </Text>
          </View>
          <Text>{t('m.location.optInIntro')}</Text>
          <View className="gap-1">
            <Text variant="caption">• {t('m.location.optInPoint1')}</Text>
            <Text variant="caption">• {t('m.location.optInPoint2')}</Text>
            <Text variant="caption">• {t('m.location.optInPoint3')}</Text>
          </View>
          <Button
            title={t('m.location.startCta')}
            onPress={() => {
              router.push('/location/share');
            }}
          />
        </Card>
      ) : null}

      <MemberMap members={mapMembers} places={places.data ?? []} onPlacePress={openPlace} />

      <SectionHeader title={t('m.location.family')} />
      {latest.isError && !latest.data ? (
        <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />
      ) : mapMembers.length === 0 ? (
        <Card>
          <Text variant="caption">{t('m.location.nobodySharing')}</Text>
        </Card>
      ) : (
        <RowGroup>
          {(latest.data ?? []).map((l, i) => {
            const m = members.get(l.memberId);
            const at = l.placeIds
              .map((id) => placeById.get(id)?.name)
              .filter((n): n is string => !!n);
            return (
              <View key={l.memberId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={
                    l.memberId === me.id
                      ? `${m?.displayName ?? ''} (${t('m.family.you')})`
                      : (m?.displayName ?? '?')
                  }
                  subtitle={[
                    at.length > 0 ? t('m.location.atPlaces', { places: at.join(', ') }) : null,
                    t('m.location.seen', { when: relative(l.at) }),
                    t('m.location.accuracy', { meters: Math.round(l.accuracyM) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  left={<Avatar name={m?.displayName ?? '?'} color={m?.color ?? colors.primary} />}
                  chevron
                  accessibilityHint={t('m.location.openHistory')}
                  onPress={() => {
                    router.push({
                      pathname: '/location/history',
                      params: { memberId: l.memberId },
                    });
                  }}
                />
              </View>
            );
          })}
        </RowGroup>
      )}

      <SectionHeader
        title={t('m.location.places')}
        action={
          writable ? (
            <IconButton
              label={t('m.location.addPlace')}
              onPress={() => {
                openPlace();
              }}
            >
              <Plus size={22} color={colors.primary} />
            </IconButton>
          ) : undefined
        }
      />
      {places.isPending ? (
        <LoadingView />
      ) : (places.data ?? []).length === 0 ? (
        <Card>
          <Text variant="caption">{t('m.location.noPlaces')}</Text>
        </Card>
      ) : (
        <RowGroup>
          {(places.data ?? []).map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={p.name}
                subtitle={[
                  t('m.location.radius', { meters: p.radiusM }),
                  subscribedPlaces.has(p.id) ? t('m.location.notifying') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                left={<MapPin size={22} color={colors.primary} />}
                chevron
                onPress={() => {
                  openPlace(p);
                }}
              />
            </View>
          ))}
        </RowGroup>
      )}
    </ScrollView>
  );
}
