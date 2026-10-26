import { describe, expect, it } from 'vitest';
import { mrzCheckDigit, mrzDate, mrzLines, parseMrz } from './mrz.js';
import { extractDates, suggestDocumentFields } from './ocr-text.js';
import {
  daysBetween,
  dueExpiryReminder,
  expiryState,
  lastChars,
  toPrefixTsQuery,
} from './vault.js';

// ICAO 9303 specimen documents.
const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');
const TD1 = [
  'I<UTOD231458907<<<<<<<<<<<<<<<',
  '7408122F1204159UTO<<<<<<<<<<<6',
  'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
].join('\n');
// German ID card (Personalausweis) specimen with recomputed check digits.
const NPA = [
  'IDD<<T220001293<<<<<<<<<<<<<<<',
  '6408125F3103153D<<<<<<<<<<<<<8',
  'MUSTERMANN<<ERIKA<<<<<<<<<<<<<',
].join('\n');

describe('MRZ', () => {
  it('computes ICAO check digits', () => {
    expect(mrzCheckDigit('L898902C3')).toBe(6);
    expect(mrzCheckDigit('740812')).toBe(2);
    expect(mrzCheckDigit('120415')).toBe(9);
    expect(mrzCheckDigit('<<<<<')).toBe(0);
  });

  it('parses a TD3 passport', () => {
    const r = parseMrz(TD3, 2010);
    expect(r).toMatchObject({
      format: 'TD3',
      documentType: 'P',
      issuingState: 'UTO',
      documentNumber: 'L898902C3',
      nationality: 'UTO',
      birthDate: '1974-08-12',
      expiryDate: '2012-04-15',
      sex: 'F',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      valid: true,
    });
  });

  it('parses a TD1 ID card', () => {
    const r = parseMrz(TD1, 2010);
    expect(r).toMatchObject({
      format: 'TD1',
      documentNumber: 'D23145890',
      birthDate: '1974-08-12',
      expiryDate: '2012-04-15',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      valid: true,
    });
  });

  it('parses a German ID card with OCR noise', () => {
    const noisy = `BUNDESREPUBLIK DEUTSCHLAND\n${NPA.replace('6408125F', '64O8125F').replace(/</g, (c, i: number) => (i % 7 === 0 ? '«' : c))}`;
    const r = parseMrz(noisy.toLowerCase().replace('idd', 'I D D'), 2026);
    expect(r?.documentNumber).toBe('T22000129');
    expect(r?.birthDate).toBe('1964-08-12');
    expect(r?.expiryDate).toBe('2031-03-15');
    expect(r?.sex).toBe('F');
    expect(r?.surname).toBe('MUSTERMANN');
    expect(r?.valid).toBe(true);
  });

  it('detects wrong check digits', () => {
    const bad = TD3.replace('L898902C36', 'L898902C37');
    const r = parseMrz(bad, 2010);
    expect(r?.valid).toBe(false);
    expect(r?.checks.documentNumber).toBe(false);
    expect(r?.checks.birthDate).toBe(true);
  });

  it('returns null without MRZ lines and handles odd dates', () => {
    expect(parseMrz('Hallo Welt\nkeine Zone hier')).toBeNull();
    expect(mrzDate('991332', 'expiry', 2026)).toBeNull();
    expect(mrzDate('AB1234', 'birth', 2026)).toBeNull();
    expect(mrzDate('990101', 'expiry', 2026)).toBe('1999-01-01');
    expect(mrzDate('250101', 'birth', 2026)).toBe('2025-01-01');
    expect(mrzLines('short<\nP<UTO' + '<'.repeat(39))).toHaveLength(1);
  });

  it('handles names without given names and unknown sex', () => {
    const l1 = 'P<UTOERIKSSON' + '<'.repeat(31);
    const r = parseMrz(`${l1}\nL898902C36UTO7408122<1204159ZE184226B<<<<<10`, 2010);
    expect(r?.surname).toBe('ERIKSSON');
    expect(r?.givenNames).toBe('');
    expect(r?.sex).toBe('X');
  });
});

describe('OCR heuristics', () => {
  it('extracts German, ISO and month-name dates', () => {
    const text =
      'Ausgestellt am 03.04.2021, gültig bis 2.4.31\nDatum: 2026-01-15\nGeburtstag 12. März 1985\nDATE 05 MAR/MÄR 2030 und 31.02.2020';
    const dates = extractDates(text, 2026).map((d) => d.date);
    expect(dates).toEqual(['2021-04-03', '2031-04-02', '2026-01-15', '1985-03-12', '2030-03-05']);
  });

  it('suggests fields from keywords', () => {
    const text = [
      'Allianz Versicherungs-AG',
      'Versicherungsschein-Nummer: AS-123/456-789',
      'Vertragsbeginn: 01.01.2024',
      'Vertragsende 31.12.2029',
      'Name: Frey',
    ].join('\n');
    const s = suggestDocumentFields(text, '2026-10-25');
    expect(s.expiresAt[0]).toMatchObject({ value: '2029-12-31', source: 'keyword' });
    expect(s.issuedAt[0]).toMatchObject({ value: '2024-01-01' });
    expect(s.documentNumber[0]).toMatchObject({ value: 'AS-123/456-789', source: 'keyword' });
    expect(s.holderName).toBeNull();
  });

  it('prefers the MRZ and falls back to the latest future date', () => {
    const s = suggestDocumentFields(`PERSONALAUSWEIS\nT22000129\n${NPA}`, '2026-10-25');
    expect(s.expiresAt[0]).toMatchObject({ value: '2031-03-15', source: 'mrz', confidence: 0.95 });
    expect(s.documentNumber[0]).toMatchObject({ value: 'T22000129', source: 'mrz' });
    expect(s.holderName).toBe('ERIKA MUSTERMANN');

    const fallback = suggestDocumentFields(
      'Zertifikat 01.02.2020 Prüfung 30.06.2028',
      '2026-10-25',
    );
    expect(fallback.expiresAt).toEqual([
      { value: '2028-06-30', source: 'latest_date', confidence: 0.3 },
    ]);
    expect(fallback.documentNumber).toEqual([]);
  });

  it('marks unverified MRZ data with low confidence', () => {
    const s = suggestDocumentFields(TD3.replace('L898902C36', 'L898902C37'), '2010-01-01');
    expect(s.documentNumber.find((d) => d.source === 'mrz')?.confidence).toBe(0.5);
  });

  it('finds German ID numbers by pattern', () => {
    const s = suggestDocumentFields('Karte LZ6311T47 ok', '2026-10-25');
    expect(s.documentNumber[0]).toMatchObject({ value: 'LZ6311T47', source: 'pattern' });
  });
});

describe('vault helpers', () => {
  it('computes expiry reminder thresholds', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(dueExpiryReminder('2027-10-25', '2026-10-25')).toBeNull();
    expect(dueExpiryReminder('2027-04-20', '2026-10-25')).toBe(183);
    expect(dueExpiryReminder('2026-11-14', '2026-10-25')).toBe(30);
    expect(dueExpiryReminder('2026-10-30', '2026-10-25')).toBe(7);
    expect(dueExpiryReminder('2026-10-25', '2026-10-25')).toBe(7);
    expect(dueExpiryReminder('2026-10-24', '2026-10-25')).toBeNull();
    expect(dueExpiryReminder('2026-11-14', '2026-10-25', [60, 14])).toBeNull();
    expect(dueExpiryReminder('2026-11-14', '2026-10-25', [60, 14], 60)).toBe(60);
    expect(dueExpiryReminder('2027-02-02', '2026-10-25')).toBeNull();
  });

  it('classifies expiry state', () => {
    expect(expiryState(null, '2026-10-25')).toBe('none');
    expect(expiryState('2026-10-01', '2026-10-25')).toBe('expired');
    expect(expiryState('2026-12-01', '2026-10-25')).toBe('expiring');
    expect(expiryState('2030-12-01', '2026-10-25')).toBe('valid');
  });

  it('builds display suffixes and search queries', () => {
    expect(lastChars('DE 1234-5678 X')).toBe('678X');
    expect(lastChars('ab', 4)).toBe('ab');
    expect(toPrefixTsQuery('  Reise-Pass  Müller ')).toBe('reise:* & pass:* & müller:*');
    expect(toPrefixTsQuery("'&|!")).toBeNull();
  });
});
