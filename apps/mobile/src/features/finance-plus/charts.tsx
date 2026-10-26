import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { chartScale } from './chart-scale';

const HEIGHT = 180;

function barPath(x: number, y: number, w: number, h: number): string {
  return `M${String(x)} ${String(y)}h${String(w)}v${String(h)}h${String(-w)}Z`;
}
const PAD = { top: 12, bottom: 24, left: 4, right: 4 };

export interface Series {
  name: string;
  color: string;
}

function useWidth() {
  const [width, setWidth] = useState(0);
  return {
    width,
    onLayout: (e: { nativeEvent: { layout: { width: number } } }) => {
      setWidth(Math.round(e.nativeEvent.layout.width));
    },
  };
}

function Legend({ series }: { series: readonly Series[] }) {
  if (series.length < 2) return null;
  return (
    <View className="flex-row flex-wrap gap-3" importantForAccessibility="no-hide-descendants">
      {series.map((s) => (
        <View key={s.name} className="flex-row items-center gap-1">
          <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
          <Text variant="caption">{s.name}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Grouped bar chart (e.g. this year vs. last year per month). The graphic is hidden from screen
 * readers; `summary` describes it instead and callers render the numbers as text too.
 */
export function BarChart({
  labels,
  series,
  values,
  summary,
}: {
  labels: readonly string[];
  series: readonly Series[];
  /** values[seriesIndex][labelIndex] */
  values: readonly (readonly number[])[];
  summary: string;
}) {
  const colors = useColors();
  const { width, onLayout } = useWidth();
  const all = values.flat();
  const scale = chartScale(Math.min(0, ...all), Math.max(0, ...all), HEIGHT - PAD.top - PAD.bottom);
  const groupWidth = labels.length > 0 ? (width - PAD.left - PAD.right) / labels.length : 0;
  const barWidth = Math.max(2, (groupWidth * 0.8) / Math.max(1, series.length));
  const y = (v: number) => PAD.top + scale.y(v);
  return (
    <View className="gap-2" accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View onLayout={onLayout} importantForAccessibility="no-hide-descendants">
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(0)}
              y2={y(0)}
              stroke={colors.border}
              strokeWidth={1}
            />
            {labels.map((label, i) => {
              const gx = PAD.left + i * groupWidth + groupWidth * 0.1;
              return [
                ...series.map((s, si) => {
                  const v = values[si]?.[i] ?? 0;
                  const top = Math.min(y(v), y(0));
                  return (
                    <Path
                      key={`${label}-${s.name}`}
                      d={barPath(
                        gx + si * barWidth,
                        top,
                        barWidth - 1,
                        Math.max(1, Math.abs(y(v) - y(0))),
                      )}
                      fill={s.color}
                    />
                  );
                }),
                labels.length <= 12 ? (
                  <G
                    key={`${label}-label`}
                    transform={`translate(${String(PAD.left + i * groupWidth + groupWidth / 2)} ${String(HEIGHT - 6)})`}
                  >
                    <SvgText fontSize={10} fill={colors.textMuted} textAnchor="middle">
                      {label}
                    </SvgText>
                  </G>
                ) : null,
              ];
            })}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <Legend series={series} />
    </View>
  );
}

/** Single-series line chart (e.g. net worth per month end). */
export function LineChart({
  labels,
  values,
  color,
  summary,
}: {
  labels: readonly string[];
  values: readonly number[];
  color: string;
  summary: string;
}) {
  const colors = useColors();
  const { width, onLayout } = useWidth();
  const scale = chartScale(
    Math.min(...values, 0),
    Math.max(...values, 0),
    HEIGHT - PAD.top - PAD.bottom,
  );
  const step = values.length > 1 ? (width - PAD.left - PAD.right - 8) / (values.length - 1) : 0;
  const x = (i: number) => PAD.left + 4 + i * step;
  const y = (v: number) => PAD.top + scale.y(v);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const every = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View onLayout={onLayout} importantForAccessibility="no-hide-descendants">
        {width > 0 && values.length > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(0)}
              y2={y(0)}
              stroke={colors.border}
              strokeWidth={1}
            />
            <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} />
            {values.map((v, i) => (
              <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill={color} />
            ))}
            {labels.map((label, i) =>
              i % every === 0 ? (
                <G key={label} transform={`translate(${String(x(i))} ${String(HEIGHT - 6)})`}>
                  <SvgText fontSize={10} fill={colors.textMuted} textAnchor="middle">
                    {label}
                  </SvgText>
                </G>
              ) : null,
            )}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
    </View>
  );
}
