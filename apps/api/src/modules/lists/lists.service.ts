import { Injectable } from '@nestjs/common';
import type {
  apiContract,
  ITEM_CATEGORIES,
  List as ListDto,
  ListItem as ListItemDto,
} from '@fp/contracts';
import { itemHistory, listItems, lists, type Transaction } from '@fp/db';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import { forbidden, notFound } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { Db } from '../../infra/database.js';
import { guessCategory, normalizeItem } from './categorize-item.js';

type C = typeof apiContract.lists;
type ListRow = typeof lists.$inferSelect;
type ItemRow = typeof listItems.$inferSelect;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];

function toItem(i: ItemRow): ListItemDto {
  return {
    id: i.id,
    listId: i.listId,
    text: i.text,
    quantity: i.quantity,
    category: i.category as ItemCategory,
    checked: i.checked,
    checkedByMemberId: i.checkedByMemberId,
    checkedAt: isoOrNull(i.checkedAt),
    position: i.position,
  };
}

function toList(l: ListRow, openCount: number): ListDto {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    icon: l.icon,
    visibility: l.visibility,
    ownerMemberId: l.ownerMemberId,
    openCount,
    updatedAt: iso(l.updatedAt),
  };
}

@Injectable()
export class ListsService {
  constructor(private readonly db: Db) {}

  private visible(ctx: HouseholdContext) {
    return visibleTo(ctx.member.id, { visibility: lists.visibility, owner: lists.ownerMemberId });
  }

  private async load(tx: Transaction, ctx: HouseholdContext, id: string): Promise<ListRow> {
    const [l] = await tx
      .select()
      .from(lists)
      .where(and(eq(lists.id, id), this.visible(ctx)));
    if (!l) throw notFound('List');
    return l;
  }

  private async openCount(tx: Transaction, listId: string): Promise<number> {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.checked, false)));
    return r?.n ?? 0;
  }

  /** Bumps `updated_at` so list overviews sort by activity. */
  private async touch(tx: Transaction, listId: string): Promise<void> {
    await tx.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId));
  }

  async list(ctx: HouseholdContext): Promise<Out<C['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select({
          list: lists,
          open: sql<number>`(select count(*)::int from list_items li where li.list_id = "lists"."id" and not li.checked)`,
        })
        .from(lists)
        .where(this.visible(ctx))
        .orderBy(desc(lists.updatedAt));
      return rows.map((r) => toList(r.list, r.open));
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const l = await this.load(tx, ctx, input.params.listId);
      const items = await tx
        .select()
        .from(listItems)
        .where(eq(listItems.listId, l.id))
        .orderBy(asc(listItems.checked), asc(listItems.position));
      return { ...toList(l, items.filter((i) => !i.checked).length), items: items.map(toItem) };
    });
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [l] = await tx
        .insert(lists)
        .values({
          householdId: ctx.householdId,
          ...input.body,
          icon: input.body.icon ?? null,
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!l) throw new Error('insert failed');
      ev.changed('list', l.id, 'created');
      ev.audit('list.created', 'list', l.id, { name: l.name });
      return toList(l, 0);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      if (input.body.visibility && l.ownerMemberId !== ctx.member.id)
        throw forbidden('Only the owner can change visibility');
      const [row] = await tx
        .update(lists)
        .set({ ...input.body, updatedAt: new Date() })
        .where(eq(lists.id, l.id))
        .returning();
      if (!row) throw notFound('List');
      ev.changed('list', row.id, 'updated');
      return toList(row, await this.openCount(tx, row.id));
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      if (l.ownerMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
        throw forbidden();
      await tx.delete(lists).where(eq(lists.id, l.id));
      ev.changed('list', l.id, 'deleted');
      ev.audit('list.deleted', 'list', l.id, { name: l.name });
    });
    return OK;
  }

  async addItem(ctx: HouseholdContext, input: In<C['addItem']>): Promise<Out<C['addItem']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      const normalized = normalizeItem(b.text);
      const [known] = await tx
        .select()
        .from(itemHistory)
        .where(eq(itemHistory.normalized, normalized));
      const category =
        b.category ?? (known?.category as ItemCategory | undefined) ?? guessCategory(b.text);
      const [max] = await tx
        .select({ p: sql<number>`coalesce(max(${listItems.position}), 0)` })
        .from(listItems)
        .where(eq(listItems.listId, l.id));
      const [item] = await tx
        .insert(listItems)
        .values({
          householdId: ctx.householdId,
          listId: l.id,
          text: b.text,
          quantity: b.quantity ?? null,
          category,
          position: (max?.p ?? 0) + 1,
        })
        .returning();
      if (!item) throw new Error('insert failed');
      await tx
        .insert(itemHistory)
        .values({ householdId: ctx.householdId, normalized, text: b.text, category })
        .onConflictDoUpdate({
          target: [itemHistory.householdId, itemHistory.normalized],
          set: { uses: sql`${itemHistory.uses} + 1`, lastUsedAt: new Date(), category },
        });
      await this.touch(tx, l.id);
      ev.changed('list_item', item.id, 'created', l.id);
      if (l.kind === 'shopping')
        ev.emit('list.item_added', { listId: l.id, listName: l.name, text: b.text });
      return toItem(item);
    });
  }

  async updateItem(
    ctx: HouseholdContext,
    input: In<C['updateItem']>,
  ): Promise<Out<C['updateItem']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      const [item] = await tx
        .update(listItems)
        .set({
          ...(b.text !== undefined ? { text: b.text } : {}),
          ...(b.quantity !== undefined ? { quantity: b.quantity } : {}),
          ...(b.category !== undefined ? { category: b.category } : {}),
          ...(b.position !== undefined ? { position: b.position } : {}),
          ...(b.checked !== undefined
            ? {
                checked: b.checked,
                checkedByMemberId: b.checked ? ctx.member.id : null,
                checkedAt: b.checked ? new Date() : null,
              }
            : {}),
        })
        .where(and(eq(listItems.id, input.params.itemId), eq(listItems.listId, l.id)))
        .returning();
      if (!item) throw notFound('Item');
      if (b.category !== undefined) {
        // Remember corrections so the next "Milch" lands in the right aisle.
        await tx
          .update(itemHistory)
          .set({ category: b.category })
          .where(eq(itemHistory.normalized, normalizeItem(item.text)));
      }
      await this.touch(tx, l.id);
      ev.changed('list_item', item.id, 'updated', l.id);
      return toItem(item);
    });
  }

  async removeItem(
    ctx: HouseholdContext,
    input: In<C['removeItem']>,
  ): Promise<Out<C['removeItem']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      const [item] = await tx
        .delete(listItems)
        .where(and(eq(listItems.id, input.params.itemId), eq(listItems.listId, l.id)))
        .returning({ id: listItems.id });
      if (!item) throw notFound('Item');
      await this.touch(tx, l.id);
      ev.changed('list_item', item.id, 'deleted', l.id);
    });
    return OK;
  }

  async clearChecked(
    ctx: HouseholdContext,
    input: In<C['clearChecked']>,
  ): Promise<Out<C['clearChecked']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const l = await this.load(tx, ctx, input.params.listId);
      const removed = await tx
        .delete(listItems)
        .where(and(eq(listItems.listId, l.id), eq(listItems.checked, true)))
        .returning({ id: listItems.id });
      await this.touch(tx, l.id);
      ev.changed('list', l.id, 'updated');
      return { removed: removed.length };
    });
  }

  async suggestions(
    ctx: HouseholdContext,
    input: In<C['suggestions']>,
  ): Promise<Out<C['suggestions']>> {
    const q = normalizeItem(input.query.q);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(itemHistory)
        .where(
          q
            ? ilike(itemHistory.normalized, `${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
            : undefined,
        )
        .orderBy(desc(itemHistory.uses), desc(itemHistory.lastUsedAt))
        .limit(10);
      return rows.map((r) => ({
        text: r.text,
        category: r.category as ItemCategory,
        uses: r.uses,
      }));
    });
  }
}
