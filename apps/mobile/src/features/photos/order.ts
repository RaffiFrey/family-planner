/** Returns a copy of `ids` with the element at `from` moved to `to` (clamped). */
export function moveItem(ids: readonly string[], from: number, to: number): string[] {
  const out = [...ids];
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [moved] = out.splice(from, 1);
  if (moved === undefined) return out;
  out.splice(target, 0, moved);
  return out;
}
