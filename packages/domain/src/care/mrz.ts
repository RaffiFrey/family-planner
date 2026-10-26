/**
 * Machine Readable Zone (ICAO 9303) parsing for passports (TD3, 2×44) and ID cards (TD1, 3×30).
 * Input is OCR text, so the parser tolerates spaces, lowercase letters and common
 * letter/digit confusions in numeric fields. Check digits are verified, not trusted.
 */

export type MrzFormat = 'TD1' | 'TD3';

export interface MrzResult {
  format: MrzFormat;
  documentType: string;
  issuingState: string;
  documentNumber: string;
  nationality: string;
  /** ISO date or null when unreadable. */
  birthDate: string | null;
  expiryDate: string | null;
  sex: 'M' | 'F' | 'X';
  surname: string;
  givenNames: string;
  checks: {
    documentNumber: boolean;
    birthDate: boolean;
    expiryDate: boolean;
    composite: boolean;
  };
  /** All check digits match. */
  valid: boolean;
}

const WEIGHTS = [7, 3, 1] as const;

function charValue(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return 0; // '<' filler
}

/** ICAO 9303 check digit (weights 7-3-1, mod 10). */
export function mrzCheckDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    sum += charValue(field[i] as string) * (WEIGHTS[i % 3] as number);
  }
  return sum % 10;
}

const TO_DIGIT: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
};

/** Fixes OCR confusions in fields that may only contain digits. */
function digits(s: string): string {
  return s.replace(/[A-Z]/g, (c) => TO_DIGIT[c] ?? c);
}

function checkOk(field: string, digit: string): boolean {
  const d = digits(digit);
  // A filler instead of a check digit is allowed for empty optional fields.
  if (d === '<') return /^<*$/.test(field);
  return /^\d$/.test(d) && Number(d) === mrzCheckDigit(field);
}

/** YYMMDD → ISO date. `kind` decides the century. */
export function mrzDate(
  yymmdd: string,
  kind: 'birth' | 'expiry',
  referenceYear: number,
): string | null {
  const d = digits(yymmdd);
  if (!/^\d{6}$/.test(d)) return null;
  const yy = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  let year = 2000 + yy;
  if (kind === 'birth' && year > referenceYear) year -= 100;
  if (kind === 'expiry' && year > referenceYear + 50) year -= 100;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

function clean(field: string): string {
  return field.replace(/<+$/g, '').replace(/</g, ' ').trim();
}

function names(field: string): { surname: string; givenNames: string } {
  const idx = field.indexOf('<<');
  if (idx < 0) return { surname: clean(field), givenNames: '' };
  return { surname: clean(field.slice(0, idx)), givenNames: clean(field.slice(idx + 2)) };
}

function sexOf(c: string): 'M' | 'F' | 'X' {
  return c === 'M' || c === 'F' ? c : 'X';
}

/** Normalizes OCR output into candidate MRZ lines. */
export function mrzLines(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 28 && l.includes('<'));
}

function fit(line: string, len: number): string {
  return line.length >= len ? line.slice(0, len) : line.padEnd(len, '<');
}

function parseTd3(l1: string, l2: string, referenceYear: number): MrzResult {
  const docNo = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);
  const composite =
    l2.slice(0, 10) + digits(l2.slice(13, 20)) + digits(l2.slice(21, 28)) + l2.slice(28, 43);
  const checks = {
    documentNumber: checkOk(docNo, l2.slice(9, 10)),
    birthDate: checkOk(digits(birth), l2.slice(19, 20)),
    expiryDate: checkOk(digits(expiry), l2.slice(27, 28)),
    composite: checkOk(composite, l2.slice(43, 44)),
  };
  return {
    format: 'TD3',
    documentType: clean(l1.slice(0, 2)),
    issuingState: clean(l1.slice(2, 5)),
    documentNumber: clean(docNo),
    nationality: clean(l2.slice(10, 13)),
    birthDate: mrzDate(birth, 'birth', referenceYear),
    expiryDate: mrzDate(expiry, 'expiry', referenceYear),
    sex: sexOf(l2.slice(20, 21)),
    ...names(l1.slice(5)),
    checks,
    valid: Object.values(checks).every(Boolean),
  };
}

function parseTd1(l1: string, l2: string, l3: string, referenceYear: number): MrzResult {
  const docNo = l1.slice(5, 14);
  const birth = l2.slice(0, 6);
  const expiry = l2.slice(8, 14);
  const composite =
    l1.slice(5, 30) + digits(l2.slice(0, 7)) + digits(l2.slice(8, 15)) + l2.slice(18, 29);
  const checks = {
    documentNumber: checkOk(docNo, l1.slice(14, 15)),
    birthDate: checkOk(digits(birth), l2.slice(6, 7)),
    expiryDate: checkOk(digits(expiry), l2.slice(14, 15)),
    composite: checkOk(composite, l2.slice(29, 30)),
  };
  return {
    format: 'TD1',
    documentType: clean(l1.slice(0, 2)),
    issuingState: clean(l1.slice(2, 5)),
    documentNumber: clean(docNo),
    nationality: clean(l2.slice(15, 18)),
    birthDate: mrzDate(birth, 'birth', referenceYear),
    expiryDate: mrzDate(expiry, 'expiry', referenceYear),
    sex: sexOf(l2.slice(7, 8)),
    ...names(l3),
    checks,
    valid: Object.values(checks).every(Boolean),
  };
}

/**
 * Finds and parses an MRZ in OCR text. Prefers results whose check digits validate.
 * Returns null when no MRZ-shaped lines are present.
 */
export function parseMrz(
  text: string,
  referenceYear = new Date().getUTCFullYear(),
): MrzResult | null {
  const lines = mrzLines(text);
  const results: MrzResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i] as string;
    const b = lines[i + 1];
    const c = lines[i + 2];
    if (b && a.length >= 40 && b.length >= 40 && /^P/.test(a)) {
      results.push(parseTd3(fit(a, 44), fit(b, 44), referenceYear));
    }
    if (b && c && a.length <= 34 && b.length <= 34 && /^[ACI]/.test(a)) {
      results.push(parseTd1(fit(a, 30), fit(b, 30), fit(c, 30), referenceYear));
    }
  }
  if (results.length === 0) return null;
  return results.find((r) => r.valid) ?? (results[0] as MrzResult);
}
