import { Injectable } from '@nestjs/common';
import type { Album as AlbumDto, AlbumItem as AlbumItemDto, apiContract } from '@fp/contracts';
import { albumItems, albums, files, type Transaction } from '@fp/db';
import { parseLocalDate, toLocalDate } from '@fp/domain/time';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, forbidden, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { Db } from '../../../infra/database.js';
import { assertMembers } from '../common.js';

type C = typeof apiContract.photos;
type AlbumRow = typeof albums.$inferSelect;
type FileRow = typeof files.$inferSelect;
type ItemRow = typeof albumItems.$inferSelect;

const MEDIA = /^(image|video)\//;

function toItem(i: ItemRow, f: Pick<FileRow, 'name' | 'mimeType'>): AlbumItemDto {
  return {
    id: i.id,
    albumId: i.albumId,
    fileId: i.fileId,
    fileName: f.name,
    mimeType: f.mimeType,
    caption: i.caption,
    takenAt: isoOrNull(i.takenAt),
    position: i.position,
    addedByMemberId: i.addedByMemberId,
    createdAt: iso(i.createdAt),
  };
}

function toAlbum(a: AlbumRow, itemCount: number): AlbumDto {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    coverFileId: a.coverFileId,
    visibility: a.visibility,
    sharedWith: a.sharedWith ?? [],
    ownerMemberId: a.ownerMemberId,
    itemCount,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  };
}

@Injectable()
export class PhotosService {
  constructor(private readonly db: Db) {}

  private visible(ctx: HouseholdContext) {
    return visibleTo(ctx.member.id, {
      visibility: albums.visibility,
      owner: albums.ownerMemberId,
      sharedWith: albums.sharedWith,
    });
  }

  private fileVisible(ctx: HouseholdContext) {
    return and(
      isNull(files.deletedAt),
      visibleTo(ctx.member.id, { visibility: files.visibility, owner: files.ownerMemberId }),
    );
  }

  private async load(tx: Transaction, ctx: HouseholdContext, id: string): Promise<AlbumRow> {
    const [a] = await tx
      .select()
      .from(albums)
      .where(and(eq(albums.id, id), this.visible(ctx)));
    if (!a) throw notFound('Album');
    return a;
  }

  private canEdit(ctx: HouseholdContext, a: AlbumRow): boolean {
    return (
      a.ownerMemberId === ctx.member.id || ['owner', 'admin', 'adult'].includes(ctx.member.role)
    );
  }

  /** Ready, visible image/video files; throws 400 for anything else. */
  private async mediaFiles(
    tx: Transaction,
    ctx: HouseholdContext,
    ids: readonly string[],
  ): Promise<Map<string, FileRow>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await tx
      .select()
      .from(files)
      .where(and(inArray(files.id, unique), this.fileVisible(ctx)));
    const ok = rows.filter((f) => f.status === 'ready' && MEDIA.test(f.mimeType));
    if (ok.length !== unique.length)
      throw badRequest('Only uploaded images and videos can be added', 'invalid_file');
    return new Map(ok.map((f) => [f.id, f]));
  }

  private async items(tx: Transaction, ctx: HouseholdContext, albumId: string) {
    const rows = await tx
      .select({ item: albumItems, file: { name: files.name, mimeType: files.mimeType } })
      .from(albumItems)
      .innerJoin(files, eq(files.id, albumItems.fileId))
      .where(and(eq(albumItems.albumId, albumId), this.fileVisible(ctx)))
      .orderBy(asc(albumItems.position), asc(albumItems.createdAt));
    return rows.map((r) => toItem(r.item, r.file));
  }

  async list(ctx: HouseholdContext): Promise<Out<C['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(albums)
        .where(this.visible(ctx))
        .orderBy(desc(albums.updatedAt));
      const counts =
        rows.length === 0
          ? []
          : await tx
              .select({ albumId: albumItems.albumId, n: sql<number>`count(*)::int` })
              .from(albumItems)
              .innerJoin(files, eq(files.id, albumItems.fileId))
              .where(
                and(
                  inArray(
                    albumItems.albumId,
                    rows.map((r) => r.id),
                  ),
                  this.fileVisible(ctx),
                ),
              )
              .groupBy(albumItems.albumId);
      const n = new Map(counts.map((c) => [c.albumId, c.n]));
      return rows.map((r) => toAlbum(r, n.get(r.id) ?? 0));
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      const items = await this.items(tx, ctx, a.id);
      return { ...toAlbum(a, items.length), items };
    });
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, b.sharedWith);
      if (b.coverFileId) await this.mediaFiles(tx, ctx, [b.coverFileId]);
      const [row] = await tx
        .insert(albums)
        .values({
          householdId: ctx.householdId,
          ...b,
          sharedWith: b.visibility === 'members' ? [...new Set(b.sharedWith)] : null,
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('album', row.id, 'created');
      return toAlbum(row, 0);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      if (!this.canEdit(ctx, a)) throw forbidden();
      if (
        (b.visibility !== undefined || b.sharedWith !== undefined) &&
        a.ownerMemberId !== ctx.member.id
      )
        throw forbidden('Only the owner can change visibility');
      await assertMembers(tx, b.sharedWith ?? []);
      if (b.coverFileId) await this.mediaFiles(tx, ctx, [b.coverFileId]);
      const [row] = await tx
        .update(albums)
        .set({
          ...b,
          ...(b.sharedWith !== undefined ? { sharedWith: [...new Set(b.sharedWith)] } : {}),
          updatedAt: new Date(),
        })
        .where(eq(albums.id, a.id))
        .returning();
      if (!row) throw notFound('Album');
      ev.changed('album', row.id, 'updated');
      return toAlbum(row, (await this.items(tx, ctx, row.id)).length);
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      if (a.ownerMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
        throw forbidden();
      await tx.delete(albums).where(eq(albums.id, a.id));
      ev.changed('album', a.id, 'deleted');
      ev.audit('album.deleted', 'album', a.id, { title: a.title });
    });
    return OK;
  }

  async addItems(ctx: HouseholdContext, input: In<C['addItems']>): Promise<Out<C['addItems']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      const media = await this.mediaFiles(
        tx,
        ctx,
        b.items.map((i) => i.fileId),
      );
      const [max] = await tx
        .select({ p: sql<number>`coalesce(max(${albumItems.position}), 0)` })
        .from(albumItems)
        .where(eq(albumItems.albumId, a.id));
      const seen = new Set<string>();
      const values = b.items
        .filter((i) => !seen.has(i.fileId) && seen.add(i.fileId))
        .map((i, n) => ({
          householdId: ctx.householdId,
          albumId: a.id,
          fileId: i.fileId,
          caption: i.caption,
          takenAt: i.takenAt ? new Date(i.takenAt) : (media.get(i.fileId)?.createdAt ?? null),
          position: (max?.p ?? 0) + n + 1,
          addedByMemberId: ctx.member.id,
        }));
      const inserted = await tx.insert(albumItems).values(values).onConflictDoNothing().returning();
      const cover =
        a.coverFileId ??
        inserted.find((i) => media.get(i.fileId)?.mimeType.startsWith('image/'))?.fileId ??
        null;
      await tx
        .update(albums)
        .set({ coverFileId: cover, updatedAt: new Date() })
        .where(eq(albums.id, a.id));
      ev.changed('album', a.id, 'updated');
      return inserted.map((i) => toItem(i, media.get(i.fileId) as FileRow));
    });
  }

  async updateItem(
    ctx: HouseholdContext,
    input: In<C['updateItem']>,
  ): Promise<Out<C['updateItem']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      const [row] = await tx
        .update(albumItems)
        .set({
          ...(b.caption !== undefined ? { caption: b.caption } : {}),
          ...(b.takenAt !== undefined ? { takenAt: b.takenAt ? new Date(b.takenAt) : null } : {}),
        })
        .where(and(eq(albumItems.id, input.params.itemId), eq(albumItems.albumId, a.id)))
        .returning();
      if (!row) throw notFound('Item');
      const [f] = await tx
        .select({ name: files.name, mimeType: files.mimeType })
        .from(files)
        .where(eq(files.id, row.fileId));
      ev.changed('album', a.id, 'updated');
      return toItem(row, f ?? { name: '', mimeType: 'application/octet-stream' });
    });
  }

  async removeItem(
    ctx: HouseholdContext,
    input: In<C['removeItem']>,
  ): Promise<Out<C['removeItem']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      const [row] = await tx
        .delete(albumItems)
        .where(and(eq(albumItems.id, input.params.itemId), eq(albumItems.albumId, a.id)))
        .returning();
      if (!row) throw notFound('Item');
      if (a.coverFileId === row.fileId)
        await tx.update(albums).set({ coverFileId: null }).where(eq(albums.id, a.id));
      ev.changed('album', a.id, 'updated');
    });
    return OK;
  }

  async reorder(ctx: HouseholdContext, input: In<C['reorder']>): Promise<Out<C['reorder']>> {
    const ids = input.body.itemIds;
    if (new Set(ids).size !== ids.length) throw badRequest('Duplicate items', 'invalid_order');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.load(tx, ctx, input.params.albumId);
      const existing = await tx
        .select({ id: albumItems.id, position: albumItems.position })
        .from(albumItems)
        .where(eq(albumItems.albumId, a.id))
        .orderBy(asc(albumItems.position));
      const known = new Set(existing.map((e) => e.id));
      if (ids.some((id) => !known.has(id))) throw badRequest('Unknown item', 'invalid_order');
      // Listed items first in the given order, the rest keep their relative order.
      const order = [...ids, ...existing.map((e) => e.id).filter((id) => !ids.includes(id))];
      for (const [i, id] of order.entries())
        await tx
          .update(albumItems)
          .set({ position: i + 1 })
          .where(eq(albumItems.id, id));
      ev.changed('album', a.id, 'updated');
      return this.items(tx, ctx, a.id);
    });
  }

  async memories(ctx: HouseholdContext, input: In<C['memories']>): Promise<Out<C['memories']>> {
    const tz = ctx.household.timezone;
    const date = input.query.date ?? toLocalDate(new Date(), tz);
    const { year, month, day } = parseLocalDate(date);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const when = sql`(coalesce(${albumItems.takenAt}, ${files.createdAt}) at time zone ${tz})`;
      const rows = await tx
        .select({
          item: albumItems,
          file: { name: files.name, mimeType: files.mimeType },
          year: sql<number>`extract(year from ${when})::int`,
        })
        .from(albumItems)
        .innerJoin(files, eq(files.id, albumItems.fileId))
        .innerJoin(albums, eq(albums.id, albumItems.albumId))
        .where(
          and(
            this.visible(ctx),
            this.fileVisible(ctx),
            sql`extract(month from ${when}) = ${month}`,
            sql`extract(day from ${when}) = ${day}`,
            sql`extract(year from ${when}) < ${year}`,
          ),
        )
        .orderBy(sql`${when} desc`)
        .limit(500);
      const byYear = new Map<number, AlbumItemDto[]>();
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.item.fileId)) continue;
        seen.add(r.item.fileId);
        byYear.set(r.year, [...(byYear.get(r.year) ?? []), toItem(r.item, r.file)]);
      }
      return [...byYear]
        .sort(([a], [b]) => b - a)
        .map(([y, items]) => ({ year: y, yearsAgo: year - y, items }));
    });
  }
}
