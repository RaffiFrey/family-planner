/** Canonical units understood by the ingredient parser (German and English spellings map onto these). */
export const UNITS = [
  'mg',
  'g',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'pinch',
  'piece',
  'can',
  'bunch',
  'clove',
  'pack',
  'slice',
  'tub',
  'jar',
  'handful',
  'sprig',
  'stalk',
] as const;
export type Unit = (typeof UNITS)[number];

export interface Ingredient {
  quantity: number | null;
  unit: Unit | null;
  name: string;
  /** Preparation hints such as "fein gehackt" or text in parentheses. */
  note: string | null;
}

const ALIASES: Record<Unit, string[]> = {
  mg: ['mg', 'milligramm', 'milligram', 'milligrams'],
  g: ['g', 'gr', 'gramm', 'gram', 'grams', 'gramme'],
  kg: ['kg', 'kilo', 'kilogramm', 'kilogram', 'kilograms'],
  ml: ['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'],
  cl: ['cl', 'zentiliter', 'centiliter'],
  dl: ['dl', 'deziliter', 'deciliter'],
  l: ['l', 'liter', 'litre', 'liters', 'litres', 'ltr'],
  tsp: ['tl', 'teel', 'teelöffel', 'tsp', 'teaspoon', 'teaspoons', 'tsps'],
  tbsp: ['el', 'essl', 'esslöffel', 'eßlöffel', 'tbsp', 'tbs', 'tbl', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups', 'tasse', 'tassen', 'c'],
  oz: ['oz', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  pinch: ['prise', 'prisen', 'pinch', 'pinches', 'msp', 'messerspitze', 'messerspitzen'],
  piece: ['stück', 'stk', 'st', 'piece', 'pieces', 'pc', 'pcs'],
  can: ['dose', 'dosen', 'can', 'cans', 'tin', 'tins'],
  bunch: ['bund', 'bunch', 'bunches', 'bd'],
  clove: ['zehe', 'zehen', 'clove', 'cloves'],
  pack: ['packung', 'packungen', 'pck', 'pkg', 'päckchen', 'pack', 'packs', 'package', 'packet'],
  slice: ['scheibe', 'scheiben', 'slice', 'slices'],
  tub: ['becher', 'tub', 'tubs', 'carton'],
  jar: ['glas', 'gläser', 'jar', 'jars'],
  handful: ['handvoll', 'handful', 'handfuls'],
  sprig: ['zweig', 'zweige', 'sprig', 'sprigs'],
  stalk: ['stange', 'stangen', 'stalk', 'stalks'],
};

const UNIT_BY_ALIAS = new Map<string, Unit>(
  Object.entries(ALIASES).flatMap(([unit, aliases]) => aliases.map((a) => [a, unit as Unit])),
);

const UNIT_LABELS: Record<'de' | 'en', Record<Unit, string>> = {
  de: {
    mg: 'mg',
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    cl: 'cl',
    dl: 'dl',
    l: 'l',
    tsp: 'TL',
    tbsp: 'EL',
    cup: 'Tasse',
    oz: 'oz',
    lb: 'lb',
    pinch: 'Prise',
    piece: 'Stück',
    can: 'Dose',
    bunch: 'Bund',
    clove: 'Zehe',
    pack: 'Packung',
    slice: 'Scheibe',
    tub: 'Becher',
    jar: 'Glas',
    handful: 'Handvoll',
    sprig: 'Zweig',
    stalk: 'Stange',
  },
  en: {
    mg: 'mg',
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    cl: 'cl',
    dl: 'dl',
    l: 'l',
    tsp: 'tsp',
    tbsp: 'tbsp',
    cup: 'cup',
    oz: 'oz',
    lb: 'lb',
    pinch: 'pinch',
    piece: 'pc',
    can: 'can',
    bunch: 'bunch',
    clove: 'clove',
    pack: 'pack',
    slice: 'slice',
    tub: 'tub',
    jar: 'jar',
    handful: 'handful',
    sprig: 'sprig',
    stalk: 'stalk',
  },
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅙': 1 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

const NUMBER_RE = new RegExp(
  [
    `(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)`, // mixed: 1 1/2
    `(\\d+)?\\s*([${FRACTION_CHARS}])`, // unicode: 1½, ½
    `(\\d+)\\s*/\\s*(\\d+)`, // fraction: 1/2
    `(\\d+(?:[.,]\\d+)?)`, // integer / decimal
  ]
    .map((p) => `(?:${p})`)
    .join('|'),
  'y',
);

function readNumber(s: string, pos: number): { value: number; end: number } | null {
  NUMBER_RE.lastIndex = pos;
  const m = NUMBER_RE.exec(s);
  if (!m) return null;
  let value: number;
  if (m[1] !== undefined) value = Number(m[1]) + Number(m[2]) / Number(m[3]);
  else if (m[5] !== undefined) value = Number(m[4] ?? 0) + (UNICODE_FRACTIONS[m[5]] as number);
  else if (m[6] !== undefined) value = Number(m[6]) / Number(m[7]);
  else value = Number((m[8] as string).replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { value, end: NUMBER_RE.lastIndex };
}

const RANGE_RE = /\s*(?:-|–|—|bis|to|or|oder)\s*/y;
const PREFIX_RE = /^(?:ca\.?|circa|etwa|about|approx\.?|approximately|~)\s*/i;

/** Rounds to at most 3 decimals to keep float noise out of quantities. */
function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Splits a free-text ingredient line ("200 g Mehl", "2 EL Olivenöl", "1 1/2 cups sugar",
 * "2-3 Zwiebeln, fein gehackt") into quantity, unit, name and note. Ranges use the upper bound
 * so the shopping list never ends up short.
 */
export function parseIngredient(line: string): Ingredient {
  let s = line
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-•*·]\s*/, '');
  s = s.replace(PREFIX_RE, '');

  let quantity: number | null = null;
  let pos = 0;
  const first = readNumber(s, 0);
  if (first) {
    quantity = first.value;
    pos = first.end;
    RANGE_RE.lastIndex = pos;
    if (RANGE_RE.test(s)) {
      const second = readNumber(s, RANGE_RE.lastIndex);
      if (second) {
        quantity = Math.max(quantity, second.value);
        pos = second.end;
      }
    }
  }

  let rest = s.slice(pos).trimStart();
  let unit: Unit | null = null;
  const token = /^([A-Za-zÄÖÜäöüß]+)\.?(?=\s|$|[,(])/.exec(rest);
  if (token) {
    const word = token[1] as string;
    const candidate = UNIT_BY_ALIAS.get(word.toLowerCase());
    // A bare "c"/"l"/"el" without a quantity is far more likely the start of a name.
    if (candidate && (quantity !== null || word.length > 2)) {
      unit = candidate;
      rest = rest.slice(token[0].length).trimStart();
      rest = rest.replace(/^(?:of|von)\s+/i, '');
    }
  }

  let note: string | null = null;
  const notes: string[] = [];
  rest = rest.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return ' ';
  });
  const comma = rest.indexOf(',');
  if (comma >= 0) {
    const after = rest.slice(comma + 1).trim();
    if (after) notes.push(after);
    rest = rest.slice(0, comma);
  }
  if (notes.length > 0) note = notes.join(', ');
  const name = rest.replace(/\s+/g, ' ').trim();

  return {
    quantity: quantity === null ? null : round(quantity),
    unit,
    name: name || s,
    note,
  };
}

export function unitLabel(unit: Unit, locale: 'de' | 'en' = 'de'): string {
  return UNIT_LABELS[locale][unit];
}

/** "200 g", "1,5 EL", "2" — or null when there is no quantity. */
export function formatQuantity(
  quantity: number | null,
  unit: Unit | null,
  locale: 'de' | 'en' = 'de',
): string | null {
  if (quantity === null) return unit ? unitLabel(unit, locale) : null;
  const n = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(quantity);
  return unit ? `${n} ${unitLabel(unit, locale)}` : n;
}

// ---------------------------------------------------------------- scaling & merging

const BASE: Partial<Record<Unit, { base: Unit; factor: number }>> = {
  mg: { base: 'g', factor: 0.001 },
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
};

export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scaleIngredient(i: Ingredient, factor: number): Ingredient {
  return { ...i, quantity: i.quantity === null ? null : round(i.quantity * factor) };
}

/** Scale factor from recipe servings to planned servings (1 when either is unknown). */
export function servingsFactor(
  recipeServings: number | null | undefined,
  planned: number | null | undefined,
): number {
  if (!recipeServings || !planned || recipeServings <= 0 || planned <= 0) return 1;
  return planned / recipeServings;
}

export interface MergedIngredient {
  name: string;
  quantity: number | null;
  unit: Unit | null;
}

/** Converts g ≥ 1000 → kg and ml ≥ 1000 → l for display. */
function humanize(quantity: number, unit: Unit): { quantity: number; unit: Unit } {
  if (unit === 'g' && quantity >= 1000) return { quantity: round(quantity / 1000), unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { quantity: round(quantity / 1000), unit: 'l' };
  if (unit === 'g' || unit === 'ml') return { quantity: Math.ceil(quantity - 1e-9), unit };
  return { quantity: round(quantity, 2), unit };
}

/**
 * Merges the same ingredient across recipes: metric masses/volumes are summed in g/ml, other units
 * only with themselves ("1 Dose" + "2 Dosen"). Lines without a quantity are absorbed by a line with
 * the same name. Keeps first-seen order.
 */
export function mergeIngredients(items: readonly Ingredient[]): MergedIngredient[] {
  const groups = new Map<string, { name: string; unit: Unit | null; quantity: number | null }>();
  const byName = new Map<string, string[]>();
  const noQuantity: Ingredient[] = [];
  for (const i of items) {
    const key = normalizeIngredientName(i.name);
    if (!key) continue;
    if (i.quantity === null) {
      noQuantity.push(i);
      continue;
    }
    const conv = i.unit ? BASE[i.unit] : undefined;
    const unit = conv ? conv.base : i.unit === 'piece' ? null : i.unit;
    const qty = conv ? i.quantity * conv.factor : i.quantity;
    const gk = `${key}|${unit ?? ''}`;
    const g = groups.get(gk);
    if (g) g.quantity = (g.quantity ?? 0) + qty;
    else {
      groups.set(gk, { name: i.name.trim(), unit, quantity: qty });
      byName.set(key, [...(byName.get(key) ?? []), gk]);
    }
  }
  for (const i of noQuantity) {
    const key = normalizeIngredientName(i.name);
    if (byName.has(key)) continue;
    const gk = `${key}|${i.unit ?? ''}|-`;
    if (!groups.has(gk)) {
      groups.set(gk, { name: i.name.trim(), unit: i.unit, quantity: null });
      byName.set(key, [gk]);
    }
  }
  return [...groups.values()].map((g) => {
    if (g.quantity === null || g.unit === null)
      return {
        name: g.name,
        unit: g.unit,
        quantity: g.quantity === null ? null : round(g.quantity, 2),
      };
    const h = humanize(g.quantity, g.unit);
    return { name: g.name, ...h };
  });
}

const STAPLE_WORDS = new Set([
  'salz',
  'salt',
  'pfeffer',
  'pepper',
  'wasser',
  'water',
  'öl',
  'oil',
  'olivenöl',
  'sonnenblumenöl',
  'rapsöl',
  'pflanzenöl',
  'speiseöl',
  'meersalz',
  'jodsalz',
]);
const FILLER_WORDS = new Set([
  'und',
  'and',
  'oder',
  'or',
  'etwas',
  'some',
  'a',
  'the',
  'of',
  'nach',
  'geschmack',
  'belieben',
  'to',
  'taste',
  'frisch',
  'frischer',
  'frisches',
  'fresh',
  'freshly',
  'gemahlen',
  'gemahlener',
  'ground',
  'schwarz',
  'schwarzer',
  'black',
  'weißer',
  'white',
  'grob',
  'grobes',
  'fein',
  'feines',
  'kosher',
  'sea',
  'olive',
  'vegetable',
  'sunflower',
  'extra',
  'virgin',
  'nativ',
  'natives',
  'warm',
  'warmes',
  'lauwarmes',
  'kaltes',
  'cold',
  'lukewarm',
  'hot',
  'heißes',
  'prise',
  'pinch',
]);

/** Salt, pepper, water and cooking oil: things almost every kitchen has. */
export function isPantryStaple(name: string): boolean {
  const words = normalizeIngredientName(name)
    .split(/[\s-]+/)
    .filter(Boolean);
  return (
    words.some((w) => STAPLE_WORDS.has(w)) &&
    words.every((w) => STAPLE_WORDS.has(w) || FILLER_WORDS.has(w))
  );
}

export interface PlannedRecipe {
  ingredients: readonly Ingredient[];
  recipeServings: number | null;
  plannedServings: number | null;
}

export interface ShoppingLine extends MergedIngredient {
  text: string;
  quantityText: string | null;
}

/** Ingredients of several planned meals, scaled to the planned servings and merged. */
export function shoppingLinesForPlan(
  meals: readonly PlannedRecipe[],
  options: { skipStaples?: boolean; locale?: 'de' | 'en' } = {},
): ShoppingLine[] {
  const all = meals.flatMap((m) => {
    const f = servingsFactor(m.recipeServings, m.plannedServings);
    return m.ingredients.map((i) => scaleIngredient(i, f));
  });
  const filtered = options.skipStaples ? all.filter((i) => !isPantryStaple(i.name)) : all;
  return mergeIngredients(filtered).map((m) => ({
    ...m,
    text: m.name,
    quantityText: formatQuantity(m.quantity, m.unit, options.locale ?? 'de'),
  }));
}
