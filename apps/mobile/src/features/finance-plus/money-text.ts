import { type DecimalStyle, minorToDecimalString, parseAmountToMinor } from '@fp/domain/money';

/**
 * Parses a typed amount into positive minor units (null when empty, invalid or zero).
 * Phone keyboards often only offer one separator, so "12.5" is read as a decimal in German too
 * when it cannot be a thousands group.
 */
export function parseMoneyText(text: string, exponent: number, style: DecimalStyle): number | null {
  let s = text.trim();
  if (s === '') return null;
  if (style === 'de' && !s.includes(',') && /\.\d{1,2}$/.test(s))
    s = s.replace(/\.(\d{1,2})$/, ',$1');
  if (style === 'en' && !s.includes('.') && /,\d{1,2}$/.test(s))
    s = s.replace(/,(\d{1,2})$/, '.$1');
  try {
    const minor = Math.abs(parseAmountToMinor(s, exponent, style));
    return minor === 0 ? null : minor;
  } catch {
    return null;
  }
}

/** Editable text for an amount ("12,50" / "12.50"). */
export function minorToMoneyText(minor: number, exponent: number, style: DecimalStyle): string {
  const s = minorToDecimalString(Math.abs(minor), exponent);
  return style === 'de' ? s.replace('.', ',') : s;
}

/** Splits an amount evenly; the first parties get the remaining cents (matches the server). */
export function previewEqualSplit(amountMinor: number, parties: number): number[] {
  if (parties <= 0) return [];
  const base = Math.floor(amountMinor / parties);
  const rest = amountMinor - base * parties;
  return Array.from({ length: parties }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Today as YYYY-MM-DD in local time. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
