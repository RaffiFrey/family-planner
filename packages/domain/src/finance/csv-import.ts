import * as papaNs from 'papaparse';
import {
  type CurrencyCode,
  currencyExponent,
  isCurrencyCode,
  parseAmountToMinor,
} from '../money/money.js';
import { formatLocalDate } from '../time/time.js';
import { type CsvPreset, CSV_PRESETS, type DateFormat, normalizeHeader } from './csv-presets.js';
import {
  ImportError,
  type ImportIssue,
  type ImportResult,
  type ParsedTransaction,
} from './types.js';

type PapaModule = typeof papaNs;
const Papa: PapaModule = (papaNs as unknown as { default?: PapaModule }).default ?? papaNs;

const HEADER_SCAN_ROWS = 30;

function parseRows(text: string, delimiter: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^\s+/, ''), {
    delimiter,
    skipEmptyLines: 'greedy',
  });
  return res.data;
}

function findHeader(rows: string[][], preset: CsvPreset): number {
  const wanted = preset.detect.map(normalizeHeader);
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    const cells = new Set((rows[i] ?? []).map(normalizeHeader));
    if (wanted.every((w) => cells.has(w))) return i;
  }
  return -1;
}

export interface DetectedPreset {
  preset: CsvPreset;
  headerRow: number;
}

/** Picks the preset whose required columns appear in the header; most specific wins. */
export function detectCsvPreset(text: string): DetectedPreset | null {
  let best: DetectedPreset | null = null;
  for (const preset of CSV_PRESETS) {
    const headerRow = findHeader(parseRows(text, preset.delimiter), preset);
    if (headerRow >= 0 && (!best || preset.detect.length > best.preset.detect.length)) {
      best = { preset, headerRow };
    }
  }
  return best;
}

export function parseBankDate(value: string, format: DateFormat): string {
  const v = value.trim();
  let day: number;
  let month: number;
  let year: number;
  let m: RegExpExecArray | null;
  switch (format) {
    case 'dd.MM.yyyy':
    case 'dd.MM.yy':
      // Banks are inconsistent about 2- vs 4-digit years even within one format, accept both.
      m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(v);
      if (!m) throw new ImportError(`Invalid date "${value}"`);
      day = Number(m[1]);
      month = Number(m[2]);
      year = Number(m[3]);
      if (year < 100) year += 2000;
      break;
    case 'yyyy-MM-dd':
      m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (!m) throw new ImportError(`Invalid date "${value}"`);
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
      break;
    case 'MM/dd/yyyy':
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
      if (!m) throw new ImportError(`Invalid date "${value}"`);
      month = Number(m[1]);
      day = Number(m[2]);
      year = Number(m[3]);
      break;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new ImportError(`Invalid date "${value}"`);
  }
  return formatLocalDate(year, month, day);
}

function cleanText(v: string | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim();
}

export interface CsvImportOptions {
  /** Force a preset instead of auto-detecting. */
  presetId?: string;
  /** Currency used when the file has no currency column. */
  defaultCurrency?: CurrencyCode;
}

export function importCsv(text: string, options: CsvImportOptions = {}): ImportResult {
  let detected: DetectedPreset | null;
  if (options.presetId) {
    const preset = CSV_PRESETS.find((p) => p.id === options.presetId);
    if (!preset) throw new ImportError(`Unknown preset "${options.presetId}"`);
    const headerRow = findHeader(parseRows(text, preset.delimiter), preset);
    detected = headerRow >= 0 ? { preset, headerRow } : null;
  } else {
    detected = detectCsvPreset(text);
  }
  if (!detected) throw new ImportError('Unrecognised CSV format');
  const { preset, headerRow } = detected;
  const rows = parseRows(text, preset.delimiter);
  const header = (rows[headerRow] ?? []).map(normalizeHeader);
  const col = (name: string | undefined): number =>
    name ? header.indexOf(normalizeHeader(name)) : -1;
  const get = (row: string[], name: string | undefined): string | undefined => {
    const i = col(name);
    return i >= 0 ? row[i] : undefined;
  };

  const transactions: ParsedTransaction[] = [];
  const issues: ImportIssue[] = [];
  const pending = new Set((preset.pendingValues ?? []).map(normalizeHeader));

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => c.trim() === '')) continue;
    try {
      const c = preset.columns;
      const currencyRaw = cleanText(get(row, c.currency)).toUpperCase();
      const currency: CurrencyCode =
        currencyRaw && isCurrencyCode(currencyRaw)
          ? currencyRaw
          : (options.defaultCurrency ?? 'EUR');
      const exp = currencyExponent(currency);
      let amountMinor: number;
      if (c.amount) {
        amountMinor = parseAmountToMinor(get(row, c.amount) ?? '', exp, preset.decimal);
      } else {
        const debit = cleanText(get(row, c.debit));
        const credit = cleanText(get(row, c.credit));
        amountMinor = credit
          ? Math.abs(parseAmountToMinor(credit, exp, preset.decimal))
          : -Math.abs(parseAmountToMinor(debit, exp, preset.decimal));
      }
      const nameCols =
        typeof c.counterpartyName === 'string' ? [c.counterpartyName] : (c.counterpartyName ?? []);
      // DKB has payer and payee columns; the counterparty is whichever side isn't us.
      const names = nameCols.map((n) => cleanText(get(row, n)));
      const counterpartyName = (amountMinor < 0 ? names[0] : (names[1] ?? names[0])) || null;
      const valueRaw = cleanText(get(row, c.valueDate));
      const statusRaw = normalizeHeader(cleanText(get(row, c.status)));
      transactions.push({
        bookingDate: parseBankDate(get(row, c.bookingDate) ?? '', preset.dateFormat),
        valueDate: valueRaw ? parseBankDate(valueRaw, preset.dateFormat) : null,
        amountMinor,
        currency,
        counterpartyName,
        counterpartyIban: cleanText(get(row, c.counterpartyIban)).replace(/\s/g, '') || null,
        purpose: cleanText(get(row, c.purpose)),
        bookingText: cleanText(get(row, c.bookingText)) || null,
        status: statusRaw && pending.has(statusRaw) ? 'pending' : 'booked',
        bankReference: cleanText(get(row, c.reference)) || null,
      });
    } catch (e) {
      issues.push({ line: r + 1, message: (e as Error).message });
    }
  }
  return { format: preset.id, transactions, issues };
}
