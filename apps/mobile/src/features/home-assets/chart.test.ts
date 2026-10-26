import { layoutBars } from './chart';

describe('layoutBars', () => {
  it('scales bars to the largest period', () => {
    const { bars, max } = layoutBars(
      [
        { period: '2026-01', consumption: '100.5' },
        { period: '2026-02', consumption: '201' },
        { period: '2026-03', consumption: '-5' },
      ],
      300,
      100,
      0,
    );
    expect(max).toBe(201);
    expect(bars.map((b) => Math.round(b.height))).toEqual([50, 100, 0]);
    expect(bars[1]?.x).toBe(100);
    expect(bars[1]?.y).toBe(0);
  });

  it('handles empty input', () => {
    expect(layoutBars([], 300, 100).bars).toEqual([]);
  });
});
