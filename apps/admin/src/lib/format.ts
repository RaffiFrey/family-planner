import { categoryLabel, translate } from '@fp/i18n';
import { format, formatDistanceToNowStrict } from 'date-fns';

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'yyyy-MM-dd HH:mm');
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'yyyy-MM-dd');
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${formatDistanceToNowStrict(d)} ago`;
}

const nf = new Intl.NumberFormat('en-GB');
export function fmtNumber(n: number): string {
  return nf.format(n);
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i] ?? 'PB'}`;
}

/** Plan names from the shared i18n bundle (English UI for staff). */
export function planLabel(plan: string): string {
  return translate('en', `plans.${plan}`);
}

/** Household member roles from the shared i18n bundle. */
export function memberRoleLabel(role: string): string {
  return translate('en', `roles.${role}`);
}

/**
 * Finance category label in German (customer-facing). System categories are translated via
 * their stable i18n `key`; categories without a key fall back to their stored `name`.
 */
export function categoryName(category: { key?: string | null; name: string }): string {
  return categoryLabel('de', category);
}

const EUR_EXPONENT = 2;

/**
 * Exact decimal euro input -> minor units (cents), without floating point.
 * Accepts "12", "12,5", "12.50", "1.234,56" / "1,234.56" (the last separator followed by
 * 1-2 digits is the decimal separator). Returns null for anything else.
 */
export function parseEuroToMinor(input: string): number | null {
  const s = input
    .trim()
    .replace(/[\s€]/g, '')
    .replace(/^EUR|EUR$/i, '');
  if (s === '') return null;
  const m = /^(\d{1,3}(?:([.,])\d{3})*|\d+)(?:([.,])(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [, intRaw = '', thousandsSep, decimalSep, fracRaw = ''] = m;
  if (thousandsSep && decimalSep === thousandsSep) return null;
  const intDigits = thousandsSep ? intRaw.split(thousandsSep).join('') : intRaw;
  const digits = `${intDigits}${fracRaw.padEnd(EUR_EXPONENT, '0')}`.replace(/^0+(?=\d)/, '');
  const minor = Number(digits);
  return Number.isSafeInteger(minor) ? minor : null;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
/** Formats minor units for display; integer division keeps it exact. */
export function fmtEuroMinor(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = Math.abs(minor % 100);
  return eur.format(Number(`${whole}.${String(cents).padStart(2, '0')}`));
}
