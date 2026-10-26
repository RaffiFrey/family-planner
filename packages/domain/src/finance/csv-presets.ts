import type { DecimalStyle } from '../money/money.js';

export type DateFormat = 'dd.MM.yyyy' | 'dd.MM.yy' | 'yyyy-MM-dd' | 'MM/dd/yyyy';

/**
 * Column mapping for a bank CSV export. Header names are matched case-insensitively
 * after normalising umlauts, so "Währung" and "Waehrung" both match.
 */
export interface CsvPreset {
  id: string;
  name: string;
  delimiter: ';' | ',' | '\t';
  decimal: DecimalStyle;
  dateFormat: DateFormat;
  /** Columns that must all be present in the header row to auto-detect this preset. */
  detect: readonly string[];
  columns: {
    bookingDate: string;
    valueDate?: string;
    amount?: string;
    /** Banks that split debit/credit into two columns. */
    debit?: string;
    credit?: string;
    currency?: string;
    counterpartyName?: string | readonly string[];
    counterpartyIban?: string;
    purpose?: string;
    bookingText?: string;
    status?: string;
    reference?: string;
  };
  /** Status cell values meaning "not yet booked". */
  pendingValues?: readonly string[];
}

export const CSV_PRESETS: readonly CsvPreset[] = [
  {
    id: 'sparkasse-camt',
    name: 'Sparkasse (CSV-CAMT V2)',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yy',
    detect: ['Auftragskonto', 'Buchungstag', 'Beguenstigter/Zahlungspflichtiger', 'Betrag'],
    columns: {
      bookingDate: 'Buchungstag',
      valueDate: 'Valutadatum',
      amount: 'Betrag',
      currency: 'Waehrung',
      counterpartyName: 'Beguenstigter/Zahlungspflichtiger',
      counterpartyIban: 'Kontonummer/IBAN',
      purpose: 'Verwendungszweck',
      bookingText: 'Buchungstext',
      status: 'Info',
    },
    pendingValues: ['Umsatz vorgemerkt'],
  },
  {
    id: 'ing',
    name: 'ING',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yyyy',
    detect: ['Buchung', 'Auftraggeber/Empfaenger', 'Verwendungszweck', 'Betrag'],
    columns: {
      bookingDate: 'Buchung',
      valueDate: 'Wertstellungsdatum',
      amount: 'Betrag',
      currency: 'Waehrung',
      counterpartyName: 'Auftraggeber/Empfaenger',
      purpose: 'Verwendungszweck',
      bookingText: 'Buchungstext',
    },
  },
  {
    id: 'dkb',
    name: 'DKB',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yy',
    detect: ['Buchungsdatum', 'Zahlungspflichtige*r', 'Zahlungsempfaenger*in', 'Betrag (EUR)'],
    columns: {
      bookingDate: 'Buchungsdatum',
      valueDate: 'Wertstellung',
      amount: 'Betrag (EUR)',
      counterpartyName: ['Zahlungsempfaenger*in', 'Zahlungspflichtige*r'],
      counterpartyIban: 'IBAN',
      purpose: 'Verwendungszweck',
      bookingText: 'Umsatztyp',
      status: 'Status',
      reference: 'Kundenreferenz',
    },
    pendingValues: ['Vorgemerkt'],
  },
  {
    id: 'n26',
    name: 'N26',
    delimiter: ',',
    decimal: 'en',
    dateFormat: 'yyyy-MM-dd',
    detect: ['Booking Date', 'Partner Name', 'Amount (EUR)'],
    columns: {
      bookingDate: 'Booking Date',
      valueDate: 'Value Date',
      amount: 'Amount (EUR)',
      counterpartyName: 'Partner Name',
      counterpartyIban: 'Partner Iban',
      purpose: 'Payment Reference',
      bookingText: 'Type',
    },
  },
  {
    id: 'commerzbank',
    name: 'Commerzbank',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yyyy',
    detect: ['Buchungstag', 'Umsatzart', 'Buchungstext', 'Betrag', 'IBAN Kontoinhaber'],
    columns: {
      bookingDate: 'Buchungstag',
      valueDate: 'Wertstellung',
      amount: 'Betrag',
      currency: 'Waehrung',
      purpose: 'Buchungstext',
      bookingText: 'Umsatzart',
    },
  },
  {
    id: 'volksbank',
    name: 'Volksbank / Raiffeisenbank',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yyyy',
    detect: ['Buchungstag', 'Name Zahlungsbeteiligter', 'IBAN Zahlungsbeteiligter', 'Betrag'],
    columns: {
      bookingDate: 'Buchungstag',
      valueDate: 'Valutadatum',
      amount: 'Betrag',
      currency: 'Waehrung',
      counterpartyName: 'Name Zahlungsbeteiligter',
      counterpartyIban: 'IBAN Zahlungsbeteiligter',
      purpose: 'Verwendungszweck',
      bookingText: 'Buchungstext',
    },
  },
  {
    id: 'generic',
    name: 'Generic (Date;Amount;Payee;Purpose)',
    delimiter: ';',
    decimal: 'de',
    dateFormat: 'dd.MM.yyyy',
    detect: ['Datum', 'Betrag', 'Empfaenger', 'Verwendungszweck'],
    columns: {
      bookingDate: 'Datum',
      amount: 'Betrag',
      counterpartyName: 'Empfaenger',
      purpose: 'Verwendungszweck',
    },
  },
];

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/€/g, 'eur')
    .replace(/\s+/g, ' ');
}

export function getPreset(id: string): CsvPreset | undefined {
  return CSV_PRESETS.find((p) => p.id === id);
}
