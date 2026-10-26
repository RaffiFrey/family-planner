import {
  add,
  allocate,
  dinero,
  type Dinero,
  type DineroCurrency,
  subtract,
  toSnapshot,
} from 'dinero.js';
import * as currencies from 'dinero.js/currencies';

/**
 * Money is always an integer amount of minor units (cents) plus an ISO 4217 code.
 * Floats are never used for money (ADR-0004).
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export const SUPPORTED_CURRENCIES = [
  'EUR',
  'CHF',
  'USD',
  'GBP',
  'PLN',
  'CZK',
  'DKK',
  'SEK',
  'NOK',
  'HUF',
] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export class MoneyError extends Error {
  override name = 'MoneyError';
}

function currencyOf(code: CurrencyCode): DineroCurrency<number> {
  return (currencies as unknown as Record<string, DineroCurrency<number>>)[
    code
  ] as DineroCurrency<number>;
}

export function currencyExponent(code: CurrencyCode): number {
  return currencyOf(code).exponent;
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(
      `Amount must be a safe integer of minor units, got ${String(amountMinor)}`,
    );
  }
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  assertMinor(amountMinor);
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency };
}

export function zero(currency: CurrencyCode): Money {
  return { amountMinor: 0, currency };
}

function toDinero(m: Money): Dinero<number> {
  assertMinor(m.amountMinor);
  return dinero({ amount: m.amountMinor, currency: currencyOf(m.currency) });
}

function fromDinero(d: Dinero<number>): Money {
  const snap = toSnapshot(d);
  return money(snap.amount, snap.currency.code as CurrencyCode);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return fromDinero(add(toDinero(a), toDinero(b)));
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return fromDinero(subtract(toDinero(a), toDinero(b)));
}

export function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

export function absMoney(m: Money): Money {
  return money(Math.abs(m.amountMinor), m.currency);
}

export function sumMoney(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => addMoney(acc, m), zero(currency));
}

/**
 * Splits an amount by integer ratios without losing or creating a cent.
 * Remainders go to the first shares (via dinero's allocate).
 */
export function allocateMoney(m: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) throw new MoneyError('At least one ratio is required');
  if (ratios.some((r) => !Number.isInteger(r) || r < 0)) {
    throw new MoneyError('Ratios must be non-negative integers');
  }
  if (ratios.every((r) => r === 0)) throw new MoneyError('At least one ratio must be positive');
  const parts = allocate(toDinero(absMoney(m)), [...ratios]).map(fromDinero);
  return m.amountMinor < 0 ? parts.map(negate) : parts;
}

/** Splits evenly between `n` parties, e.g. a shared expense. */
export function splitEvenly(m: Money, n: number): Money[] {
  if (!Number.isInteger(n) || n < 1) throw new MoneyError('n must be a positive integer');
  return allocateMoney(
    m,
    Array.from({ length: n }, () => 1),
  );
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
}

/** Exact decimal string ("-12.34") without going through floating point. */
export function minorToDecimalString(amountMinor: number, exponent: number): string {
  assertMinor(amountMinor);
  const negative = amountMinor < 0;
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const intPart = exponent === 0 ? digits : digits.slice(0, -exponent);
  const frac = exponent === 0 ? '' : `.${digits.slice(-exponent)}`;
  return `${negative ? '-' : ''}${intPart}${frac}`;
}

export function formatMoney(m: Money, locale = 'de-DE'): string {
  const exponent = currencyExponent(m.currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl accepts exact decimal strings, which avoids float rounding for large values.
  return formatter.format(minorToDecimalString(m.amountMinor, exponent) as `${number}`);
}

export type DecimalStyle = 'de' | 'en';

/**
 * Parses user/bank formatted amounts ("1.234,56", "-12,5", "1,234.56", "12,00-") into minor units.
 * `style` decides which character is the decimal separator.
 */
export function parseAmountToMinor(
  input: string,
  exponent: number,
  style: DecimalStyle = 'de',
): number {
  let s = input
    .trim()
    .replace(/[\s'€$£]/g, '')
    .replace(/^[A-Z]{3}|[A-Z]{3}$/gi, '');
  if (s === '') throw new MoneyError('Cannot parse empty amount');
  let negative = false;
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-') || s.startsWith(String.fromCharCode(0x2212))) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const [thousands, decimal] = style === 'de' ? ['.', ','] : [',', '.'];
  s = s.split(thousands).join('');
  const parts = s.split(decimal);
  if (parts.length > 2 || !parts.every((p) => /^\d*$/.test(p)) || parts.join('') === '') {
    throw new MoneyError(`Cannot parse amount "${input}"`);
  }
  const intPart = parts[0] === '' ? '0' : (parts[0] as string);
  const fracRaw = parts[1] ?? '';
  if (fracRaw.length > exponent && /[1-9]/.test(fracRaw.slice(exponent))) {
    throw new MoneyError(`Amount "${input}" has more than ${exponent} decimals`);
  }
  const frac = fracRaw.slice(0, exponent).padEnd(exponent, '0');
  const minor = Number(`${intPart}${frac}`);
  assertMinor(minor);
  return negative && minor !== 0 ? -minor : minor;
}
