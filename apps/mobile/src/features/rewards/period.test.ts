import { isCurrentPeriod, periodAt, periodLabel, shiftPeriod } from './period';

describe('leaderboard periods', () => {
  const wed = new Date(2026, 9, 21); // Wed 21 Oct 2026

  it('shifts by weeks and months', () => {
    expect(periodAt(shiftPeriod(wed, 'week', -1))).toBe('2026-10-14');
    expect(periodAt(shiftPeriod(wed, 'month', 1))).toBe('2026-11-21');
  });

  it('detects the current period', () => {
    expect(isCurrentPeriod(new Date(2026, 9, 19), 'week', wed)).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 9, 18), 'week', wed)).toBe(false);
    expect(isCurrentPeriod(new Date(2026, 9, 1), 'month', wed)).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 8, 30), 'month', wed)).toBe(false);
  });

  it('formats labels', () => {
    expect(periodLabel('week', new Date(2026, 9, 19), new Date(2026, 9, 25), 'de-DE', 'KW')).toBe(
      'KW 43 · 19.10.–25.10.',
    );
    expect(periodLabel('month', new Date(2026, 9, 1), new Date(2026, 9, 31), 'de-DE', 'KW')).toBe(
      'Oktober 2026',
    );
  });
});
