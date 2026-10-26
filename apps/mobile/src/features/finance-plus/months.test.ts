import { monthLabel, monthsBack, yearMonth } from './months';

describe('months', () => {
  it('formats and steps back across years', () => {
    expect(yearMonth(new Date(2026, 9, 26))).toBe('2026-10');
    expect(monthsBack(new Date(2026, 1, 28), 3)).toBe('2025-11');
  });
  it('labels months', () => {
    expect(monthLabel('2026-03', 'en-GB')).toBe('Mar');
  });
});
