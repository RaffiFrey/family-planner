import { type DecimalStyle, minorToDecimalString, parseAmountToMinor } from '@fp/domain/money';

/**
 * State machine behind the amount keypad. The value is kept as the string the user sees
 * ("12,5" in German, "12.5" in English) and only converted to integer minor units through
 * `parseAmountToMinor`, so no float ever touches a money value.
 */
export type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'decimal' | 'backspace' | 'clear';

export interface AmountFormat {
  /** Decimal places of the currency (2 for EUR). */
  exponent: number;
  style: DecimalStyle;
}

/** Largest amount the keypad accepts: 9 integer digits (just under one billion). */
const MAX_INT_DIGITS = 9;

export function decimalSeparator(style: DecimalStyle): string {
  return style === 'de' ? ',' : '.';
}

export function applyKeypadKey(
  value: string,
  key: KeypadKey,
  { exponent, style }: AmountFormat,
): string {
  const sep = decimalSeparator(style);
  if (key === 'clear') return '';
  if (key === 'backspace') return value.slice(0, -1);
  const [intPart = '', fracPart] = value.split(sep);
  if (key === 'decimal') {
    if (exponent === 0 || fracPart !== undefined) return value;
    return `${intPart === '' ? '0' : intPart}${sep}`;
  }
  // Digit
  if (fracPart !== undefined) {
    if (fracPart.length >= exponent) return value;
    return `${intPart}${sep}${fracPart}${key}`;
  }
  if (intPart === '0') return key;
  if (intPart.length >= MAX_INT_DIGITS) return value;
  return `${intPart}${key}`;
}

export type Direction = 'expense' | 'income';

/**
 * Minor units for the keypad value: negative for expenses, positive for income.
 * Returns null while the input is empty or zero.
 */
export function amountInputToMinor(
  value: string,
  direction: Direction,
  { exponent, style }: AmountFormat,
): number | null {
  if (value.trim() === '') return null;
  let minor: number;
  try {
    minor = parseAmountToMinor(value, exponent, style);
  } catch {
    return null;
  }
  if (minor === 0) return null;
  const abs = Math.abs(minor);
  return direction === 'expense' ? -abs : abs;
}

/** Keypad string for an existing amount (absolute value; the sign is the direction toggle). */
export function minorToAmountInput(amountMinor: number, { exponent, style }: AmountFormat): string {
  const decimal = minorToDecimalString(Math.abs(amountMinor), exponent);
  const [i = '0', f] = decimal.split('.');
  if (f === undefined) return i;
  const trimmed = f.replace(/0+$/, '');
  return trimmed === '' ? i : `${i}${decimalSeparator(style)}${trimmed}`;
}
