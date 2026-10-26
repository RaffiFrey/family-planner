import { allocateByWeights, chartScale } from './chart-scale';

describe('chartScale', () => {
  it('maps max to the top and min to the bottom', () => {
    const s = chartScale(-50, 150, 100);
    expect(s.y(150)).toBe(0);
    expect(s.y(-50)).toBe(100);
    expect(s.y(0)).toBe(75);
  });
  it('handles a flat series', () => {
    expect(Number.isFinite(chartScale(0, 0, 100).y(0))).toBe(true);
  });
});

describe('allocateByWeights', () => {
  it('sums exactly', () => {
    expect(allocateByWeights(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateByWeights(1000, [50, 25, 25])).toEqual([500, 250, 250]);
    expect(allocateByWeights(100, [0, 0])).toEqual([0, 0]);
  });
});
