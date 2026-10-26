import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Card, Divider, ErrorState, ListRow, LoadingView, RowGroup, Text } from '@/components/ui';
import { useMemberMap } from '@/features/household/household';
import { HistoryMap } from '@/features/location/history-map';
import { useLocationHistory } from '@/features/location/hooks';
import { distanceM } from '@/features/location/share';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

/** A member's positions over the last 24 hours: route on a map (native) and a list. */
export default function LocationHistoryScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const members = useMemberMap();
  const member = members.get(memberId);
  const history = useLocationHistory(memberId);
  const name = member?.displayName ?? '';
  const title = t('m.location.historyTitle', { name });

  if (history.isPending) return <LoadingView />;
  if (history.isError && !history.data)
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;

  const points = history.data;
  const timeFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distanceM(a, b);
  }
  const newestFirst = [...points].reverse();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching}
          onRefresh={() => void history.refetch()}
        />
      }
    >
      <Stack.Screen options={{ title }} />
      <Text variant="caption">{t('m.location.historyHint')}</Text>
      {points.length === 0 ? (
        <Card>
          <Text variant="caption">{t('m.location.historyEmpty')}</Text>
        </Card>
      ) : (
        <>
          <HistoryMap points={points} color={member?.color ?? colors.primary} />
          <Text variant="caption" accessibilityLiveRegion="polite">
            {t('m.location.historySummary', {
              count: points.length,
              km: numFmt.format(total / 1000),
            })}
          </Text>
          <RowGroup>
            {newestFirst.map((p, i) => (
              <View key={`${p.at}-${String(i)}`}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={timeFmt.format(new Date(p.at))}
                  subtitle={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ${t('m.location.accuracy', {
                    meters: Math.round(p.accuracyM),
                  })}`}
                />
              </View>
            ))}
          </RowGroup>
        </>
      )}
    </ScrollView>
  );
}
