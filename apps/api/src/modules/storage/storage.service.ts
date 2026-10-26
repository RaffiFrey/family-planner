import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { apiContract, Folder as FolderDto, StoredFile } from '@fp/contracts';
import { files, folders, type Transaction } from '@fp/db';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { type In, iso, OK, type Out } from '../../common/contract.js';
import { badRequest, conflict, forbidden, notFound, planLimit } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { ENV, type Env } from '../../config/env.js';
import { Db, flushEvents, UnitEvents } from '../../infra/database.js';
import { ObjectStorage } from '../../infra/storage.service.js';
import { entitlementsFor } from '../billing/entitlements.js';
import { Queues } from '../events/queues.js';
import { scanWithClamd } from './clamav.js';

type C = typeof apiContract.storage;
type FolderRow = typeof folders.$inferSelect;
type FileRow = typeof files.$inferSelect;

const THUMB_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/avif',
]);
const MAX_PROCESS_BYTES = 200 * 1024 * 1024;

function toFolder(f: FolderRow): FolderDto {
  return {
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    visibility: f.visibility,
    ownerMemberId: f.ownerMemberId,
    createdAt: iso(f.createdAt),
  };
}

function toFile(f: FileRow): StoredFile {
  return {
    id: f.id,
    folderId: f.folderId,
    name: f.name,
    sizeBytes: f.sizeBytes,
    mimeType: f.mimeType,
    status: f.status,
    hasThumbnail: f.thumbnailKey !== null,
    visibility: f.visibility,
    ownerMemberId: f.ownerMemberId,
    createdAt: iso(f.createdAt),
  };
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly db: Db,
    private readonly storage: ObjectStorage,
    private readonly queues: Queues,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('events', 'storage.file_uploaded', (job) =>
      this.queues.add('files', 'process', { fileId: (job.data as { fileId: string }).fileId }),
    );
    this.queues.on('files', 'process', (job) => this.process(job.data as { fileId: string }));
    this.queues.on('events', 'storage.delete_objects', (job) =>
      this.storage.deleteMany((job.data as { keys: string[] }).keys),
    );
  }

  private visibleFolders(ctx: HouseholdContext) {
    return visibleTo(ctx.member.id, {
      visibility: folders.visibility,
      owner: folders.ownerMemberId,
    });
  }

  private visibleFiles(ctx: HouseholdContext) {
    return and(
      isNull(files.deletedAt),
      visibleTo(ctx.member.id, { visibility: files.visibility, owner: files.ownerMemberId }),
    );
  }

  private async loadFolder(tx: Transaction, ctx: HouseholdContext, id: string): Promise<FolderRow> {
    const [f] = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), this.visibleFolders(ctx)));
    if (!f) throw notFound('Folder');
    return f;
  }

  private async loadFile(tx: Transaction, ctx: HouseholdContext, id: string): Promise<FileRow> {
    const [f] = await tx
      .select()
      .from(files)
      .where(and(eq(files.id, id), this.visibleFiles(ctx)));
    if (!f) throw notFound('File');
    return f;
  }

  private assertOwnerOrAdmin(ctx: HouseholdContext, ownerMemberId: string): void {
    if (ownerMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
      throw forbidden();
  }

  async browse(ctx: HouseholdContext, input: In<C['browse']>): Promise<Out<C['browse']>> {
    const folderId = input.query.folderId ?? null;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const folder = folderId ? await this.loadFolder(tx, ctx, folderId) : null;
      const breadcrumbs: { id: string; name: string }[] = [];
      let parentId = folder?.parentId ?? null;
      for (let depth = 0; parentId && depth < 50; depth++) {
        const [p] = await tx.select().from(folders).where(eq(folders.id, parentId));
        if (!p) break;
        breadcrumbs.unshift({ id: p.id, name: p.name });
        parentId = p.parentId;
      }
      const subfolders = await tx
        .select()
        .from(folders)
        .where(
          and(
            folderId ? eq(folders.parentId, folderId) : isNull(folders.parentId),
            this.visibleFolders(ctx),
          ),
        )
        .orderBy(folders.name);
      const fileRows = await tx
        .select()
        .from(files)
        .where(
          and(
            folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
            this.visibleFiles(ctx),
            ne(files.status, 'pending_upload'),
          ),
        )
        .orderBy(files.name);
      return {
        folder: folder ? toFolder(folder) : null,
        breadcrumbs,
        folders: subfolders.map(toFolder),
        files: fileRows.map(toFile),
      };
    });
  }

  async createFolder(
    ctx: HouseholdContext,
    input: In<C['createFolder']>,
  ): Promise<Out<C['createFolder']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      if (input.body.parentId) await this.loadFolder(tx, ctx, input.body.parentId);
      const [f] = await tx
        .insert(folders)
        .values({ householdId: ctx.householdId, ...input.body, ownerMemberId: ctx.member.id })
        .returning();
      if (!f) throw new Error('insert failed');
      ev.changed('folder', f.id, 'created', f.parentId);
      return toFolder(f);
    });
  }

  private async descendantFolderIds(tx: Transaction, rootId: string): Promise<string[]> {
    const rows = await tx.execute<{ id: string }>(sql`
      with recursive tree as (
        select id from folders where id = ${rootId}
        union all
        select f.id from folders f join tree t on f.parent_id = t.id
      ) select id from tree`);
    return rows.rows.map((r) => r.id);
  }

  async updateFolder(
    ctx: HouseholdContext,
    input: In<C['updateFolder']>,
  ): Promise<Out<C['updateFolder']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const f = await this.loadFolder(tx, ctx, input.params.folderId);
      this.assertOwnerOrAdmin(ctx, f.ownerMemberId);
      if (input.body.parentId) {
        await this.loadFolder(tx, ctx, input.body.parentId);
        if ((await this.descendantFolderIds(tx, f.id)).includes(input.body.parentId)) {
          throw badRequest('A folder cannot be moved into itself', 'folder_cycle');
        }
      }
      const [row] = await tx
        .update(folders)
        .set(input.body)
        .where(eq(folders.id, f.id))
        .returning();
      if (!row) throw notFound('Folder');
      ev.changed('folder', row.id, 'updated', row.parentId);
      return toFolder(row);
    });
  }

  async deleteFolder(
    ctx: HouseholdContext,
    input: In<C['deleteFolder']>,
  ): Promise<Out<C['deleteFolder']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const f = await this.loadFolder(tx, ctx, input.params.folderId);
      this.assertOwnerOrAdmin(ctx, f.ownerMemberId);
      const ids = await this.descendantFolderIds(tx, f.id);
      const removed = await tx
        .update(files)
        .set({ deletedAt: new Date() })
        .where(and(inArray(files.folderId, ids), isNull(files.deletedAt)))
        .returning({ key: files.storageKey, thumb: files.thumbnailKey });
      await tx.update(files).set({ folderId: null }).where(inArray(files.folderId, ids));
      await tx.delete(folders).where(inArray(folders.id, ids));
      this.scheduleObjectDeletion(ev, removed);
      ev.changed('folder', f.id, 'deleted', f.parentId);
      ev.audit('folder.deleted', 'folder', f.id, { name: f.name, files: removed.length });
    });
    return OK;
  }

  private scheduleObjectDeletion(
    ev: UnitEvents,
    removed: { key: string; thumb: string | null }[],
  ): void {
    const keys = removed.flatMap((r) => (r.thumb ? [r.key, r.thumb] : [r.key]));
    if (keys.length > 0) ev.emit('storage.delete_objects', { keys });
  }

  async usage(ctx: HouseholdContext): Promise<Out<C['usage']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [u] = await tx
        .select({
          bytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
          n: sql<number>`count(*)::int`,
        })
        .from(files)
        .where(isNull(files.deletedAt));
      return {
        usedBytes: u?.bytes ?? 0,
        quotaBytes: entitlementsFor(ctx.household.plan).storageQuotaBytes,
        fileCount: u?.n ?? 0,
      };
    });
  }

  async createUpload(
    ctx: HouseholdContext,
    input: In<C['createUpload']>,
  ): Promise<Out<C['createUpload']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      if (b.folderId) await this.loadFolder(tx, ctx, b.folderId);
      const [u] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint` })
        .from(files)
        .where(isNull(files.deletedAt));
      const quota = entitlementsFor(ctx.household.plan).storageQuotaBytes;
      if ((u?.bytes ?? 0) + b.sizeBytes > quota) throw planLimit('Storage quota exceeded');
      const id = uuidv7();
      const key = `${ctx.householdId}/${id}`;
      const [f] = await tx
        .insert(files)
        .values({
          id,
          householdId: ctx.householdId,
          folderId: b.folderId,
          name: b.name,
          sizeBytes: b.sizeBytes,
          mimeType: b.mimeType,
          storageKey: key,
          visibility: b.visibility,
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!f) throw new Error('insert failed');
      ev.audit('file.upload_started', 'file', f.id, { name: f.name, sizeBytes: f.sizeBytes });
      const expiresIn = 900;
      return {
        file: toFile(f),
        uploadUrl: await this.storage.presignPut(key, b.mimeType, b.sizeBytes, expiresIn),
        uploadHeaders: { 'content-type': b.mimeType },
        expiresAt: iso(new Date(Date.now() + expiresIn * 1000)),
      };
    });
  }

  async completeUpload(
    ctx: HouseholdContext,
    input: In<C['completeUpload']>,
  ): Promise<Out<C['completeUpload']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const f = await this.loadFile(tx, ctx, input.params.fileId);
      if (f.status !== 'pending_upload') return toFile(f);
      if (f.ownerMemberId !== ctx.member.id) throw forbidden();
      const head = await this.storage.head(f.storageKey);
      if (!head) throw conflict('The file has not been uploaded yet', 'upload_missing');
      if (head.size !== f.sizeBytes)
        throw conflict('Uploaded size does not match', 'size_mismatch');
      const [row] = await tx
        .update(files)
        .set({ status: 'scanning' })
        .where(eq(files.id, f.id))
        .returning();
      if (!row) throw notFound('File');
      ev.emit('storage.file_uploaded', { fileId: f.id });
      ev.changed('file', f.id, 'created', f.folderId);
      return toFile(row);
    });
  }

  async getFile(ctx: HouseholdContext, input: In<C['getFile']>): Promise<Out<C['getFile']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      toFile(await this.loadFile(tx, ctx, input.params.fileId)),
    );
  }

  async updateFile(
    ctx: HouseholdContext,
    input: In<C['updateFile']>,
  ): Promise<Out<C['updateFile']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const f = await this.loadFile(tx, ctx, input.params.fileId);
      this.assertOwnerOrAdmin(ctx, f.ownerMemberId);
      if (input.body.folderId) await this.loadFolder(tx, ctx, input.body.folderId);
      const [row] = await tx.update(files).set(input.body).where(eq(files.id, f.id)).returning();
      if (!row) throw notFound('File');
      ev.changed('file', row.id, 'updated', row.folderId);
      return toFile(row);
    });
  }

  async deleteFile(
    ctx: HouseholdContext,
    input: In<C['deleteFile']>,
  ): Promise<Out<C['deleteFile']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const f = await this.loadFile(tx, ctx, input.params.fileId);
      this.assertOwnerOrAdmin(ctx, f.ownerMemberId);
      await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, f.id));
      this.scheduleObjectDeletion(ev, [{ key: f.storageKey, thumb: f.thumbnailKey }]);
      ev.changed('file', f.id, 'deleted', f.folderId);
      ev.audit('file.deleted', 'file', f.id, { name: f.name });
    });
    return OK;
  }

  async download(ctx: HouseholdContext, input: In<C['download']>): Promise<Out<C['download']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const f = await this.loadFile(tx, ctx, input.params.fileId);
      if (f.status !== 'ready') throw conflict('File is not available', `file_${f.status}`);
      const key = input.query.thumbnail ? f.thumbnailKey : f.storageKey;
      if (!key) throw notFound('Thumbnail');
      const expiresIn = 300;
      const name = input.query.thumbnail ? `${f.name}.webp` : f.name;
      return {
        url: await this.storage.presignGet(key, name, expiresIn),
        expiresAt: iso(new Date(Date.now() + expiresIn * 1000)),
      };
    });
  }

  /** Worker: virus scan (if clamd is configured) and thumbnail generation. */
  async process({ fileId }: { fileId: string }): Promise<void> {
    const [f] = await this.db.system.select().from(files).where(eq(files.id, fileId));
    if (!f || f.deletedAt || f.status !== 'scanning') return;
    let status: FileRow['status'] = 'ready';
    let thumbnailKey: string | null = null;
    const events = new UnitEvents();
    try {
      const needsBytes =
        f.sizeBytes <= MAX_PROCESS_BYTES && (this.env.CLAMAV_HOST || THUMB_TYPES.has(f.mimeType));
      const data = needsBytes ? await this.storage.getBuffer(f.storageKey) : null;
      if (data && this.env.CLAMAV_HOST) {
        const result = await scanWithClamd(this.env.CLAMAV_HOST, this.env.CLAMAV_PORT, data);
        if (!result.clean) {
          status = 'infected';
          await this.storage.deleteMany([f.storageKey]);
          events.emit('storage.file_infected', {
            fileId: f.id,
            name: f.name,
            ownerMemberId: f.ownerMemberId,
            signature: result.signature,
          });
        }
      }
      if (status === 'ready' && data && THUMB_TYPES.has(f.mimeType)) {
        try {
          const thumb = await sharp(data, { failOn: 'none' })
            .rotate()
            .resize(480, 480, { fit: 'inside' })
            .webp({ quality: 75 })
            .toBuffer();
          thumbnailKey = `${f.storageKey}.thumb.webp`;
          await this.storage.put(thumbnailKey, thumb, 'image/webp');
        } catch (e) {
          this.logger.warn(`Thumbnail failed for ${f.id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.error(`Processing ${f.id} failed: ${(e as Error).message}`);
      throw e; // BullMQ retries; after the last attempt the file stays in "scanning"
    }
    await this.db.system.transaction(async (tx) => {
      await tx.update(files).set({ status, thumbnailKey }).where(eq(files.id, f.id));
      events.changed('file', f.id, 'updated', f.folderId);
      await flushEvents(tx, { householdId: f.householdId, memberId: null, userId: null }, events);
    });
  }
}
