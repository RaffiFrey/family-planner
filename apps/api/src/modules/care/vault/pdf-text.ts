import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Maximum pages read from a PDF's text layer. */
/** The part of a 2D canvas context we use (the API build has no DOM typings). */
interface CanvasContext {
  fillStyle: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
}

export const PDF_MAX_PAGES = 20;
/** Maximum scanned pages rendered for OCR. */
export const PDF_MAX_RENDER_PAGES = 10;
/** Larger PDFs are not parsed (memory). */
export const PDF_MAX_BYTES = 30 * 1024 * 1024;
const MAX_CHARS = 200_000;
/** Pages with fewer visible characters in their text layer count as scanned. */
const MIN_TEXT_CHARS = 20;
const RENDER_SCALE = 2;
/** Upper bound for one rendered page (~ A4 at 300 dpi). */
const MAX_RENDER_PIXELS = 3000 * 4200;
const RENDER_TIMEOUT_MS = 60_000;

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

export interface PdfContent {
  /** Text layer of all read pages. */
  text: string;
  /** PNG renderings of pages without a usable text layer, for OCR. */
  scans: Buffer[];
  pageCount: number;
}

export interface ReadPdfOptions {
  maxPages?: number;
  /** 0 disables rendering. */
  maxRenderPages?: number;
  scale?: number;
}

let standardFontDataUrl: string | undefined;
function fontDataUrl(): string {
  if (!standardFontDataUrl) {
    const req = createRequire(import.meta.url);
    standardFontDataUrl = `${join(dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/`;
  }
  return standardFontDataUrl;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`PDF rendering timed out after ${String(ms)} ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Reads a PDF with pdfjs-dist (legacy Node build): the embedded text layer of up to
 * `maxPages` pages, and PNG renderings (via @napi-rs/canvas) of up to `maxRenderPages` pages
 * whose text layer is (nearly) empty, i.e. scanned pages that need OCR.
 * Throws for invalid or encrypted PDFs and failed renderings.
 */
export async function readPdf(
  data: Buffer | Uint8Array,
  options: ReadPdfOptions = {},
): Promise<PdfContent> {
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  const maxRenderPages = options.maxRenderPages ?? PDF_MAX_RENDER_PAGES;
  const scale = options.scale ?? RENDER_SCALE;
  if (data.byteLength > PDF_MAX_BYTES) throw new Error('PDF too large for text extraction');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js detaches the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: fontDataUrl(),
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    const scans: Buffer[] = [];
    let length = 0;
    for (let n = 1; n <= Math.min(doc.numPages, maxPages) && length < MAX_CHARS; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = (content.items as TextItemLike[])
        .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : ' '))
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
      pages.push(text);
      length += text.length;
      if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS && scans.length < maxRenderPages) {
        let viewport = page.getViewport({ scale });
        const pixels = viewport.width * viewport.height;
        if (pixels > MAX_RENDER_PIXELS)
          viewport = page.getViewport({ scale: scale * Math.sqrt(MAX_RENDER_PIXELS / pixels) });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const factory = doc.canvasFactory as {
          create: (
            w: number,
            h: number,
          ) => {
            canvas: { encode: (format: 'png') => Promise<Buffer>; width: number; height: number };
            context: CanvasContext;
          };
        };
        const { canvas, context } = factory.create(width, height);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        const render = page.render({
          // @napi-rs/canvas objects stand in for the DOM types pdfjs declares.
          canvas: canvas as never,
          canvasContext: context as never,
          viewport,
        });
        await withTimeout(render.promise, RENDER_TIMEOUT_MS, () => {
          render.cancel();
        });
        scans.push(await canvas.encode('png'));
      }
      page.cleanup();
    }
    return {
      text: pages.filter(Boolean).join('\n\n').slice(0, MAX_CHARS),
      scans,
      pageCount: doc.numPages,
    };
  } finally {
    await task.destroy();
  }
}

/** Text layer only (no rendering). */
export async function extractPdfText(
  data: Buffer | Uint8Array,
  maxPages = PDF_MAX_PAGES,
): Promise<string> {
  return (await readPdf(data, { maxPages, maxRenderPages: 0 })).text;
}

/**
 * Builds a minimal one-page PDF with Helvetica text lines (Latin-1) and optional raw graphics
 * operators (e.g. filled rectangles that simulate a scan without text layer); test fixture.
 */
export function minimalPdf(lines: readonly string[], graphics = ''): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 12 Tf 72 720 Td ${lines
    .map((l, i) => `${i ? '0 -16 Td ' : ''}(${esc(l)}) Tj`)
    .join(' ')} ET${graphics ? ` ${graphics}` : ''}`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${String(i + 1)} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out +=
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
