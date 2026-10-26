import { describe, expect, it } from 'vitest';
import { detectCsvPreset, importCsv, parseBankDate } from './csv-import.js';
import { importCamt } from './camt-import.js';
import { hashBatch, importHash } from './dedupe.js';
import { importStatement } from './index.js';
import { importMt940 } from './mt940-import.js';
import { ImportError } from './types.js';

const SPARKASSE = [
  '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"',
  '"DE00123";"24.10.26";"24.10.26";"FOLGELASTSCHRIFT";"Strom Oktober";"";"";"";"";"";"";"Stadtwerke Muenchen";"DE89 3704 0044 0532 0130 00";"COBADEFFXXX";"-85,00";"EUR";"Umsatz gebucht"',
  '"DE00123";"25.10.26";"25.10.26";"GUTSCHR. UEBERWEISUNG";"Gehalt 10/2026";"";"";"";"";"";"";"ACME GmbH";"DE02120300000000202051";"BYLADEM1001";"3.250,10";"EUR";"Umsatz vorgemerkt"',
  '"DE00123";"kaputt";"25.10.26";"X";"Y";"";"";"";"";"";"";"Z";"";"";"1,00";"EUR";""',
].join('\r\n');

const ING = [
  'Umsatzanzeige;Datei erstellt am: 25.10.2026 10:00',
  '',
  'IBAN;DE12 5001 0517 0000 0000 00',
  'Kontoname;Girokonto',
  'Bank;ING',
  '',
  'Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung',
  '23.10.2026;23.10.2026;REWE Markt;Lastschrift;REWE SAGT DANKE;1.234,56;EUR;-42,17;EUR',
].join('\n');

const DKB = [
  '"Girokonto";"DE123"',
  '""',
  '"Kontostand vom 25.10.2026:";"1.000,00 €"',
  '""',
  '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
  '"22.10.26";"22.10.26";"Gebucht";"Max Mustermann";"Netflix";"Abo";"Ausgang";"DE111";"-13,99 €";"";"";"REF1"',
  '"21.10.26";"21.10.26";"Vorgemerkt";"Oma Erika";"Max Mustermann";"Taschengeld";"Eingang";"DE222";"50,00 €";"";"";""',
].join('\n');

const N26 = [
  '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"',
  '2026-10-20,2026-10-20,"Spotify",,"Presentment","Premium","Main Account",-10.99,,,',
].join('\n');

describe('CSV import', () => {
  it('detects presets', () => {
    expect(detectCsvPreset(SPARKASSE)?.preset.id).toBe('sparkasse-camt');
    expect(detectCsvPreset(ING)?.preset.id).toBe('ing');
    expect(detectCsvPreset(ING)?.headerRow).toBe(4); // empty lines are skipped
    expect(detectCsvPreset(DKB)?.preset.id).toBe('dkb');
    expect(detectCsvPreset(N26)?.preset.id).toBe('n26');
    expect(detectCsvPreset('a;b;c\n1;2;3')).toBeNull();
  });

  it('imports Sparkasse with status and reports bad rows', () => {
    const res = importCsv(SPARKASSE);
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toMatchObject({
      bookingDate: '2026-10-24',
      amountMinor: -8500,
      counterpartyName: 'Stadtwerke Muenchen',
      counterpartyIban: 'DE89370400440532013000',
      purpose: 'Strom Oktober',
      status: 'booked',
    });
    expect(res.transactions[1]).toMatchObject({ amountMinor: 325010, status: 'pending' });
    expect(res.issues).toEqual([{ line: 4, message: 'Invalid date "kaputt"' }]);
  });

  it('imports ING with preamble and umlaut headers', () => {
    const [tx] = importCsv(ING).transactions;
    expect(tx).toMatchObject({
      bookingDate: '2026-10-23',
      amountMinor: -4217,
      counterpartyName: 'REWE Markt',
    });
  });

  it('imports DKB picking the counterparty side by direction', () => {
    const [out, inc] = importCsv(DKB).transactions;
    expect(out).toMatchObject({
      counterpartyName: 'Netflix',
      amountMinor: -1399,
      bankReference: 'REF1',
    });
    expect(inc).toMatchObject({
      counterpartyName: 'Oma Erika',
      amountMinor: 5000,
      status: 'pending',
    });
  });

  it('imports N26 with English decimals', () => {
    expect(importCsv(N26).transactions[0]).toMatchObject({
      amountMinor: -1099,
      bookingDate: '2026-10-20',
    });
  });

  it('supports forcing a preset and errors on unknown formats', () => {
    expect(importCsv(N26, { presetId: 'n26' }).format).toBe('n26');
    expect(() => importCsv(N26, { presetId: 'nope' })).toThrow(ImportError);
    expect(() => importCsv(N26, { presetId: 'ing' })).toThrow(ImportError);
    expect(() => importCsv('x,y\n1,2')).toThrow(ImportError);
  });

  it.each([
    ['01.02.2026', 'dd.MM.yyyy', '2026-02-01'],
    ['1.2.26', 'dd.MM.yy', '2026-02-01'],
    ['2026-02-01', 'yyyy-MM-dd', '2026-02-01'],
    ['02/01/2026', 'MM/dd/yyyy', '2026-02-01'],
  ] as const)('parses date %s', (v, f, exp) => {
    expect(parseBankDate(v, f)).toBe(exp);
  });

  it('rejects impossible dates', () => {
    expect(() => parseBankDate('31.02.2026', 'dd.MM.yyyy')).toThrow();
    expect(() => parseBankDate('x', 'yyyy-MM-dd')).toThrow();
    expect(() => parseBankDate('x', 'MM/dd/yyyy')).toThrow();
  });
});

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
 <BkToCstmrStmt><Stmt>
  <Ntry>
   <Amt Ccy="EUR">19.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
   <BookgDt><Dt>2026-10-01</Dt></BookgDt><ValDt><Dt>2026-10-02</Dt></ValDt>
   <AcctSvcrRef>REF-1</AcctSvcrRef><AddtlNtryInf>LASTSCHRIFT</AddtlNtryInf>
   <NtryDtls><TxDtls>
     <RltdPties><Cdtr><Pty><Nm>Telekom</Nm></Pty></Cdtr><CdtrAcct><Id><IBAN>DE111</IBAN></Id></CdtrAcct></RltdPties>
     <RmtInf><Ustrd>Rechnung</Ustrd><Ustrd>Oktober</Ustrd></RmtInf>
   </TxDtls></NtryDtls>
  </Ntry>
  <Ntry>
   <Amt Ccy="EUR">250.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>PDNG</Sts>
   <BookgDt><DtTm>2026-10-03T10:00:00</DtTm></BookgDt>
   <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Kindergeld</Nm></Dbtr></RltdPties></TxDtls></NtryDtls>
  </Ntry>
  <Ntry><CdtDbtInd>CRDT</CdtDbtInd></Ntry>
 </Stmt></BkToCstmrStmt>
</Document>`;

describe('CAMT.053 import', () => {
  it('parses entries', () => {
    const res = importCamt(CAMT);
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toEqual({
      bookingDate: '2026-10-01',
      valueDate: '2026-10-02',
      amountMinor: -1999,
      currency: 'EUR',
      counterpartyName: 'Telekom',
      counterpartyIban: 'DE111',
      purpose: 'Rechnung Oktober',
      bookingText: 'LASTSCHRIFT',
      status: 'booked',
      bankReference: 'REF-1',
    });
    expect(res.transactions[1]).toMatchObject({
      amountMinor: 25000,
      status: 'pending',
      counterpartyName: 'Kindergeld',
    });
    expect(res.issues).toHaveLength(1);
  });

  it('rejects other XML', () => {
    expect(() => importCamt('<foo/>')).toThrow(ImportError);
  });
});

const MT940 = `:20:STARTUMSE
:25:10020030/1234567
:28C:00001/001
:60F:C261020EUR1000,00
:61:2610211021DR42,17N005NONREF//BANKREF1
:86:005?00LASTSCHRIFT?20REWE SAGT?21 DANKE?3010010010?31DE89370400440532013000?32REWE Markt GmbH
:61:2612310102CR100,00N051NONREF
:86:Freitext Gutschrift
:62F:C261031EUR1057,83
-`;

describe('MT940 import', () => {
  it('parses :61: and structured :86:', () => {
    const res = importMt940(MT940);
    expect(res.transactions[0]).toEqual({
      bookingDate: '2026-10-21',
      valueDate: '2026-10-21',
      amountMinor: -4217,
      currency: 'EUR',
      counterpartyName: 'REWE Markt GmbH',
      counterpartyIban: 'DE89370400440532013000',
      purpose: 'REWE SAGT DANKE',
      bookingText: 'LASTSCHRIFT',
      status: 'booked',
      bankReference: 'BANKREF1',
    });
    // booking date in the following January
    expect(res.transactions[1]).toMatchObject({
      bookingDate: '2027-01-02',
      amountMinor: 10000,
      purpose: 'Freitext Gutschrift',
    });
  });

  it('rejects non-MT940', () => {
    expect(() => importMt940('hello')).toThrow(ImportError);
  });

  it('reports malformed lines', () => {
    expect(importMt940(':20:X\n:61:garbage').issues).toHaveLength(1);
  });
});

describe('importStatement', () => {
  it('dispatches by format', () => {
    expect(importStatement(CAMT).format).toBe('camt');
    expect(importStatement(MT940).format).toBe('mt940');
    expect(importStatement(N26).format).toBe('n26');
  });
});

describe('dedupe', () => {
  it('is stable and distinguishes identical transactions by occurrence', () => {
    const tx = importCsv(ING).transactions[0]!;
    expect(importHash('acc', tx, 0)).toBe(
      importHash('acc', { ...tx, purpose: '  rewe sagt   DANKE ' }, 0),
    );
    expect(importHash('acc', tx, 0)).not.toBe(importHash('acc2', tx, 0));
    const batch = hashBatch('acc', [tx, tx, { ...tx, amountMinor: 1 }]);
    expect(new Set(batch.map((b) => b.hash)).size).toBe(3);
    // re-importing the same file yields the same hashes
    expect(hashBatch('acc', [tx, tx]).map((b) => b.hash)).toEqual(
      batch.slice(0, 2).map((b) => b.hash),
    );
  });
});
