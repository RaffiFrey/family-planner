import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractPdfText, minimalPdf, PDF_MAX_BYTES, readPdf } from './pdf-text.js';

// Minimal valid PDF written by hand: one page, Helvetica, two lines of text.
const HAND_WRITTEN = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
  '4 0 obj << /Length 70 >> stream',
  'BT /F1 12 Tf 20 150 Td (Kfz-Versicherung) Tj 0 -16 Td (Nr. KV-123456) Tj ET',
  'endstream endobj',
  '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
].join('\n');

describe('PDF text layer', () => {
  it('extracts text from a hand-written PDF (without xref table)', async () => {
    const text = await extractPdfText(Buffer.from(HAND_WRITTEN, 'latin1'));
    expect(text).toContain('Kfz-Versicherung');
    expect(text).toContain('Nr. KV-123456');
  });

  it('keeps line breaks and respects the page cap', async () => {
    const pdf = minimalPdf(['Versicherungsschein (Hausrat)', 'gültig bis 31.12.2030']);
    expect(await extractPdfText(pdf)).toBe('Versicherungsschein (Hausrat)\ngültig bis 31.12.2030');
    expect(await extractPdfText(pdf, 0)).toBe('');
  });

  it('returns nothing for pages without a text layer and rejects garbage', async () => {
    expect(await extractPdfText(minimalPdf([]))).toBe('');
    await expect(extractPdfText(Buffer.from('not a pdf'))).rejects.toThrow();
    await expect(extractPdfText(Buffer.alloc(PDF_MAX_BYTES + 1))).rejects.toThrow(/too large/);
  });
});

describe('PDF rendering for OCR', () => {
  const darkPixels = async (png: Buffer) => {
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let i = 0; i < data.length; i += info.channels) if ((data[i] ?? 255) < 128) dark++;
    return dark;
  };

  it('renders pages with drawn text but no usable text layer to PNG', async () => {
    const pdf = await readPdf(minimalPdf(['GUELTIG 2030']));
    expect(pdf.pageCount).toBe(1);
    expect(pdf.text).toBe('GUELTIG 2030');
    expect(pdf.scans).toHaveLength(1);
    const png = pdf.scans[0] as Buffer;
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1224, 1584]);
    expect(await darkPixels(png)).toBeGreaterThan(100);
  });

  it('renders scans without any text and skips pages with a text layer', async () => {
    const scan = await readPdf(minimalPdf([], '0 0 0 rg 100 600 200 50 re f'));
    expect(scan.text).toBe('');
    expect(await darkPixels(scan.scans[0] as Buffer)).toBeGreaterThan(10_000);
    const textual = await readPdf(minimalPdf(['Versicherungsschein Nummer 12345678']));
    expect(textual.scans).toEqual([]);
    expect((await readPdf(minimalPdf([]), { maxRenderPages: 0 })).scans).toEqual([]);
  });
});
