import { localDateToFloating, parseLocalDate } from '../time/time.js';

export const PACKING_TEMPLATES = ['basics', 'beach', 'city', 'ski', 'camping', 'baby'] as const;
export type PackingTemplate = (typeof PACKING_TEMPLATES)[number];

/** Same values as the shopping aisle categories, so packing items fit into `list_items`. */
export type PackingCategory = 'hygiene' | 'baby' | 'pantry' | 'drinks' | 'household' | 'other';

interface TemplateItem {
  de: string;
  en: string;
  category?: PackingCategory;
  /** One per traveller (matching the age filter). */
  perPerson?: boolean;
  /** One per day of the trip (nights + 1), capped at `max`. */
  perDay?: boolean;
  max?: number;
  minAge?: number;
  maxAge?: number;
  minNights?: number;
}

const T: Record<PackingTemplate, { de: string; en: string; items: TemplateItem[] }> = {
  basics: {
    de: 'Grundausstattung',
    en: 'Basics',
    items: [
      { de: 'Personalausweis / Reisepass', en: 'ID card / passport', perPerson: true },
      { de: 'Krankenversicherungskarte', en: 'Health insurance card', perPerson: true },
      { de: 'Ladekabel & Netzteile', en: 'Chargers & adapters' },
      { de: 'Unterwäsche', en: 'Underwear', perPerson: true, perDay: true, max: 8 },
      { de: 'Socken', en: 'Socks', perPerson: true, perDay: true, max: 8 },
      { de: 'T-Shirts', en: 'T-shirts', perPerson: true, perDay: true, max: 6 },
      { de: 'Schlafanzug', en: 'Pyjamas', perPerson: true },
      { de: 'Zahnbürste', en: 'Toothbrush', category: 'hygiene', perPerson: true },
      { de: 'Zahnpasta', en: 'Toothpaste', category: 'hygiene' },
      { de: 'Duschgel & Shampoo', en: 'Shower gel & shampoo', category: 'hygiene' },
      { de: 'Reiseapotheke', en: 'First-aid kit', category: 'hygiene' },
      { de: 'Kuscheltier', en: 'Cuddly toy', perPerson: true, maxAge: 8 },
      { de: 'Spiele & Bücher', en: 'Games & books', maxAge: 14 },
      { de: 'Snacks für unterwegs', en: 'Snacks for the journey', category: 'pantry' },
      { de: 'Waschmittel', en: 'Laundry detergent', category: 'household', minNights: 7 },
    ],
  },
  beach: {
    de: 'Strandurlaub',
    en: 'Beach holiday',
    items: [
      { de: 'Badesachen', en: 'Swimwear', perPerson: true },
      { de: 'Sonnencreme', en: 'Sunscreen', category: 'hygiene' },
      { de: 'After-Sun', en: 'After-sun lotion', category: 'hygiene' },
      { de: 'Sonnenbrille', en: 'Sunglasses', perPerson: true },
      { de: 'Sonnenhut', en: 'Sun hat', perPerson: true },
      { de: 'Strandtuch', en: 'Beach towel', perPerson: true },
      { de: 'Flip-Flops', en: 'Flip-flops', perPerson: true },
      { de: 'Schwimmflügel', en: 'Armbands', perPerson: true, maxAge: 6 },
      { de: 'Sandspielzeug', en: 'Sand toys', maxAge: 10 },
      { de: 'Mückenschutz', en: 'Insect repellent', category: 'hygiene' },
    ],
  },
  city: {
    de: 'Städtereise',
    en: 'City trip',
    items: [
      { de: 'Bequeme Schuhe', en: 'Comfortable shoes', perPerson: true },
      { de: 'Regenschirm', en: 'Umbrella' },
      { de: 'Tagesrucksack', en: 'Day pack' },
      { de: 'Powerbank', en: 'Power bank' },
      { de: 'Tickets & Reservierungen', en: 'Tickets & reservations' },
      { de: 'Kinderwagen / Trage', en: 'Stroller / carrier', maxAge: 3 },
    ],
  },
  ski: {
    de: 'Skiurlaub',
    en: 'Ski trip',
    items: [
      { de: 'Skijacke', en: 'Ski jacket', perPerson: true },
      { de: 'Skihose', en: 'Ski trousers', perPerson: true },
      { de: 'Thermounterwäsche', en: 'Thermal underwear', perPerson: true },
      { de: 'Skisocken', en: 'Ski socks', perPerson: true, perDay: true, max: 5 },
      { de: 'Handschuhe', en: 'Gloves', perPerson: true },
      { de: 'Mütze', en: 'Beanie', perPerson: true },
      { de: 'Skibrille', en: 'Goggles', perPerson: true },
      { de: 'Helm', en: 'Helmet', perPerson: true },
      { de: 'Lippenpflege mit LSF', en: 'Lip balm with SPF', category: 'hygiene' },
      { de: 'Sonnencreme', en: 'Sunscreen', category: 'hygiene' },
      { de: 'Schlitten', en: 'Sledge', maxAge: 12 },
    ],
  },
  camping: {
    de: 'Camping',
    en: 'Camping',
    items: [
      { de: 'Zelt', en: 'Tent' },
      { de: 'Schlafsack', en: 'Sleeping bag', perPerson: true },
      { de: 'Isomatte', en: 'Sleeping mat', perPerson: true },
      { de: 'Stirnlampe', en: 'Head torch', perPerson: true, minAge: 4 },
      { de: 'Campingkocher & Gas', en: 'Camping stove & gas', category: 'household' },
      { de: 'Geschirr & Besteck', en: 'Dishes & cutlery', category: 'household' },
      { de: 'Spülmittel', en: 'Washing-up liquid', category: 'household' },
      { de: 'Taschenmesser', en: 'Pocket knife' },
      { de: 'Regenjacke', en: 'Rain jacket', perPerson: true },
      { de: 'Wasserkanister', en: 'Water container', category: 'drinks' },
      { de: 'Mückenschutz', en: 'Insect repellent', category: 'hygiene' },
    ],
  },
  baby: {
    de: 'Baby & Kleinkind',
    en: 'Baby & toddler',
    items: [
      { de: 'Windeln', en: 'Nappies', category: 'baby', perPerson: true, maxAge: 3 },
      { de: 'Feuchttücher', en: 'Baby wipes', category: 'baby', maxAge: 3 },
      { de: 'Wickelunterlage', en: 'Changing mat', category: 'baby', maxAge: 3 },
      { de: 'Babynahrung / Fläschchen', en: 'Baby food / bottles', category: 'baby', maxAge: 2 },
      { de: 'Schnuller', en: 'Dummy', category: 'baby', perPerson: true, maxAge: 3 },
      { de: 'Babyphone', en: 'Baby monitor', maxAge: 3 },
      { de: 'Reisebett', en: 'Travel cot', perPerson: true, maxAge: 3 },
      { de: 'Wundschutzcreme', en: 'Nappy cream', category: 'baby', maxAge: 3 },
    ],
  },
};

export interface PackingTraveller {
  /** Age in years at the trip start, or null when unknown (no age filter applies). */
  age: number | null;
}

export interface PackingItem {
  text: string;
  quantity: string | null;
  category: PackingCategory;
}

export function packingTemplates(
  locale: 'de' | 'en' = 'de',
): { key: PackingTemplate; name: string }[] {
  return PACKING_TEMPLATES.map((key) => ({ key, name: T[key][locale] }));
}

/** Whole nights between two local dates (0 for a day trip). */
export function tripNights(startDate: string, endDate: string): number {
  const ms = localDateToFloating(endDate).getTime() - localDateToFloating(startDate).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Completed years of age on a given date. */
export function ageOn(birthday: string, on: string): number {
  const b = parseLocalDate(birthday);
  const d = parseLocalDate(on);
  let age = d.year - b.year;
  if (d.month < b.month || (d.month === b.month && d.day < b.day)) age--;
  return Math.max(0, age);
}

function matchesAge(item: TemplateItem, age: number | null): boolean {
  if (age === null) return true;
  if (item.minAge !== undefined && age < item.minAge) return false;
  if (item.maxAge !== undefined && age > item.maxAge) return false;
  return true;
}

/**
 * Builds a packing list from the chosen templates (basics are always included), filtered by the
 * trip length and the travellers' ages; per-person and per-day items get a quantity.
 */
export function buildPackingList(options: {
  templates: readonly PackingTemplate[];
  nights: number;
  travellers: readonly PackingTraveller[];
  locale?: 'de' | 'en';
}): PackingItem[] {
  const locale = options.locale ?? 'de';
  const travellers = options.travellers.length > 0 ? options.travellers : [{ age: null }];
  const keys = new Set<PackingTemplate>(['basics', ...options.templates]);
  const seen = new Set<string>();
  const out: PackingItem[] = [];
  for (const key of PACKING_TEMPLATES) {
    if (!keys.has(key)) continue;
    for (const item of T[key].items) {
      if (item.minNights !== undefined && options.nights < item.minNights) continue;
      const matching = travellers.filter((t) => matchesAge(item, t.age)).length;
      if (matching === 0) continue;
      const text = item[locale];
      if (seen.has(text)) continue;
      seen.add(text);
      const perDay = item.perDay ? Math.min(options.nights + 1, item.max ?? Infinity) : 1;
      const count = (item.perPerson ? matching : 1) * perDay;
      out.push({
        text,
        quantity: item.perPerson || item.perDay ? String(count) : null,
        category: item.category ?? 'other',
      });
    }
  }
  return out;
}
