import { router } from 'expo-router';
import { Plane } from 'lucide-react-native';
import { useState } from 'react';
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
  Segmented,
  Text,
} from '@/components/ui';
import { dayKey } from '@/features/calendar/dates';
import { useHousehold } from '@/features/household/household';
import { useTrips } from '@/features/travel/hooks';
import { daysBetween, tripPhase } from '@/features/travel/utils';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

type When = 'upcoming' | 'past' | 'all';

/** Trip list with a countdown for upcoming trips. */
export default function TripsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const [when, setWhen] = useState<When>('upcoming');
  const trips = useTrips(when);
  const today = dayKey(new Date());
  const range = (a: string, b: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).formatRange(
      new Date(`${a}T12:00:00`),
      new Date(`${b}T12:00:00`),
    );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-28"
        refreshControl={
          <RefreshControl refreshing={trips.isRefetching} onRefresh={() => void trips.refetch()} />
        }
      >
        <Segmented
          label={t('m.travel.filter')}
          value={when}
          onChange={setWhen}
          options={[
            { value: 'upcoming', label: t('m.travel.upcoming') },
            { value: 'past', label: t('m.travel.past') },
            { value: 'all', label: t('common.all') },
          ]}
        />
        {trips.isPending ? (
          <LoadingView />
        ) : trips.error && !trips.data ? (
          <ErrorState error={trips.error} onRetry={() => void trips.refetch()} />
        ) : trips.data.length === 0 ? (
          <EmptyState title={t('m.travel.empty')} message={t('m.travel.emptyHint')} />
        ) : (
          <RowGroup>
            {trips.data.map((trip, i) => {
              const phase = tripPhase(trip, today);
              const badge =
                phase === 'ongoing'
                  ? t('m.travel.ongoing')
                  : phase === 'upcoming'
                    ? t('m.travel.inDays', { count: daysBetween(today, trip.startDate) })
                    : null;
              return (
                <View key={trip.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={trip.name}
                    subtitle={[trip.destination, range(trip.startDate, trip.endDate)]
                      .filter(Boolean)
                      .join(' · ')}
                    left={<Plane size={22} color={colors.primary} />}
                    right={
                      badge ? (
                        <View className="rounded-full bg-surface-muted px-2 py-0.5">
                          <Text className="text-xs font-semibold">{badge}</Text>
                        </View>
                      ) : null
                    }
                    chevron
                    onPress={() => {
                      router.push({ pathname: '/travel/[tripId]', params: { tripId: trip.id } });
                    }}
                  />
                </View>
              );
            })}
          </RowGroup>
        )}
      </ScrollView>
      {can('travel.write') ? (
        <Fab
          label={t('m.travel.newTrip')}
          onPress={() => {
            router.push('/travel/new');
          }}
        />
      ) : null}
    </View>
  );
}
