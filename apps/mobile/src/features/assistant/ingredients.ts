/** Splits "Nudeln, Tomaten\nKäse" into ingredients. */
export function parseIngredients(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.slice(0, 80)),
    ),
  ].slice(0, 50);
}
