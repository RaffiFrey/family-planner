import { type Ingredient, parseIngredient } from './ingredients.js';

const DURATION_RE =
  /^P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

/** ISO-8601 duration ("PT1H30M", "P0DT45M") → whole minutes; null when not a valid duration. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const m = DURATION_RE.exec(s);
  if (!m || s === 'P' || s.endsWith('T')) return null;
  const n = (i: number) => Number((m[i] ?? '0').replace(',', '.'));
  const minutes =
    n(1) * 525_600 + n(2) * 43_200 + n(3) * 10_080 + n(4) * 1_440 + n(5) * 60 + n(6) + n(7) / 60;
  return Math.round(minutes);
}

export interface RecipeDraft {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  imageUrl: string | null;
  sourceUrl: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const cp = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    if (code.startsWith('#')) {
      const cp = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES[code] ?? whole;
  });
}

/** Strips tags, decodes entities and collapses whitespace. */
export function cleanText(s: string): string {
  return decodeHtmlEntities(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asArray = (v: Json | undefined): Json[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

function isRecipe(o: JsonObject): boolean {
  return asArray(o['@type']).some(
    (t) => typeof t === 'string' && /(^|[/:])Recipe$/i.test(t.trim()),
  );
}

/** Depth-first search through arrays, `@graph`, `mainEntity` and nested objects. */
function findRecipe(node: Json | undefined, depth = 0): JsonObject | null {
  if (depth > 8 || node === undefined || node === null) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipe(n, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (isRecipe(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** Tolerates HTML comments / CDATA wrappers and raw control characters inside strings. */
function parseJsonLoose(raw: string): Json | undefined {
  const s = raw
    .trim()
    .replace(/^<!--/, '')
    .replace(/-->$/, '')
    .replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, '')
    .replace(/\/\*\s*\]\]>\s*\*\/$/, '')
    .trim();
  try {
    return JSON.parse(s) as Json;
  } catch {
    try {
      // eslint-disable-next-line no-control-regex
      return JSON.parse(s.replace(/[\x00-\x1f]+/g, ' ')) as Json;
    } catch {
      return undefined;
    }
  }
}

const LD_JSON_RE =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** All JSON-LD blocks of a page that parse as JSON. */
export function extractJsonLd(html: string): Json[] {
  const out: Json[] = [];
  for (const m of html.matchAll(LD_JSON_RE)) {
    const parsed = parseJsonLoose(m[1] ?? '');
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

function text(v: Json | undefined): string | null {
  if (typeof v === 'string') return cleanText(v) || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (isObject(v)) return text(v['@value'] ?? v.name ?? v.text);
  return null;
}

function servingsOf(v: Json | undefined): number | null {
  for (const item of asArray(v)) {
    if (typeof item === 'number' && item > 0) return Math.round(item);
    if (typeof item === 'string') {
      const m = /(\d+)/.exec(item);
      if (m) {
        const n = Number(m[1]);
        if (n > 0 && n < 1000) return n;
      }
    }
  }
  return null;
}

function stepsOf(v: Json | undefined): string[] {
  if (typeof v === 'string') {
    const cleaned = v.replace(/<\/(p|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
    return cleaned
      .split(/\n+/)
      .map(cleanText)
      .filter((s) => s.length > 0);
  }
  const out: string[] = [];
  for (const item of asArray(v)) {
    if (typeof item === 'string') out.push(...stepsOf(item));
    else if (isObject(item)) {
      if (item.itemListElement !== undefined) out.push(...stepsOf(item.itemListElement));
      else {
        const t = text(item.text ?? item.name ?? item.description);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function tagsOf(...values: (Json | undefined)[]): string[] {
  const tags = new Map<string, string>();
  for (const v of values) {
    for (const item of asArray(v)) {
      if (typeof item !== 'string') continue;
      for (const t of item.split(',')) {
        const clean = cleanText(t);
        if (clean && clean.length <= 40 && !tags.has(clean.toLowerCase()))
          tags.set(clean.toLowerCase(), clean);
      }
    }
  }
  return [...tags.values()].slice(0, 20);
}

function imageOf(v: Json | undefined): string | null {
  for (const item of asArray(v)) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
    if (isObject(item)) {
      const url = imageOf(item.url ?? item.contentUrl ?? null);
      if (url) return url;
    }
  }
  return null;
}

/** Maps a schema.org Recipe object to a draft; ingredient lines are parsed into parts. */
export function recipeFromJsonLd(r: JsonObject, sourceUrl: string | null = null): RecipeDraft {
  const prep = parseIsoDuration(r.prepTime);
  let cook = parseIsoDuration(r.cookTime);
  const total = parseIsoDuration(r.totalTime);
  if (cook === null && total !== null) cook = Math.max(0, total - (prep ?? 0));
  const ingredientLines = asArray(r.recipeIngredient ?? r.ingredients)
    .map((l) => (typeof l === 'string' ? cleanText(l) : text(l)))
    .filter((l): l is string => !!l);
  return {
    title: text(r.name) ?? text(r.headline) ?? 'Rezept',
    description: text(r.description),
    servings: servingsOf(r.recipeYield ?? r.yield),
    prepMinutes: prep,
    cookMinutes: cook,
    ingredients: ingredientLines.slice(0, 200).map(parseIngredient),
    steps: stepsOf(r.recipeInstructions).slice(0, 100),
    tags: tagsOf(r.recipeCategory, r.recipeCuisine, r.keywords),
    imageUrl: imageOf(r.image),
    sourceUrl,
  };
}

/** Finds the first schema.org Recipe in the page's JSON-LD; null when the page has none. */
export function extractRecipeFromHtml(
  html: string,
  sourceUrl: string | null = null,
): RecipeDraft | null {
  for (const block of extractJsonLd(html)) {
    const recipe = findRecipe(block);
    if (recipe) return recipeFromJsonLd(recipe, sourceUrl);
  }
  return null;
}
