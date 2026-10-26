import {
  type CurrencyCode,
  currencyExponent,
  isCurrencyCode,
  parseAmountToMinor,
} from '../money/money.js';
import { formatLocalDate } from '../time/time.js';
import {
  ImportError,
  type ImportIssue,
  type ImportResult,
  type ParsedTransaction,
} from './types.js';

interface Field {
  tag: string;
  value: string;
}

function splitFields(text: string): Field[] {
  const fields: Field[] = [];
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd();
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (m) fields.push({ tag: m[1] as string, value: m[2] as string });
    else if (fields.length > 0 && line !== '-' && line !== '') {
      const last = fields[fields.length - 1] as Field;
      last.value += `\n${line}`;
    }
  }
  return fields;
}

function yymmdd(s: string): string {
  const yy = Number(s.slice(0, 2));
  return formatLocalDate(
    yy < 70 ? 2000 + yy : 1900 + yy,
    Number(s.slice(2, 4)),
    Number(s.slice(4, 6)),
  );
}

/** German :86: structured purpose (GVC with ?xx subfields). */
function parse86(value: string): {
  purpose: string;
  name: string | null;
  iban: string | null;
  text: string | null;
} {
  const flat = value.replace(/\n/g, '');
  if (!/^\d{3}\?/.test(flat)) return { purpose: flat.trim(), name: null, iban: null, text: null };
  const sub = new Map<string, string>();
  for (const m of flat.slice(3).matchAll(/\?(\d{2})([^?]*)/g)) {
    const key = m[1] as string;
    sub.set(key, (sub.get(key) ?? '') + (m[2] ?? ''));
  }
  const purposeKeys = [
    '20',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
    '29',
    '60',
    '61',
    '62',
    '63',
  ];
  const purpose = purposeKeys
    .map((k) => sub.get(k) ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const name = `${sub.get('32') ?? ''}${sub.get('33') ?? ''}`.trim() || null;
  return {
    purpose,
    name,
    iban: sub.get('31')?.trim() || null,
    text: sub.get('00')?.trim() || null,
  };
}

/** SWIFT MT940 statement as exported by German online banking. */
export function importMt940(text: string): ImportResult {
  const fields = splitFields(text);
  if (!fields.some((f) => f.tag === '61'))
    throw new ImportError('Not an MT940 statement (no :61: lines)');
  const transactions: ParsedTransaction[] = [];
  const issues: ImportIssue[] = [];
  let currency: CurrencyCode = 'EUR';
  let line = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] as Field;
    if (f.tag === '60F' || f.tag === '60M') {
      const c = f.value.slice(7, 10);
      if (isCurrencyCode(c)) currency = c;
    }
    if (f.tag !== '61') continue;
    line++;
    try {
      // :61:YYMMDD[MMDD](C|D|RC|RD)[funds code]amount N... //bankref
      const m = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d+,\d{0,2})(.*)$/s.exec(f.value);
      if (!m) throw new ImportError(`Malformed :61: "${f.value}"`);
      const valueDate = yymmdd(m[1] as string);
      let bookingDate = valueDate;
      if (m[2]) {
        // Booking date has no year; take the value date's year, adjusting across year end.
        const year = Number(valueDate.slice(0, 4));
        const month = Number(m[2].slice(0, 2));
        const vMonth = Number(valueDate.slice(5, 7));
        const y =
          month === 12 && vMonth === 1 ? year - 1 : month === 1 && vMonth === 12 ? year + 1 : year;
        bookingDate = formatLocalDate(y, month, Number(m[2].slice(2, 4)));
      }
      const mark = m[3] as string;
      const abs = parseAmountToMinor(m[5] as string, currencyExponent(currency), 'de');
      const debit = mark === 'D' || mark === 'RC';
      const refMatch = /\/\/([^\n]*)/.exec(m[6] ?? '');
      const next = fields[i + 1];
      const details =
        next?.tag === '86'
          ? parse86(next.value)
          : { purpose: '', name: null, iban: null, text: null };
      transactions.push({
        bookingDate,
        valueDate,
        amountMinor: debit ? -abs : abs,
        currency,
        counterpartyName: details.name,
        counterpartyIban: details.iban,
        purpose: details.purpose,
        bookingText: details.text,
        status: 'booked',
        bankReference: refMatch?.[1]?.trim() || null,
      });
    } catch (e) {
      issues.push({ line, message: (e as Error).message });
    }
  }
  return { format: 'mt940', transactions, issues };
}
