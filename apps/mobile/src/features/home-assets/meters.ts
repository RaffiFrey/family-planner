export const METER_TYPES = ['electricity', 'gas', 'water', 'heating', 'mileage', 'other'] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const DEFAULT_UNITS: Record<MeterType, string> = {
  electricity: 'kWh',
  gas: 'm³',
  water: 'm³',
  heating: 'kWh',
  mileage: 'km',
  other: '',
};

/** Meter types that fit an asset kind (vehicles have a mileage, homes have utility meters). */
export function meterTypesFor(kind: 'home' | 'vehicle' | 'appliance' | 'other'): MeterType[] {
  if (kind === 'vehicle') return ['mileage', 'other'];
  if (kind === 'home') return ['electricity', 'gas', 'water', 'heating', 'other'];
  return [...METER_TYPES];
}

/**
 * "12.345,6" / "12345.6" / "12 345" → "12345.6" as the API expects (up to 3 decimals);
 * null when it is not a valid reading.
 */
export function normalizeMeterValue(input: string): string | null {
  let s = input.trim().replace(/[\s']/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // German style: dots group thousands, comma is the decimal separator.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    s = s.replace(/,/g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}\.\d{3}$/.test(s) && !s.startsWith('0')) {
    // "12.345" in German means twelve thousand.
    s = s.replace('.', '');
  }
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(s)) return null;
  return s;
}
