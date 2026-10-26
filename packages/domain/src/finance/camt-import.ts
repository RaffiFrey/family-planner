import { XMLParser } from 'fast-xml-parser';
import {
  type CurrencyCode,
  currencyExponent,
  isCurrencyCode,
  parseAmountToMinor,
} from '../money/money.js';
import {
  ImportError,
  type ImportIssue,
  type ImportResult,
  type ParsedTransaction,
} from './types.js';

type XmlNode = Record<string, unknown>;

const ARRAY_PATHS = new Set(['Stmt', 'Ntry', 'NtryDtls', 'TxDtls', 'Ustrd']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_PATHS.has(name),
});

function node(v: unknown): XmlNode | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : undefined;
}

function path(root: unknown, ...keys: string[]): unknown {
  let cur: unknown = root;
  for (const k of keys) {
    const n = Array.isArray(cur) ? node(cur[0]) : node(cur);
    if (!n) return undefined;
    cur = n[k];
  }
  return cur;
}

function text(v: unknown): string | null {
  if (typeof v === 'string') return v;
  const n = node(v);
  if (n && typeof n['#text'] === 'string') return n['#text'];
  return null;
}

function list(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function dateOf(v: unknown): string | null {
  const d = text(path(v, 'Dt')) ?? text(path(v, 'DtTm'));
  return d ? d.slice(0, 10) : null;
}

/** ISO 20022 CAMT.053 bank-to-customer statement (also accepts CAMT.052 reports). */
export function importCamt(xml: string): ImportResult {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new ImportError(`Invalid XML: ${(e as Error).message}`);
  }
  const root = path(doc, 'Document');
  const container = path(root, 'BkToCstmrStmt') ?? path(root, 'BkToCstmrAcctRpt');
  if (!container) throw new ImportError('Not a CAMT.053/052 document');
  const statements = list(path(container, 'Stmt') ?? path(container, 'Rpt'));

  const transactions: ParsedTransaction[] = [];
  const issues: ImportIssue[] = [];
  let index = 0;
  for (const stmt of statements) {
    for (const entry of list(path(stmt, 'Ntry'))) {
      index++;
      try {
        const amt = path(entry, 'Amt');
        const ccy = node(amt)?.['@Ccy'];
        const currency: CurrencyCode = typeof ccy === 'string' && isCurrencyCode(ccy) ? ccy : 'EUR';
        const raw = text(amt);
        if (!raw) throw new ImportError('Entry without amount');
        const abs = Math.abs(parseAmountToMinor(raw, currencyExponent(currency), 'en'));
        const debit = text(path(entry, 'CdtDbtInd')) === 'DBIT';
        const amountMinor = debit ? -abs : abs;
        const tx = path(entry, 'NtryDtls', 'TxDtls');
        const party = debit ? 'Cdtr' : 'Dbtr';
        const name =
          text(path(tx, 'RltdPties', party, 'Nm')) ??
          text(path(tx, 'RltdPties', party, 'Pty', 'Nm'));
        const iban = text(path(tx, 'RltdPties', `${party}Acct`, 'Id', 'IBAN')) ?? null;
        const purpose = list(path(tx, 'RmtInf', 'Ustrd'))
          .map((u) => text(u) ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const status = text(path(entry, 'Sts')) ?? text(path(entry, 'Sts', 'Cd'));
        const bookingDate = dateOf(path(entry, 'BookgDt'));
        if (!bookingDate) throw new ImportError('Entry without booking date');
        transactions.push({
          bookingDate,
          valueDate: dateOf(path(entry, 'ValDt')),
          amountMinor,
          currency,
          counterpartyName: name,
          counterpartyIban: iban,
          purpose,
          bookingText: text(path(entry, 'AddtlNtryInf')),
          status: status === 'PDNG' ? 'pending' : 'booked',
          bankReference: text(path(entry, 'AcctSvcrRef')) ?? text(path(tx, 'Refs', 'EndToEndId')),
        });
      } catch (e) {
        issues.push({ line: index, message: (e as Error).message });
      }
    }
  }
  return { format: 'camt', transactions, issues };
}
