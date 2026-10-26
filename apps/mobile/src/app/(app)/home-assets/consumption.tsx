import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import {
  Card,
  ChipSelect,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  RowGroup,
  ScreenScroll,
  Segmented,
  Text,
} from '@/components/ui';
import { type Bar, layoutBars } from '@/features/home-assets/chart';
import { useAsset, useConsumption, useReadings } from '@/features/home-assets/hooks';
import { type MeterType, METER_TYPES } from '@/features/home-assets/meters';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

type Period = 'month' | 'year';
const CHART_HEIGHT = 160;

/** Consumption per month/year with a bar chart, total and average per day. */
export default function ConsumptionScreen() {
  const { assetId, meterType: initial } = useLocalSearchParams<{
    assetId: string;
    meterType?: string;
  }>();
  const { t } = useTranslation();
  const asset = useAsset(assetId);
  const readings = useReadings(assetId);
  const used = METER_TYPES.filter((m) => readings.data?.some((r) => r.meterType === m));
  const [picked, setPicked] = useState<MeterType | null>(
    METER_TYPES.find((m) => m === initial) ?? null,
  );
  const meterType = picked ?? used[0] ?? 'electricity';
  const [period, setPeriod] = useState<Period>('month');

  if (readings.isPending) return <LoadingView />;
  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: t('m.homeAssets.consumptionFor', { name: asset.data?.name ?? '' }) }}
      />
      {used.length === 0 ? (
        <EmptyState title={t('m.homeAssets.noReadings')} />
      ) : (
        <>
          {used.length > 1 ? (
            <ChipSelect
              label={t('m.homeAssets.meterType')}
              options={used.map((m) => ({ value: m, label: t(`m.homeAssets.meterTypes.${m}`) }))}
              value={meterType}
              onChange={setPicked}
            />
          ) : null}
          <Segmented<Period>
            label={t('m.homeAssets.period')}
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'month', label: t('m.homeAssets.perMonth') },
              { value: 'year', label: t('m.homeAssets.perYear') },
            ]}
          />
          <Stats assetId={assetId} meterType={meterType} period={period} />
        </>
      )}
    </ScreenScroll>
  );
}

function Stats({
  assetId,
  meterType,
  period,
}: {
  assetId: string;
  meterType: MeterType;
  period: Period;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const stats = useConsumption(assetId, meterType, period);
  const [width, setWidth] = useState(0);
  const num = (v: string | number) =>
    Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });

  if (stats.isPending) return <LoadingView />;
  if (stats.error && !stats.data)
    return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  const unit = s.unit ?? '';
  if (s.periods.length === 0) return <EmptyState title={t('m.homeAssets.notEnoughReadings')} />;
  const { bars } = layoutBars(s.periods, width, CHART_HEIGHT);
  const labelFor = (p: string) => (period === 'month' ? p.slice(5) : p);

  return (
    <View className="gap-4">
      <Card>
        <View className="flex-row justify-between gap-4">
          <View className="flex-1">
            <Text variant="caption">{t('m.homeAssets.total')}</Text>
            <Text className="text-lg font-semibold">{`${num(s.total)} ${unit}`}</Text>
          </View>
          <View className="flex-1">
            <Text variant="caption">{t('m.homeAssets.avgPerDay')}</Text>
            <Text className="text-lg font-semibold">
              {s.avgPerDay !== null ? `${num(s.avgPerDay)} ${unit}` : '–'}
            </Text>
          </View>
        </View>
      </Card>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('m.homeAssets.chartLabel', {
          values: s.periods.map((p) => `${p.period}: ${num(p.consumption)} ${unit}`).join(', '),
        })}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
        }}
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              <Line
                x1={0}
                x2={width}
                y1={CHART_HEIGHT - 0.5}
                y2={CHART_HEIGHT - 0.5}
                stroke={colors.border}
                strokeWidth={1}
              />
              {bars.map((b) =>
                b.height > 0 ? <Path key={b.label} d={barPath(b)} fill={colors.primary} /> : null,
              )}
            </Svg>
            {bars.length <= 12 ? (
              <View className="flex-row" importantForAccessibility="no-hide-descendants">
                {bars.map((b) => (
                  <Text
                    key={`l-${b.label}`}
                    variant="caption"
                    className="flex-1 text-center text-xs"
                    numberOfLines={1}
                  >
                    {labelFor(b.label)}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      <RowGroup>
        {[...s.periods].reverse().map((p, i) => (
          <View key={p.period}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={`${p.period}: ${num(p.consumption)} ${unit}`}
              subtitle={t('m.homeAssets.periodDetail', {
                perDay: `${num(p.perDay)} ${unit}`,
                days: num(p.days),
              })}
            />
          </View>
        ))}
      </RowGroup>
    </View>
  );
}

/** Bar as a path (top corners rounded by 3px). */
function barPath(b: Bar): string {
  const r = Math.min(3, b.width / 2, b.height);
  const bottom = b.y + b.height;
  return [
    `M${b.x},${bottom}`,
    `V${b.y + r}`,
    `Q${b.x},${b.y} ${b.x + r},${b.y}`,
    `H${b.x + b.width - r}`,
    `Q${b.x + b.width},${b.y} ${b.x + b.width},${b.y + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}
