import { parseMrz } from './mrz.js';

/**
 * Heuristics on OCR text of scanned documents (ID cards, passports, insurance policies …).
 * Results are suggestions for the user, never applied automatically.
 */

export interface FoundDate {
  /** ISO date. */
  date: string;
  /** Character offset in the text. */
  index: number;
  /** The matched text. */
  raw: string;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  januar: 1,
  january: 1,
  jän: 1,
  jänner: 1,
  feb: 2,
  februar: 2,
  february: 2,
  mär: 3,
  märz: 3,
  maerz: 3,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  mai: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oct: 10,
  oktober: 10,
  october: 10,
  nov: 11,
  november: 11,
  dez: 12,
  dec: 12,
  dezember: 12,
  december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Two-digit years: 00–(ref+20) → 20xx, otherwise 19xx. */
function fullYear(y: string, referenceYear: number): number {
  if (y.length === 4) return Number(y);
  const yy = Number(y);
  return 2000 + yy > referenceYear + 20 ? 1900 + yy : 2000 + yy;
}

const NUMERIC = /(?<![\d.])(\d{1,2})\s?([./-])\s?(\d{1,2})\2\s?(\d{4}|\d{2})(?![\d])/g;
const ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const MONTH_NAME =
  /(?<!\d)(\d{1,2})\.?\s*([A-Za-zÄÖÜäöü]{3,9})\.?(?:\s*\/\s*[A-Za-zÄÖÜäöü]{3,9}\.?)?\s*(\d{4}|\d{2})(?!\d)/g;

/** All plausible dates in German/English notations, in text order. */
export function extractDates(
  text: string,
  referenceYear = new Date().getUTCFullYear(),
): FoundDate[] {
  const found: FoundDate[] = [];
  for (const m of text.matchAll(NUMERIC)) {
    const date = isoDate(fullYear(m[4] as string, referenceYear), Number(m[3]), Number(m[1]));
    if (date) found.push({ date, index: m.index, raw: m[0] });
  }
  for (const m of text.matchAll(ISO)) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (date) found.push({ date, index: m.index, raw: m[0] });
  }
  for (const m of text.matchAll(MONTH_NAME)) {
    const month = MONTHS[(m[2] as string).toLowerCase()];
    if (!month) continue;
    const date = isoDate(fullYear(m[3] as string, referenceYear), month, Number(m[1]));
    if (date) found.push({ date, index: m.index, raw: m[0] });
  }
  return found.sort((a, b) => a.index - b.index);
}

const EXPIRY_KEYWORDS =
  /(g[üu]e?ltig\s*bis|ablaufdatum|l[äa]e?uft\s*ab|ablauf|g[üu]ltigkeit|date\s*of\s*expiry|expiry|expires|valid\s*until|valid\s*thru|befristet\s*bis|ende\s*der\s*laufzeit|vertragsende)/gi;
const ISSUE_KEYWORDS =
  /(ausstellungsdatum|ausgestellt\s*am|date\s*of\s*issue|issued|erteilt\s*am|vertragsbeginn|beginn)/gi;
const NUMBER_KEYWORDS =
  /(ausweis-?\s*nr\.?|ausweisnummer|pass-?\s*nr\.?|passnummer|document\s*no\.?|passport\s*no\.?|dokumentennummer|versicherungs-?\s*(?:schein-?)?nummer|versicherungs-?\s*nr\.?|policen-?\s*nr\.?|policennummer|vertrags-?\s*nr\.?|vertragsnummer|kunden-?\s*nr\.?|kundennummer|karten-?\s*nr\.?|kartennummer|führerschein-?\s*nr\.?|steuer-?\s*id|identifikationsnummer|nummer|nr\.)\s*[:#]?\s*/gi;

/** Dates within `window` characters after a keyword. */
function datesAfterKeywords(
  text: string,
  re: RegExp,
  dates: FoundDate[],
  window = 60,
): FoundDate[] {
  const result: FoundDate[] = [];
  for (const m of text.matchAll(re)) {
    const end = m.index + m[0].length;
    const d = dates.find((x) => x.index >= end && x.index - end <= window);
    if (d && !result.some((r) => r.date === d.date)) result.push(d);
  }
  return result;
}

// German ID card numbers avoid vowels and easily confused letters.
const GERMAN_ID_NUMBER = /\b([CFGHJKLMNPRTVWXYZ][CFGHJKLMNPRTVWXYZ0-9]{8})\b/g;

function numbersAfterKeywords(text: string): string[] {
  const result: string[] = [];
  for (const m of text.matchAll(NUMBER_KEYWORDS)) {
    const rest =
      text.slice(m.index + m[0].length, m.index + m[0].length + 40).split(/\r?\n/)[0] ?? '';
    const token = /^([A-Z0-9][A-Z0-9\-/ ]{3,30}[A-Z0-9])/i.exec(rest.trim());
    if (!token) continue;
    const value = (token[1] as string).replace(/\s{2,}.*$/, '').trim();
    // Needs at least one digit; skips words like "Name".
    if (/\d/.test(value) && value.replace(/[^A-Za-z0-9]/g, '').length >= 5) result.push(value);
  }
  return result;
}

export type SuggestionSource = 'mrz' | 'keyword' | 'pattern' | 'latest_date';

export interface Suggestion {
  value: string;
  source: SuggestionSource;
  /** 0..1, higher is better. */
  confidence: number;
}

export interface DocumentSuggestions {
  expiresAt: Suggestion[];
  issuedAt: Suggestion[];
  documentNumber: Suggestion[];
  holderName: string | null;
}

function push(list: Suggestion[], s: Suggestion): void {
  const existing = list.find((x) => x.value === s.value);
  if (existing) existing.confidence = Math.max(existing.confidence, s.confidence);
  else list.push(s);
}

/**
 * Suggests expiry date, issue date and document number from OCR text:
 * a valid MRZ wins, then keyword proximity ("gültig bis 31.12.2030"), then patterns.
 */
export function suggestDocumentFields(
  text: string,
  referenceDate: string = new Date().toISOString().slice(0, 10),
): DocumentSuggestions {
  const referenceYear = Number(referenceDate.slice(0, 4));
  const result: DocumentSuggestions = {
    expiresAt: [],
    issuedAt: [],
    documentNumber: [],
    holderName: null,
  };
  const mrz = parseMrz(text, referenceYear);
  if (mrz) {
    if (mrz.expiryDate)
      push(result.expiresAt, {
        value: mrz.expiryDate,
        source: 'mrz',
        confidence: mrz.checks.expiryDate ? 0.95 : 0.5,
      });
    if (mrz.documentNumber)
      push(result.documentNumber, {
        value: mrz.documentNumber,
        source: 'mrz',
        confidence: mrz.checks.documentNumber ? 0.95 : 0.5,
      });
    const name = [mrz.givenNames, mrz.surname].filter(Boolean).join(' ');
    if (name) result.holderName = name;
  }
  const dates = extractDates(text, referenceYear);
  for (const d of datesAfterKeywords(text, EXPIRY_KEYWORDS, dates))
    push(result.expiresAt, { value: d.date, source: 'keyword', confidence: 0.8 });
  for (const d of datesAfterKeywords(text, ISSUE_KEYWORDS, dates))
    push(result.issuedAt, { value: d.date, source: 'keyword', confidence: 0.7 });
  if (result.expiresAt.length === 0) {
    const future = dates
      .filter((d) => d.date > referenceDate)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = future[0];
    if (latest)
      push(result.expiresAt, { value: latest.date, source: 'latest_date', confidence: 0.3 });
  }
  for (const n of numbersAfterKeywords(text))
    push(result.documentNumber, { value: n, source: 'keyword', confidence: 0.6 });
  for (const m of text.toUpperCase().matchAll(GERMAN_ID_NUMBER)) {
    const v = m[1] as string;
    if (/\d/.test(v) && /[A-Z]/.test(v))
      push(result.documentNumber, { value: v, source: 'pattern', confidence: 0.4 });
  }
  const byConfidence = (a: Suggestion, b: Suggestion) => b.confidence - a.confidence;
  result.expiresAt.sort(byConfidence);
  result.issuedAt.sort(byConfidence);
  result.documentNumber.sort(byConfidence);
  return result;
}
