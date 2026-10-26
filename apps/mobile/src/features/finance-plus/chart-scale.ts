/** Linear scale mapping [min, max] to [height, 0] pixels (SVG y grows downwards). */
export function chartScale(min: number, max: number, height: number): { y: (v: number) => number } {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo || 1;
  return { y: (v: number) => ((hi - v) / span) * height };
}

/** Splits a total into parts proportional to weights (largest remainder; sums exactly). */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    rest--;
  }
  return out;
}
