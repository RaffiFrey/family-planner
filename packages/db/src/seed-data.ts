import { isNull, sql } from 'drizzle-orm';
import type { Executor } from './client.js';
import { finCategories, finRules } from './schema/index.js';

interface SeedCategory {
  key: string;
  name: string;
  kind: 'income' | 'expense' | 'transfer';
  icon: string;
  parent?: string;
}

/** Global default categories (German names; clients translate by `key`). */
export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  { key: 'income', name: 'Einnahmen', kind: 'income', icon: 'wallet' },
  { key: 'salary', name: 'Gehalt', kind: 'income', icon: 'briefcase', parent: 'income' },
  { key: 'child_benefit', name: 'Kindergeld', kind: 'income', icon: 'baby', parent: 'income' },
  {
    key: 'interest',
    name: 'Zinsen & Dividenden',
    kind: 'income',
    icon: 'trending-up',
    parent: 'income',
  },
  {
    key: 'other_income',
    name: 'Sonstige Einnahmen',
    kind: 'income',
    icon: 'plus-circle',
    parent: 'income',
  },
  { key: 'housing', name: 'Wohnen', kind: 'expense', icon: 'home' },
  { key: 'rent', name: 'Miete', kind: 'expense', icon: 'key', parent: 'housing' },
  { key: 'utilities', name: 'Nebenkosten', kind: 'expense', icon: 'droplet', parent: 'housing' },
  { key: 'electricity', name: 'Strom & Gas', kind: 'expense', icon: 'zap', parent: 'housing' },
  { key: 'internet', name: 'Internet & Telefon', kind: 'expense', icon: 'wifi', parent: 'housing' },
  { key: 'groceries', name: 'Lebensmittel', kind: 'expense', icon: 'shopping-cart' },
  { key: 'mobility', name: 'Mobilität', kind: 'expense', icon: 'car' },
  { key: 'fuel', name: 'Tanken', kind: 'expense', icon: 'fuel', parent: 'mobility' },
  {
    key: 'public_transport',
    name: 'ÖPNV & Bahn',
    kind: 'expense',
    icon: 'train',
    parent: 'mobility',
  },
  { key: 'car', name: 'Auto', kind: 'expense', icon: 'wrench', parent: 'mobility' },
  { key: 'insurance', name: 'Versicherungen', kind: 'expense', icon: 'shield' },
  { key: 'health', name: 'Gesundheit', kind: 'expense', icon: 'heart-pulse' },
  { key: 'kids', name: 'Kinder', kind: 'expense', icon: 'baby' },
  { key: 'leisure', name: 'Freizeit', kind: 'expense', icon: 'party-popper' },
  {
    key: 'restaurants',
    name: 'Restaurants & Café',
    kind: 'expense',
    icon: 'utensils',
    parent: 'leisure',
  },
  {
    key: 'subscriptions',
    name: 'Abos & Streaming',
    kind: 'expense',
    icon: 'tv',
    parent: 'leisure',
  },
  { key: 'hobbies', name: 'Hobbys & Sport', kind: 'expense', icon: 'bike', parent: 'leisure' },
  { key: 'shopping', name: 'Shopping', kind: 'expense', icon: 'shopping-bag' },
  { key: 'clothing', name: 'Kleidung', kind: 'expense', icon: 'shirt', parent: 'shopping' },
  {
    key: 'electronics',
    name: 'Elektronik',
    kind: 'expense',
    icon: 'smartphone',
    parent: 'shopping',
  },
  { key: 'travel', name: 'Reisen', kind: 'expense', icon: 'plane' },
  { key: 'education', name: 'Bildung', kind: 'expense', icon: 'graduation-cap' },
  { key: 'pets', name: 'Haustiere', kind: 'expense', icon: 'paw-print' },
  { key: 'gifts', name: 'Geschenke & Spenden', kind: 'expense', icon: 'gift' },
  { key: 'taxes', name: 'Steuern & Gebühren', kind: 'expense', icon: 'landmark' },
  { key: 'cash', name: 'Bargeld', kind: 'expense', icon: 'banknote' },
  { key: 'other_expense', name: 'Sonstiges', kind: 'expense', icon: 'circle-help' },
  { key: 'transfer', name: 'Umbuchung', kind: 'transfer', icon: 'arrow-left-right' },
  { key: 'savings', name: 'Sparen', kind: 'transfer', icon: 'piggy-bank' },
];

type Cond = { field: 'counterparty' | 'purpose' | 'any'; op: 'regex' | 'contains'; value: string };
interface SeedRule {
  category: string;
  conditions: Cond[];
  direction?: 'in' | 'out';
  priority?: number;
}

const any = (pattern: string): Cond[] => [{ field: 'any', op: 'regex', value: pattern }];

/** Global rules for common German merchants. Household rules always take precedence. */
export const DEFAULT_RULES: readonly SeedRule[] = [
  {
    category: 'groceries',
    conditions: any(
      '\\b(rewe|edeka|aldi|lidl|netto|penny|kaufland|norma|tegut|globus|denns|alnatura|real)\\b',
    ),
    direction: 'out',
  },
  {
    category: 'subscriptions',
    conditions: any(
      'netflix|spotify|disney|amazon prime|dazn|apple\\.com/bill|youtube premium|audible',
    ),
    direction: 'out',
  },
  {
    category: 'public_transport',
    conditions: any(
      '\\b(db vertrieb|deutsche bahn|bvg|mvv|hvv|vbb|rmv|kvb|flixbus|deutschlandticket)\\b',
    ),
    direction: 'out',
  },
  {
    category: 'fuel',
    conditions: any('\\b(aral|shell|esso|totalenergies|jet tankstelle|agip|star tankstelle)\\b'),
    direction: 'out',
  },
  {
    category: 'child_benefit',
    conditions: any('kindergeld|familienkasse'),
    direction: 'in',
    priority: 10,
  },
  {
    category: 'salary',
    conditions: [{ field: 'purpose', op: 'regex', value: '\\b(gehalt|lohn|bezuege|bezüge)\\b' }],
    direction: 'in',
    priority: 20,
  },
  {
    category: 'internet',
    conditions: any('\\b(telekom|vodafone|o2|telefonica|1&1|congstar)\\b'),
    direction: 'out',
  },
  {
    category: 'electricity',
    conditions: any('stadtwerke|e\\.on|eon energie|vattenfall|enbw|lichtblick|naturstrom|yello'),
    direction: 'out',
  },
  {
    category: 'insurance',
    conditions: any(
      '\\b(allianz|huk|ergo|axa|generali|r\\+v|devk|signal iduna|debeka|barmenia)\\b',
    ),
    direction: 'out',
  },
  {
    category: 'health',
    conditions: any('apotheke|arztpraxis|zahnarzt|optiker|fielmann'),
    direction: 'out',
  },
  {
    category: 'shopping',
    conditions: any('\\b(amazon|zalando|otto|ikea|mediamarkt|saturn|dm-drogerie|rossmann)\\b'),
    direction: 'out',
    priority: 150,
  },
  {
    category: 'rent',
    conditions: [{ field: 'purpose', op: 'regex', value: '\\bmiete\\b' }],
    direction: 'out',
  },
  {
    category: 'cash',
    conditions: any('bargeldauszahlung|geldautomat|\\bgaa\\b|atm'),
    direction: 'out',
  },
  {
    category: 'restaurants',
    conditions: any('lieferando|wolt|starbucks|mcdonald|burger king|restaurant|cafe|café'),
    direction: 'out',
  },
];

/** Idempotently upserts the global categories and rules (run by `pnpm db:seed` and the admin app). */
export async function seedGlobals(db: Executor): Promise<{ categories: number; rules: number }> {
  const ids = new Map<string, string>();
  for (const c of DEFAULT_CATEGORIES) {
    const parentId = c.parent ? ids.get(c.parent) : undefined;
    const [row] = await db
      .insert(finCategories)
      .values({
        key: c.key,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        parentId: parentId ?? null,
        householdId: null,
      })
      .onConflictDoUpdate({
        target: finCategories.key,
        set: { name: c.name, kind: c.kind, icon: c.icon, parentId: parentId ?? null },
      })
      .returning({ id: finCategories.id });
    if (row) ids.set(c.key, row.id);
  }
  // Global rules are replaced wholesale so the seed stays the source of truth.
  await db.delete(finRules).where(isNull(finRules.householdId));
  for (const r of DEFAULT_RULES) {
    const categoryId = ids.get(r.category);
    if (!categoryId) throw new Error(`Unknown category ${r.category}`);
    await db.insert(finRules).values({
      householdId: null,
      categoryId,
      priority: r.priority ?? 100,
      conditions: r.conditions,
      direction: r.direction ?? null,
    });
  }
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(finCategories)
    .where(isNull(finCategories.householdId));
  return { categories: count?.n ?? 0, rules: DEFAULT_RULES.length };
}
