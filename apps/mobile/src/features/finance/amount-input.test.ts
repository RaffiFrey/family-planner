import {
  type AmountFormat,
  amountInputToMinor,
  applyKeypadKey,
  type KeypadKey,
  minorToAmountInput,
} from './amount-input';

const de = { exponent: 2, style: 'de' as const };
const en = { exponent: 2, style: 'en' as const };

function type(keys: KeypadKey[], format: AmountFormat = de): string {
  return keys.reduce((v, k) => applyKeypadKey(v, k, format), '');
}

describe('applyKeypadKey', () => {
  it('builds a German amount', () => {
    expect(type(['1', '2', 'decimal', '5'])).toBe('12,5');
  });

  it('uses a dot in English', () => {
    expect(type(['1', 'decimal', '9', '9'], en)).toBe('1.99');
  });

  it('prefixes a leading decimal with zero and allows only one separator', () => {
    expect(type(['decimal', '5', 'decimal'])).toBe('0,5');
  });

  it('limits decimals to the currency exponent', () => {
    expect(type(['3', 'decimal', '1', '2', '3'])).toBe('3,12');
    expect(type(['3', 'decimal', '1'], { exponent: 0, style: 'de' })).toBe('31');
  });

  it('drops leading zeros and caps integer digits', () => {
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(Array<KeypadKey>(12).fill('9'))).toBe('999999999');
  });

  it('supports backspace and clear', () => {
    expect(type(['4', '2', 'backspace'])).toBe('4');
    expect(type(['4', '2', 'clear'])).toBe('');
  });
});

describe('amountInputToMinor', () => {
  it('converts to integer minor units with the direction as sign', () => {
    expect(amountInputToMinor('12,5', 'expense', de)).toBe(-1250);
    expect(amountInputToMinor('12,5', 'income', de)).toBe(1250);
    expect(amountInputToMinor('1234.56', 'income', en)).toBe(123456);
    expect(amountInputToMinor('0,1', 'income', de)).toBe(10);
  });

  it('avoids float rounding errors', () => {
    expect(amountInputToMinor('0,29', 'income', de)).toBe(29);
    expect(amountInputToMinor('1,15', 'income', de)).toBe(115);
  });

  it('returns null for empty, zero or invalid input', () => {
    expect(amountInputToMinor('', 'expense', de)).toBeNull();
    expect(amountInputToMinor('0,', 'expense', de)).toBeNull();
    expect(amountInputToMinor('1,2,3', 'expense', de)).toBeNull();
  });
});

describe('minorToAmountInput', () => {
  it('formats existing amounts for editing', () => {
    expect(minorToAmountInput(-1250, de)).toBe('12,5');
    expect(minorToAmountInput(100, de)).toBe('1');
    expect(minorToAmountInput(123456, en)).toBe('1234.56');
  });
});
