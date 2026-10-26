import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { ENV, type Env } from '../../../config/env.js';

const INIT_TIMEOUT_MS = 120_000;
const RECOGNIZE_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} timed out after ${String(ms)} ms`));
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
 * Tesseract wrapper. One lazily created worker per process; recognitions are serialized.
 * Language data (OCR_LANGS) is downloaded on first use and cached in the temp directory.
 */
@Injectable()
export class OcrEngine implements OnModuleDestroy {
  private readonly logger = new Logger(OcrEngine.name);
  private worker: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(ENV) private readonly env: Env) {}

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const cachePath = join(tmpdir(), 'fp-tesseract');
      mkdirSync(cachePath, { recursive: true });
      this.worker = withTimeout(
        createWorker(this.env.OCR_LANGS, 1, { cachePath }),
        INIT_TIMEOUT_MS,
        'OCR initialisation',
      ).catch((e: unknown) => {
        this.worker = null;
        throw e;
      });
    }
    return this.worker;
  }

  /** Normalizes an image (orientation, grayscale, size) for better recognition. */
  async prepare(image: Buffer): Promise<Buffer> {
    return sharp(image, { failOn: 'none' })
      .rotate()
      .greyscale()
      .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  }

  /** Recognizes text in an image (JPEG, PNG, WebP, HEIC/AVIF via sharp …). */
  async recognize(image: Buffer): Promise<string> {
    const run = async () => {
      const png = await this.prepare(image);
      const worker = await this.getWorker();
      const result = await withTimeout(worker.recognize(png), RECOGNIZE_TIMEOUT_MS, 'OCR');
      return result.data.text;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async onModuleDestroy(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) {
      await w
        .then((worker) => worker.terminate())
        .catch((e: unknown) => {
          this.logger.debug(`OCR worker shutdown: ${(e as Error).message}`);
        });
    }
  }
}
