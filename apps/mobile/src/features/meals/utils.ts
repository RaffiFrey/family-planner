import type { MealPlanEntry, RecipeIngredient } from '@fp/contracts';
import { addDays, format, getISOWeek, startOfISOWeek } from 'date-fns';

export type MealSlot = MealPlanEntry['slot'];
export const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export type IngredientUnit = NonNullable<RecipeIngredient['unit']>;

export function toLocalDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Parses `yyyy-MM-dd` as a local calendar day (no timezone shift). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Monday..Sunday of the ISO week containing `anchor`. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfISOWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isoWeek(d: Date): number {
  return getISOWeek(d);
}

/** "200 g Mehl", "1,5 EL Öl" with a locale-formatted quantity. */
export function formatIngredient(
  i: Pick<RecipeIngredient, 'quantity' | 'unit' | 'name'>,
  locale: string,
  unitLabel: (u: IngredientUnit) => string,
): string {
  const qty =
    i.quantity === null
      ? ''
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(i.quantity);
  return [qty, i.unit ? unitLabel(i.unit) : '', i.name].filter(Boolean).join(' ');
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Empty → null, a non-negative whole number → number, otherwise undefined (invalid). */
export function parseIntOrNull(s: string): number | null | undefined {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const UNIT_ALIASES: Record<string, IngredientUnit> = {
  mg: 'mg',
  g: 'g',
  gr: 'g',
  gramm: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  tl: 'tsp',
  tsp: 'tsp',
  el: 'tbsp',
  tbsp: 'tbsp',
  tasse: 'cup',
  cup: 'cup',
  cups: 'cup',
  oz: 'oz',
  lb: 'lb',
  prise: 'pinch',
  pinch: 'pinch',
  stück: 'piece',
  stk: 'piece',
  pc: 'piece',
  dose: 'can',
  can: 'can',
  bund: 'bunch',
  bunch: 'bunch',
  zehe: 'clove',
  zehen: 'clove',
  clove: 'clove',
  cloves: 'clove',
  pck: 'pack',
  packung: 'pack',
  pack: 'pack',
  scheibe: 'slice',
  scheiben: 'slice',
  slice: 'slice',
  becher: 'tub',
  tub: 'tub',
  handful: 'handful',
  sprig: 'sprig',
  stalk: 'stalk',
  glas: 'jar',
  jar: 'jar',
  handvoll: 'handful',
  zweig: 'sprig',
  stange: 'stalk',
};

/**
 * Parses one ingredient line typed by hand: "200 g Mehl", "1,5 EL Öl", "2 Eier", "Salz".
 * Quantities accept "1,5", "1.5" and simple fractions like "1/2".
 */
export function parseIngredientLine(
  line: string,
): { quantity: number | null; unit: IngredientUnit | null; name: string } | null {
  const s = line.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const m = /^(\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/.exec(s);
  if (!m) return { quantity: null, unit: null, name: s };
  const rawQty = m[1] ?? '';
  let quantity: number;
  if (rawQty.includes('/')) {
    const [a, b] = rawQty.split('/').map(Number);
    quantity = b ? (a ?? 0) / b : 0;
  } else quantity = Number(rawQty.replace(',', '.'));
  let rest = (m[2] ?? '').trim();
  let unit: IngredientUnit | null = null;
  const first = /^([^\s]+)\s*(.*)$/.exec(rest);
  if (first) {
    const candidate = (first[1] ?? '').toLowerCase().replace(/\.$/, '');
    const mapped = UNIT_ALIASES[candidate];
    if (mapped && (first[2] ?? '').trim() !== '') {
      unit = mapped;
      rest = (first[2] ?? '').trim();
    }
  }
  if (!rest) return { quantity: null, unit: null, name: s };
  return { quantity: Number.isFinite(quantity) ? quantity : null, unit, name: rest };
}

type EditedIngredient = Pick<RecipeIngredient, 'quantity' | 'unit' | 'name'> &
  Partial<Pick<RecipeIngredient, 'note' | 'category'>>;

/**
 * Turns edited lines back into ingredients. Lines whose name matches an original ingredient keep
 * its note and shopping category; new ones get their category guessed by the API.
 */
export function ingredientsFromLines(
  text: string,
  originals: readonly RecipeIngredient[] = [],
): EditedIngredient[] {
  const byName = new Map(originals.map((o) => [o.name.toLowerCase(), o]));
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((i) => i !== null)
    .map((i) => {
      const original = byName.get(i.name.toLowerCase());
      return original
        ? { ...i, note: original.note, category: original.category }
        : { ...i, note: null };
    });
}
