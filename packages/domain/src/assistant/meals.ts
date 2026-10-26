import { normalizeName } from './names.js';

export const MAX_PANTRY_ITEMS = 50;

/** Trims, de-duplicates (case/accent-insensitive) and caps the pantry list. */
export function normalizeIngredients(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const text = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeName(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_PANTRY_ITEMS) break;
  }
  return out;
}

/** Crude German/English singular form, enough to match "Eier" ↔ "Ei", "tomatoes" ↔ "tomato". */
function stem(word: string): string {
  return word.replace(/(oes|es|en|er|n|s|e)$/, '');
}

/** True when an ingredient line ("200 g Spaghetti") refers to a pantry item ("spaghetti"). */
export function inPantry(ingredient: string, pantry: readonly string[]): boolean {
  const words = new Set(normalizeName(ingredient).split(' ').filter(Boolean).map(stem));
  return pantry.some((p) => {
    const pw = normalizeName(p).split(' ').filter(Boolean).map(stem);
    return pw.length > 0 && pw.every((w) => w.length > 1 && words.has(w));
  });
}

export interface RecipeIdea {
  title: string;
  ingredients: { name: string; quantity: string | null }[];
}

/**
 * Marks which ingredients of each idea are already in the pantry and lists what's missing —
 * computed here rather than trusted from the model.
 */
export function annotatePantry<R extends RecipeIdea>(
  recipes: readonly R[],
  pantry: readonly string[],
): (Omit<R, 'ingredients'> & {
  ingredients: { name: string; quantity: string | null; inPantry: boolean }[];
  missing: string[];
})[] {
  return recipes.map((r) => {
    const ingredients = r.ingredients.map((i) => ({ ...i, inPantry: inPantry(i.name, pantry) }));
    return {
      ...r,
      ingredients,
      missing: ingredients.filter((i) => !i.inPantry).map((i) => i.name),
    };
  });
}
