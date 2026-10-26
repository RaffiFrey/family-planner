import { monthRangeInZone, toWallTime, yearRangeInZone } from '../time/time.js';

/**
 * Meter readings (electricity, gas, water, heating, mileage) and consumption statistics.
 * Values are decimal strings with up to 3 decimals; math runs on integer thousandths.
 */
export interface MeterReadingInput {
  readAt: Date;
  value: string;
}

const SCALE = 1000;
const DAY_MS = 86_400_000;
const DECIMAL_RE = /^-?\d{1,12}(\.\d{1,3})?$/;

export function isMeterValue(s: string): boolean {
  return DECIMAL_RE.test(s);
}

/** "123.45" → 123450 (thousandths). */
export function parseMeterValue(s: string): number {
  if (!DECIMAL_RE.test(s)) throw new Error(`Invalid meter value "${s}"`);
  const neg = s.startsWith('-');
  const [int = '0', frac = ''] = (neg ? s.slice(1) : s).split('.');
  const v = Number(int) * SCALE + Number(frac.padEnd(3, '0'));
  return neg ? -v : v;
}

/** 123450 → "123.45". */
export function formatMeterValue(milli: number): string {
  const v = Math.round(milli);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const int = Math.floor(abs / SCALE);
  const frac = String(abs % SCALE)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return frac ? `${sign}${String(int)}.${frac}` : `${sign}${String(int)}`;
}

export interface ConsumptionInterval {
  from: Date;
  to: Date;
  days: number;
  consumption: string;
  perDay: string;
  /** The meter went backwards (replaced or reset); this interval is excluded from totals. */
  reset: boolean;
}

export interface ConsumptionPeriod {
  /** "2026-03" or "2026". */
  period: string;
  consumption: string;
  /** Days of the period covered by readings. */
  days: number;
  perDay: string;
}

export interface ConsumptionStats {
  intervals: ConsumptionInterval[];
  total: string;
  days: number;
  avgPerDay: string | null;
  periods: ConsumptionPeriod[];
}

interface Segment {
  from: number;
  to: number;
  milli: number;
}

function periodStarts(
  from: Date,
  to: Date,
  period: 'month' | 'year',
  timeZone: string,
): { key: string; start: number; end: number }[] {
  const out: { key: string; start: number; end: number }[] = [];
  const w = toWallTime(from, timeZone);
  let year = w.year;
  let month = w.month;
  for (let guard = 0; guard < 2400; guard++) {
    const range =
      period === 'month'
        ? monthRangeInZone(year, month, timeZone)
        : yearRangeInZone(year, timeZone);
    if (range.start >= to) break;
    out.push({
      key: period === 'month' ? `${String(year)}-${String(month).padStart(2, '0')}` : String(year),
      start: range.start.getTime(),
      end: range.end.getTime(),
    });
    if (period === 'year') year++;
    else if (month === 12) {
      year++;
      month = 1;
    } else month++;
  }
  return out;
}

/**
 * Divisor for per-day rates: spans shorter than a day count as one day, so two readings
 * minutes apart don't extrapolate to an absurd daily consumption.
 */
function rateDays(days: number): number {
  return Math.max(days, 1);
}

/**
 * Consumption between consecutive readings and, distributed linearly over time,
 * per calendar month or year in `timeZone`.
 */
export function consumptionStats(
  readings: readonly MeterReadingInput[],
  options: { period?: 'month' | 'year'; timeZone?: string } = {},
): ConsumptionStats {
  const period = options.period ?? 'month';
  const timeZone = options.timeZone ?? 'Europe/Berlin';
  const sorted = [...readings].sort((a, b) => a.readAt.getTime() - b.readAt.getTime());
  const intervals: ConsumptionInterval[] = [];
  const segments: Segment[] = [];
  let totalMilli = 0;
  let totalMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as MeterReadingInput;
    const b = sorted[i] as MeterReadingInput;
    const ms = b.readAt.getTime() - a.readAt.getTime();
    if (ms <= 0) continue;
    const milli = parseMeterValue(b.value) - parseMeterValue(a.value);
    const reset = milli < 0;
    const days = ms / DAY_MS;
    intervals.push({
      from: a.readAt,
      to: b.readAt,
      days: Math.round(days * 100) / 100,
      consumption: formatMeterValue(reset ? 0 : milli),
      perDay: formatMeterValue(reset ? 0 : milli / rateDays(days)),
      reset,
    });
    if (reset) continue;
    totalMilli += milli;
    totalMs += ms;
    segments.push({ from: a.readAt.getTime(), to: b.readAt.getTime(), milli });
  }
  const periods: ConsumptionPeriod[] = [];
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first && last) {
    for (const p of periodStarts(new Date(first.from), new Date(last.to), period, timeZone)) {
      let milli = 0;
      let covered = 0;
      for (const s of segments) {
        const overlap = Math.min(s.to, p.end) - Math.max(s.from, p.start);
        if (overlap <= 0) continue;
        milli += (s.milli * overlap) / (s.to - s.from);
        covered += overlap;
      }
      if (covered === 0) continue;
      const days = covered / DAY_MS;
      periods.push({
        period: p.key,
        consumption: formatMeterValue(milli),
        days: Math.round(days * 100) / 100,
        perDay: formatMeterValue(milli / rateDays(days)),
      });
    }
  }
  const days = totalMs / DAY_MS;
  return {
    intervals,
    total: formatMeterValue(totalMilli),
    days: Math.round(days * 100) / 100,
    avgPerDay: totalMs > 0 ? formatMeterValue(totalMilli / rateDays(days)) : null,
    periods,
  };
}
