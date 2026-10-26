export interface Bar {
  label: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Vertical bars for consumption periods inside a `width` x `height` plot; values are the API's
 * decimal strings. Negative values (meter resets) are drawn as zero.
 */
export function layoutBars(
  periods: readonly { period: string; consumption: string }[],
  width: number,
  height: number,
  gap = 6,
): { bars: Bar[]; max: number } {
  const values = periods.map((p) => Math.max(0, Number(p.consumption) || 0));
  const max = Math.max(0, ...values);
  if (periods.length === 0 || width <= 0) return { bars: [], max };
  const slot = width / periods.length;
  const barWidth = Math.max(2, slot - gap);
  const bars = periods.map((p, i) => {
    const value = values[i] ?? 0;
    const h = max > 0 ? (value / max) * height : 0;
    return {
      label: p.period,
      value,
      x: i * slot + (slot - barWidth) / 2,
      y: height - h,
      width: barWidth,
      height: h,
    };
  });
  return { bars, max };
}
