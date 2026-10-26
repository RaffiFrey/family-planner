import { de, type Messages } from './locales/de.js';
import { en } from './locales/en.js';

export type { Messages };
export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

export const resources: Record<Locale, Messages> = { de, en };

export function isLocale(v: string | null | undefined): v is Locale {
  return v === 'de' || v === 'en';
}

/** Picks a supported locale from an Accept-Language header or device locale list. */
export function negotiateLocale(preferred: readonly string[] | string | null | undefined): Locale {
  const list = typeof preferred === 'string' ? preferred.split(',') : (preferred ?? []);
  for (const raw of list) {
    const tag = raw.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

const intlLocale: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

export function toIntlLocale(locale: Locale): string {
  return intlLocale[locale];
}

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dotted key of a shared message, e.g. `nav.calendar`. */
export type MessageKey = Leaves<Messages>;

/** Minimal translator for non-React contexts (emails, push texts on the server). */
export function translate(
  locale: Locale,
  key: MessageKey | (string & {}),
  vars: Record<string, string | number> = {},
): string {
  let node: unknown = resources[locale];
  for (const part of key.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }
  const template = typeof node === 'string' ? node : key;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    String(vars[name] ?? `{{${name}}}`),
  );
}

/** Translates a finance category: system categories by key, custom ones by their own name. */
export function categoryLabel(
  locale: Locale,
  category: { key?: string | null; name: string },
): string {
  if (category.key) {
    const label = (resources[locale].categories as Record<string, string>)[category.key];
    if (label) return label;
  }
  return category.name;
}

export function formatDate(
  value: Date | string,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(intlLocale[locale], { timeZone, ...options }).format(d);
}

export function formatTime(value: Date | string, locale: Locale, timeZone: string): string {
  return formatDate(value, locale, timeZone, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeDays(days: number, locale: Locale): string {
  return new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: 'auto' }).format(days, 'day');
}
