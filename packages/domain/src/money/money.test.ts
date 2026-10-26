import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  allocateMoney,
  compareMoney,
  formatMoney,
  isCurrencyCode,
  minorToDecimalString,
  money,
  MoneyError,
  negate,
  parseAmountToMinor,
  splitEvenly,
  subtractMoney,
  sumMoney,
} from './money.js';

describe('money', () => {
  it('rejects non-integer minor amounts', () => {
    expect(() => money(1.5, 'EUR')).toThrow(MoneyError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'EUR')).toThrow(MoneyError);
  });

  it('adds and subtracts in the same currency', () => {
    expect(addMoney(money(150, 'EUR'), money(250, 'EUR'))).toEqual(money(400, 'EUR'));
    expect(subtractMoney(money(150, 'EUR'), money(250, 'EUR'))).toEqual(money(-100, 'EUR'));
    expect(sumMoney([money(1, 'EUR'), money(2, 'EUR')], 'EUR')).toEqual(money(3, 'EUR'));
  });

  it('refuses mixed currencies', () => {
    expect(() => addMoney(money(1, 'EUR'), money(1, 'CHF'))).toThrow(/Currency mismatch/);
  });

  it('negates without producing -0', () => {
    expect(Object.is(negate(money(0, 'EUR')).amountMinor, -0)).toBe(false);
  });

  it('compares', () => {
    expect(compareMoney(money(1, 'EUR'), money(2, 'EUR'))).toBe(-1);
    expect(compareMoney(money(2, 'EUR'), money(2, 'EUR'))).toBe(0);
    expect(compareMoney(money(3, 'EUR'), money(2, 'EUR'))).toBe(1);
  });

  it('splits 1 € three ways without losing a cent', () => {
    expect(splitEvenly(money(100, 'EUR'), 3).map((m) => m.amountMinor)).toEqual([34, 33, 33]);
    expect(splitEvenly(money(-100, 'EUR'), 3).map((m) => m.amountMinor)).toEqual([-34, -33, -33]);
  });

  it('allocation never creates or loses money (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e12, max: 1e12 }),
        fc
          .array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 8 })
          .filter((r) => r.some((x) => x > 0)),
        (amount, ratios) => {
          const parts = allocateMoney(money(amount, 'EUR'), ratios);
          expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(amount);
        },
      ),
    );
  });

  it('validates allocation input', () => {
    expect(() => allocateMoney(money(1, 'EUR'), [])).toThrow();
    expect(() => allocateMoney(money(1, 'EUR'), [0, 0])).toThrow();
    expect(() => allocateMoney(money(1, 'EUR'), [1.5])).toThrow();
    expect(() => splitEvenly(money(1, 'EUR'), 0)).toThrow();
  });

  it('formats German and English', () => {
    expect(formatMoney(money(-123456, 'EUR'))).toBe(`-1.234,56${String.fromCharCode(0xa0)}€`);
    expect(formatMoney(money(5, 'EUR'), 'en-US')).toBe('€0.05');
  });

  it('converts minor to exact decimal strings', () => {
    expect(minorToDecimalString(5, 2)).toBe('0.05');
    expect(minorToDecimalString(-120, 2)).toBe('-1.20');
    expect(minorToDecimalString(7, 0)).toBe('7');
  });

  it.each([
    ['1.234,56', 'de', 123456],
    ['-12,5', 'de', -1250],
    ['12,00-', 'de', -1200],
    ['+3', 'de', 300],
    ['1 234,56 €', 'de', 123456],
    ['1,234.56', 'en', 123456],
    ['-0.07', 'en', -7],
    [',5', 'de', 50],
    ['12,340', 'de', 1234],
    ['EUR 3,00', 'de', 300],
  ] as const)('parses %s (%s)', (input, style, expected) => {
    expect(parseAmountToMinor(input, 2, style)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1,234', '12,345'])('rejects %s', (input) => {
    expect(() => parseAmountToMinor(input, 2, 'de')).toThrow(MoneyError);
  });

  it('round-trips decimal strings (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (amount) => {
        expect(parseAmountToMinor(minorToDecimalString(amount, 2), 2, 'en')).toBe(amount);
      }),
    );
  });

  it('knows supported currencies', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
  });
});
