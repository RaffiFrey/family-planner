import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { apiContract, VaultDocument as VaultDocumentDto } from '@fp/contracts';
import { files, type Transaction, vaultDocuments } from '@fp/db';
import {
  DEFAULT_EXPIRY_LEAD_DAYS,
  dueExpiryReminder,
  expiryState,
  lastChars,
  suggestDocumentFields,
  toPrefixTsQuery,
} from '@fp/domain/care';
import {
  addFloating,
  floatingToLocalDate,
  localDateToFloating,
  toLocalDate,
} from '@fp/domain/time';
import { formatDate } from '@fp/i18n';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../../common/contract.js';
import { badRequest, forbidden, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { ENV, type Env } from '../../../config/env.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { Db, flushEvents, UnitEvents } from '../../../infra/database.js';
import { ObjectStorage } from '../../../infra/storage.service.js';
import { Queues } from '../../events/queues.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import {
  activeHouseholds,
  assertMembers,
  hasFeature,
  isAdultRole,
  once,
  requireFeature,
} from '../shared.js';
import { OcrEngine } from './ocr-engine.js';
import { PDF_MAX_BYTES, type PdfContent, readPdf } from './pdf-text.js';

type C = typeof apiContract.vault;
type DocRow = typeof vaultDocuments.$inferSelect;
type OcrStatus = DocRow['ocrStatus'];

const OCR_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'image/heic',
  'image/avif',
]);
const MAX_OCR_BYTES = 30 * 1024 * 1024;
const isPdf = (f: { mimeType: string }) => f.mimeType === 'application/pdf';
const MAX_OCR_WAIT_ATTEMPTS = 20;
const OCR_TEXT_LIMIT = 200_000;

function today(timeZone: string): string {
  return toLocalDate(new Date(), timeZone);
}

function snippet(row: DocRow, words: string[]): string | null {
  const sources = [row.ocrText, row.notes, row.issuer, row.title].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  for (const text of sources) {
    const lower = text.toLowerCase();
    for (const w of words) {
      const i = lower.indexOf(w);
      if (i >= 0) {
        const start = Math.max(0, i - 60);
        const end = Math.min(text.length, i + w.length + 60);
        return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
      }
    }
  }
  return null;
}

@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly queues: Queues,
    private readonly storage: ObjectStorage,
    private readonly ocr: OcrEngine,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('events', 'vault.ocr_requested', (job) =>
      this.queues.add('files', 'vault-ocr', {
        documentId: (job.data as { documentId: string }).documentId,
      }),
    );
    this.queues.on('files', 'vault-ocr', (job) => {
      const d = job.data as { documentId: string; attempt?: number };
      return this.processOcr(d.documentId, d.attempt ?? 0);
    });
  }

  // ------------------------------------------------------------------ mapping

  private toDto(row: DocRow, timeZone: string, decrypt = false): VaultDocumentDto {
    let documentNumber: string | null = null;
    if (decrypt && row.numberEncrypted) {
      try {
        documentNumber = this.crypto.decrypt(row.numberEncrypted);
      } catch (e) {
        this.logger.error(`Cannot decrypt document ${row.id}: ${(e as Error).message}`);
      }
    }
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      holderMemberId: row.holderMemberId,
      issuer: row.issuer,
      documentNumber,
      documentNumberLast4: row.numberLast4,
      issuedOn: row.issuedOn,
      expiresOn: row.expiresOn,
      expiryState: expiryState(row.expiresOn, today(timeZone)),
      notes: row.notes,
      fileIds: row.fileIds,
      tags: row.tags,
      reminderLeadDays: row.reminderLeadDays ?? [...DEFAULT_EXPIRY_LEAD_DAYS],
      visibility: row.visibility,
      sharedWith: row.sharedWith,
      ownerMemberId: row.ownerMemberId,
      ocrStatus: row.ocrStatus,
      suggestions: row.ocrSuggestions ?? null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private visible(ctx: HouseholdContext): SQL {
    return or(
      visibleTo(ctx.member.id, {
        visibility: vaultDocuments.visibility,
        owner: vaultDocuments.ownerMemberId,
        sharedWith: vaultDocuments.sharedWith,
      }),
      eq(vaultDocuments.holderMemberId, ctx.member.id),
    ) as SQL;
  }

  private async load(tx: Transaction, ctx: HouseholdContext, id: string): Promise<DocRow> {
    const [row] = await tx
      .select()
      .from(vaultDocuments)
      .where(and(eq(vaultDocuments.id, id), this.visible(ctx)));
    if (!row) throw notFound('Document');
    return row;
  }

  private assertCanEdit(ctx: HouseholdContext, row: DocRow): void {
    if (row.ownerMemberId === ctx.member.id || isAdultRole(ctx.member.role)) {
      if (row.visibility === 'private' && row.ownerMemberId !== ctx.member.id) throw forbidden();
      return;
    }
    throw forbidden();
  }

  private async assertFiles(tx: Transaction, ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const rows = await tx
      .select({ id: files.id })
      .from(files)
      .where(and(inArray(files.id, unique), isNull(files.deletedAt)));
    if (rows.length !== unique.length) throw badRequest('Unknown file', 'unknown_file');
  }

  /** OCR status for a document with these files, and whether to enqueue recognition. */
  private ocrPlan(ctx: HouseholdContext, fileIds: readonly string[]): OcrStatus {
    if (fileIds.length === 0) return 'none';
    if (!hasFeature(ctx.household.plan, 'ocr')) return 'none';
    if (!this.env.OCR_ENABLED) return 'disabled';
    return 'pending';
  }

  // ------------------------------------------------------------------ endpoints

  async list(ctx: HouseholdContext, input: In<C['list']>): Promise<Out<C['list']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    const q = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(vaultDocuments)
        .where(
          and(
            this.visible(ctx),
            q.holderMemberId ? eq(vaultDocuments.holderMemberId, q.holderMemberId) : undefined,
            q.type ? eq(vaultDocuments.type, q.type) : undefined,
            q.tag ? sql`${q.tag} = any(${vaultDocuments.tags})` : undefined,
          ),
        )
        .orderBy(asc(vaultDocuments.title));
      return rows.map((r) => this.toDto(r, ctx.household.timezone));
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const row = await this.load(tx, ctx, input.params.documentId);
      if (row.numberEncrypted) ev.audit('vault.document_viewed', 'document', row.id);
      return this.toDto(row, ctx.household.timezone, true);
    });
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [b.holderMemberId, ...(b.sharedWith ?? [])]);
      await this.assertFiles(tx, b.fileIds);
      const ocrStatus = this.ocrPlan(ctx, b.fileIds);
      const [row] = await tx
        .insert(vaultDocuments)
        .values({
          householdId: ctx.householdId,
          type: b.type,
          title: b.title,
          holderMemberId: b.holderMemberId ?? null,
          issuer: b.issuer ?? null,
          numberEncrypted: b.documentNumber ? this.crypto.encrypt(b.documentNumber) : null,
          numberLast4: b.documentNumber ? lastChars(b.documentNumber) : null,
          issuedOn: b.issuedOn ?? null,
          expiresOn: b.expiresOn ?? null,
          notes: b.notes ?? null,
          fileIds: [...new Set(b.fileIds)],
          tags: [...new Set(b.tags)],
          reminderLeadDays: b.reminderLeadDays ?? null,
          visibility: b.visibility,
          sharedWith: b.visibility === 'members' ? (b.sharedWith ?? []) : null,
          ownerMemberId: ctx.member.id,
          ocrStatus,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      if (ocrStatus === 'pending') ev.emit('vault.ocr_requested', { documentId: row.id });
      ev.changed('document', row.id, 'created');
      ev.audit('vault.document_created', 'document', row.id, { type: row.type });
      return this.toDto(row, ctx.household.timezone, true);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const row = await this.load(tx, ctx, input.params.documentId);
      this.assertCanEdit(ctx, row);
      await assertMembers(tx, [b.holderMemberId, ...(b.sharedWith ?? [])]);
      if (b.fileIds) await this.assertFiles(tx, b.fileIds);
      const { documentNumber, fileIds, tags, ...rest } = b;
      const patch: Partial<typeof vaultDocuments.$inferInsert> = { ...rest };
      if (documentNumber !== undefined) {
        patch.numberEncrypted = documentNumber ? this.crypto.encrypt(documentNumber) : null;
        patch.numberLast4 = documentNumber ? lastChars(documentNumber) : null;
      }
      if (tags) patch.tags = [...new Set(tags)];
      const visibility = b.visibility ?? row.visibility;
      if (b.visibility !== undefined || b.sharedWith !== undefined)
        patch.sharedWith = visibility === 'members' ? (b.sharedWith ?? row.sharedWith ?? []) : null;
      let requestOcr = false;
      if (fileIds) {
        const next = [...new Set(fileIds)];
        const changed = next.join(',') !== row.fileIds.join(',');
        patch.fileIds = next;
        if (changed) {
          patch.ocrStatus = this.ocrPlan(ctx, next);
          if (next.length === 0) {
            patch.ocrText = null;
            patch.ocrSuggestions = null;
          }
          requestOcr = patch.ocrStatus === 'pending';
        }
      }
      const [updated] = await tx
        .update(vaultDocuments)
        .set(patch)
        .where(eq(vaultDocuments.id, row.id))
        .returning();
      if (!updated) throw notFound('Document');
      if (requestOcr) ev.emit('vault.ocr_requested', { documentId: row.id });
      ev.changed('document', row.id, 'updated');
      if (documentNumber !== undefined) ev.audit('vault.number_changed', 'document', row.id);
      return this.toDto(updated, ctx.household.timezone, true);
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const row = await this.load(tx, ctx, input.params.documentId);
      this.assertCanEdit(ctx, row);
      await tx.delete(vaultDocuments).where(eq(vaultDocuments.id, row.id));
      ev.changed('document', row.id, 'deleted');
      ev.audit('vault.document_deleted', 'document', row.id, { type: row.type });
    });
    return OK;
  }

  async expiring(ctx: HouseholdContext, input: In<C['expiring']>): Promise<Out<C['expiring']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    const tz = ctx.household.timezone;
    const until = floatingToLocalDate(
      addFloating(localDateToFloating(today(tz)), input.query.days, 'day'),
    );
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(vaultDocuments)
        .where(
          and(
            this.visible(ctx),
            isNotNull(vaultDocuments.expiresOn),
            lte(vaultDocuments.expiresOn, until),
          ),
        )
        .orderBy(asc(vaultDocuments.expiresOn));
      return rows.map((r) => this.toDto(r, tz));
    });
  }

  async search(ctx: HouseholdContext, input: In<C['search']>): Promise<Out<C['search']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    const { q, limit } = input.query;
    const tsq = toPrefixTsQuery(q);
    const words = q
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      let hits: { row: DocRow; rank: number }[] = [];
      if (tsq) {
        const query = sql`to_tsquery('german', ${tsq})`;
        const rows = await tx
          .select({
            row: vaultDocuments,
            rank: sql<number>`ts_rank(${vaultDocuments.search}, ${query})`,
          })
          .from(vaultDocuments)
          .where(and(this.visible(ctx), sql`${vaultDocuments.search} @@ ${query}`))
          .orderBy(desc(sql`ts_rank(${vaultDocuments.search}, ${query})`))
          .limit(limit);
        hits = rows.map((r) => ({ row: r.row, rank: r.rank }));
      }
      if (hits.length === 0) {
        // Fallback for partial words and numbers the German stemmer splits differently.
        const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const rows = await tx
          .select()
          .from(vaultDocuments)
          .where(
            and(
              this.visible(ctx),
              or(
                sql`${vaultDocuments.title} ilike ${pattern}`,
                sql`${vaultDocuments.issuer} ilike ${pattern}`,
                sql`${vaultDocuments.notes} ilike ${pattern}`,
                sql`${vaultDocuments.ocrText} ilike ${pattern}`,
              ),
            ),
          )
          .orderBy(asc(vaultDocuments.title))
          .limit(limit);
        hits = rows.map((row) => ({ row, rank: 0 }));
      }
      return hits.map((h) => ({
        document: this.toDto(h.row, ctx.household.timezone),
        snippet: snippet(h.row, words),
        rank: h.rank,
      }));
    });
  }

  async runOcr(ctx: HouseholdContext, input: In<C['runOcr']>): Promise<Out<C['runOcr']>> {
    requireFeature(ctx, 'vault', 'The document vault');
    requireFeature(ctx, 'ocr', 'Text recognition');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const row = await this.load(tx, ctx, input.params.documentId);
      this.assertCanEdit(ctx, row);
      if (row.fileIds.length === 0) throw badRequest('The document has no files', 'no_files');
      const status = this.ocrPlan(ctx, row.fileIds);
      const [updated] = await tx
        .update(vaultDocuments)
        .set({ ocrStatus: status })
        .where(eq(vaultDocuments.id, row.id))
        .returning();
      if (!updated) throw notFound('Document');
      if (status === 'pending') ev.emit('vault.ocr_requested', { documentId: row.id });
      ev.changed('document', row.id, 'updated');
      return this.toDto(updated, ctx.household.timezone);
    });
  }

  // ------------------------------------------------------------------ workers

  private async finishOcr(
    doc: DocRow,
    patch: Partial<typeof vaultDocuments.$inferInsert>,
  ): Promise<void> {
    const events = new UnitEvents();
    await this.db.system.transaction(async (tx) => {
      await tx
        .update(vaultDocuments)
        .set({ ...patch, ocrAt: new Date() })
        .where(and(eq(vaultDocuments.id, doc.id), eq(vaultDocuments.householdId, doc.householdId)));
      events.changed('document', doc.id, 'updated');
      await flushEvents(tx, { householdId: doc.householdId, memberId: null, userId: null }, events);
    });
  }

  /**
   * Worker: recognizes text in the document's image files once they passed the virus scan.
   * PDFs contribute their embedded text layer (first 20 pages); scanned pages are rendered
   * (up to 10) and OCR'd. Only encrypted/unreadable PDFs count as unsupported.
   */
  async processOcr(documentId: string, attempt = 0): Promise<void> {
    const [doc] = await this.db.system
      .select()
      .from(vaultDocuments)
      .where(eq(vaultDocuments.id, documentId));
    if (!doc || doc.ocrStatus !== 'pending') return;
    const fileRows = doc.fileIds.length
      ? await this.db.system
          .select()
          .from(files)
          .where(
            and(
              inArray(files.id, doc.fileIds),
              eq(files.householdId, doc.householdId),
              isNull(files.deletedAt),
            ),
          )
      : [];
    const waiting = fileRows.some((f) => f.status === 'scanning' || f.status === 'pending_upload');
    if (waiting && attempt < MAX_OCR_WAIT_ATTEMPTS) {
      await this.queues.add(
        'files',
        'vault-ocr',
        { documentId, attempt: attempt + 1 },
        { delay: 30_000 },
      );
      return;
    }
    const sources = fileRows.filter(
      (f) =>
        f.status === 'ready' &&
        (OCR_IMAGE_TYPES.has(f.mimeType) || isPdf(f)) &&
        f.sizeBytes <= Math.min(MAX_OCR_BYTES, PDF_MAX_BYTES),
    );
    if (sources.length === 0) {
      await this.finishOcr(doc, { ocrStatus: 'unsupported' });
      return;
    }
    try {
      const texts: string[] = [];
      let unreadablePdfs = 0;
      for (const f of sources) {
        const data = await this.storage.getBuffer(f.storageKey);
        if (!isPdf(f)) {
          texts.push((await this.ocr.recognize(data)).trim());
          continue;
        }
        let pdf: PdfContent;
        try {
          pdf = await readPdf(data);
        } catch (e) {
          // Encrypted, corrupt or unrenderable PDFs.
          this.logger.warn(`PDF ${f.id} unreadable: ${(e as Error).message}`);
          unreadablePdfs++;
          continue;
        }
        texts.push(pdf.text.trim());
        for (const scan of pdf.scans) texts.push((await this.ocr.recognize(scan)).trim());
      }
      if (unreadablePdfs === sources.length) {
        await this.finishOcr(doc, { ocrStatus: 'unsupported' });
        return;
      }
      await this.applyOcrText(doc, texts.filter(Boolean).join('\n\n'));
    } catch (e) {
      this.logger.warn(`OCR for document ${doc.id} failed: ${(e as Error).message}`);
      await this.finishOcr(doc, { ocrStatus: 'failed' });
    }
  }

  /** Stores recognized text and the derived field suggestions. */
  async applyOcrText(doc: DocRow, text: string): Promise<void> {
    const [h] = [...(await activeHouseholds(this.db, [doc.householdId])).values()];
    const clipped = text.slice(0, OCR_TEXT_LIMIT);
    await this.finishOcr(doc, {
      ocrStatus: 'done',
      ocrText: clipped,
      ocrSuggestions: suggestDocumentFields(clipped, today(h?.timezone ?? 'Europe/Berlin')),
    });
  }

  /** Re-enqueues documents stuck in "pending" (e.g. after a worker restart). */
  async ocrSweep(now = new Date()): Promise<number> {
    if (!this.env.OCR_ENABLED) return 0;
    const stale = await this.db.system
      .select({ id: vaultDocuments.id })
      .from(vaultDocuments)
      .where(
        and(
          eq(vaultDocuments.ocrStatus, 'pending'),
          lte(vaultDocuments.updatedAt, new Date(now.getTime() - 30 * 60_000)),
          gte(vaultDocuments.updatedAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      )
      .limit(50);
    for (const d of stale) {
      await this.queues.add(
        'files',
        'vault-ocr',
        { documentId: d.id },
        { jobId: `vault-ocr-${d.id}` },
      );
    }
    return stale.length;
  }

  /** Daily job: expiry reminders 6 months / 1 month / 1 week ahead (configurable per document). */
  async expiryReminders(now = new Date()): Promise<number> {
    const horizon = floatingToLocalDate(
      addFloating(localDateToFloating(toLocalDate(now, 'UTC')), 731, 'day'),
    );
    const yesterday = floatingToLocalDate(
      addFloating(localDateToFloating(toLocalDate(now, 'UTC')), -1, 'day'),
    );
    const rows = await this.db.system
      .select()
      .from(vaultDocuments)
      .where(
        and(
          isNotNull(vaultDocuments.expiresOn),
          gte(vaultDocuments.expiresOn, yesterday),
          lte(vaultDocuments.expiresOn, horizon),
        ),
      );
    const hh = await activeHouseholds(
      this.db,
      rows.map((r) => r.householdId),
    );
    let sent = 0;
    for (const doc of rows) {
      const h = hh.get(doc.householdId);
      if (!h || !hasFeature(h.plan, 'vault') || !doc.expiresOn) continue;
      const lead = dueExpiryReminder(
        doc.expiresOn,
        toLocalDate(now, h.timezone),
        doc.reminderLeadDays ?? DEFAULT_EXPIRY_LEAD_DAYS,
      );
      if (lead === null) continue;
      if (
        !(await once(this.db, doc.householdId, `vault:${doc.id}:${doc.expiresOn}:${String(lead)}`))
      )
        continue;
      const recipients =
        doc.visibility === 'private'
          ? [doc.ownerMemberId]
          : [doc.ownerMemberId, ...(doc.holderMemberId ? [doc.holderMemberId] : [])];
      await this.notifications.notify({
        householdId: doc.householdId,
        memberIds: [...new Set(recipients)],
        type: 'vault.document_expiring',
        message: 'notifications.documentExpiring',
        vars: { name: doc.title, date: formatDate(`${doc.expiresOn}T00:00:00Z`, 'de', 'UTC') },
        link: `/vault/${doc.id}`,
      });
      sent++;
    }
    return sent;
  }
}
