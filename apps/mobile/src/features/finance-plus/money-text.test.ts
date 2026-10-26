import { minorToMoneyText, parseMoneyText, previewEqualSplit, todayKey } from './money-text';

describe('parseMoneyText', () => {
  it.each([
    ['12,50', 'de', 1250],
    ['12.5', 'de', 1250],
    ['1.234,56', 'de', 123456],
    ['1.234', 'de', 123400],
    ['12.50', 'en', 1250],
    ['12,5', 'en', 1250],
    ['-7', 'de', 700],
  ] as const)('parses %s (%s)', (text, style, expected) => {
    expect(parseMoneyText(text, 2, style)).toBe(expected);
  });

  it.each(['', '0', 'abc', '1,2,3'])('rejects %s', (text) => {
    expect(parseMoneyText(text, 2, 'de')).toBeNull();
  });
});

describe('minorToMoneyText', () => {
  it('formats with the locale separator', () => {
    expect(minorToMoneyText(1250, 2, 'de')).toBe('12,50');
    expect(minorToMoneyText(-1250, 2, 'en')).toBe('12.50');
  });
});

describe('previewEqualSplit', () => {
  it('distributes remaining cents', () => {
    expect(previewEqualSplit(1000, 3)).toEqual([334, 333, 333]);
    expect(previewEqualSplit(900, 3)).toEqual([300, 300, 300]);
    expect(previewEqualSplit(100, 0)).toEqual([]);
  });
});

describe('todayKey', () => {
  it('uses local date parts', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
