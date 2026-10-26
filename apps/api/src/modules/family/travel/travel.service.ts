import { Injectable } from '@nestjs/common';
import type {
  apiContract,
  List as ListDto,
  Trip as TripDto,
  TripItem as TripItemDto,
} from '@fp/contracts';
import {
  finAccounts,
  finCategories,
  finTransactions,
  householdMembers,
  households,
  listItems,
  lists,
  sentReminders,
  tripItems,
  trips,
  type Transaction,
} from '@fp/db';
import { ageOn, buildPackingList, packingTemplates, tripNights } from '@fp/domain/family';
import { can } from '@fp/domain/permissions';
import {
  addFloating,
  floatingToLocalDate,
  localDateToFloating,
  toLocalDate,
} from '@fp/domain/time';
import { formatDate } from '@fp/i18n';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext, memberCtx } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { Db } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { assertMembers, householdLocale } from '../common.js';

type C = typeof apiContract.travel;
type TripRow = typeof trips.$inferSelect;
type ItemRow = typeof tripItems.$inferSelect;

/**
 * Finance tag linking transactions to a trip. Transaction tags are limited to 30 characters, so the
 * advertised tag uses the random tail of the UUIDv7; the full `trip:<id>` form is accepted as well.
 */
export const tripTag = (id: string) => `trip:${id.replace(/-/g, '').slice(-12)}`;
const UPCOMING_DAYS = 3;

function toTrip(t: TripRow): TripDto {
  return {
    id: t.id,
    name: t.name,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    budgetMinor: t.budgetMinor,
    currency: t.currency,
    financeCategoryId: t.financeCategoryId,
    financeAccountId: t.financeAccountId,
    memberIds: t.memberIds,
    packingListId: t.packingListId,
    notes: t.notes,
    financeTag: tripTag(t.id),
    createdByMemberId: t.createdByMemberId,
    createdAt: iso(t.createdAt),
  };
}

@Injectable()
export class TravelService {
  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  private toItem(i: ItemRow): TripItemDto {
    return {
      id: i.id,
      tripId: i.tripId,
      kind: i.kind,
      title: i.title,
      startAt: isoOrNull(i.startAt),
      endAt: isoOrNull(i.endAt),
      location: i.location,
      confirmationCode: i.confirmationCodeEncrypted
        ? this.crypto.decrypt(i.confirmationCodeEncrypted)
        : null,
      notes: i.notes,
      attachmentFileIds: i.attachmentFileIds,
      createdAt: iso(i.createdAt),
    };
  }

  private async load(tx: Transaction, id: string): Promise<TripRow> {
    const [t] = await tx.select().from(trips).where(eq(trips.id, id));
    if (!t) throw notFound('Trip');
    return t;
  }

  private async assertFinanceLinks(
    tx: Transaction,
    categoryId: string | null | undefined,
    accountId: string | null | undefined,
  ): Promise<void> {
    if (categoryId) {
      const [c] = await tx
        .select({ id: finCategories.id })
        .from(finCategories)
        .where(eq(finCategories.id, categoryId));
      if (!c) throw badRequest('Unknown category', 'invalid_category');
    }
    if (accountId) {
      const [a] = await tx
        .select({ id: finAccounts.id })
        .from(finAccounts)
        .where(eq(finAccounts.id, accountId));
      if (!a) throw badRequest('Unknown account', 'invalid_account');
    }
  }

  private async budgetOf(tx: Transaction, t: TripRow) {
    const linked = t.financeCategoryId
      ? and(
          eq(finTransactions.categoryId, t.financeCategoryId),
          gte(finTransactions.bookingDate, t.startDate),
          lte(finTransactions.bookingDate, t.endDate),
          t.financeAccountId ? eq(finTransactions.accountId, t.financeAccountId) : undefined,
        )
      : undefined;
    const [r] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${finTransactions.amountMinor}), 0)`,
        n: sql<number>`count(*)::int`,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.currency, t.currency),
          or(
            sql`${tripTag(t.id)} = any(${finTransactions.tags})`,
            sql`${`trip:${t.id}`} = any(${finTransactions.tags})`,
            linked,
          ),
        ),
      );
    // Expenses are negative amounts; refunds reduce the spending.
    const spentMinor = -Number(r?.sum ?? 0);
    return {
      budgetMinor: t.budgetMinor,
      spentMinor,
      remainingMinor: t.budgetMinor === null ? null : t.budgetMinor - spentMinor,
      currency: t.currency,
      transactionCount: r?.n ?? 0,
    };
  }

  private canSeeFinance(ctx: HouseholdContext): boolean {
    return can(memberCtx(ctx), 'finance.read');
  }

  async list(ctx: HouseholdContext, input: In<C['list']>): Promise<Out<C['list']>> {
    const today = toLocalDate(new Date(), ctx.household.timezone);
    const when = input.query.when;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(trips)
        .where(
          when === 'upcoming'
            ? gte(trips.endDate, today)
            : when === 'past'
              ? lt(trips.endDate, today)
              : undefined,
        )
        .orderBy(when === 'past' ? desc(trips.startDate) : asc(trips.startDate))
        .limit(500);
      return rows.map(toTrip);
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const t = await this.load(tx, input.params.tripId);
      const items = await tx
        .select()
        .from(tripItems)
        .where(eq(tripItems.tripId, t.id))
        .orderBy(sql`${tripItems.startAt} asc nulls last`, asc(tripItems.createdAt));
      return {
        ...toTrip(t),
        items: items.map((i) => this.toItem(i)),
        budget: this.canSeeFinance(ctx) ? await this.budgetOf(tx, t) : null,
      };
    });
  }

  async budget(ctx: HouseholdContext, input: In<C['budget']>): Promise<Out<C['budget']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      this.budgetOf(tx, await this.load(tx, input.params.tripId)),
    );
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, b.memberIds);
      await this.assertFinanceLinks(tx, b.financeCategoryId, b.financeAccountId);
      const [row] = await tx
        .insert(trips)
        .values({
          householdId: ctx.householdId,
          ...b,
          currency: b.currency ?? ctx.household.currency,
          memberIds: [...new Set(b.memberIds)],
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('trip', row.id, 'created');
      ev.audit('trip.created', 'trip', row.id, { name: row.name });
      return toTrip(row);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, input.params.tripId);
      if ((b.startDate ?? current.startDate) > (b.endDate ?? current.endDate))
        throw badRequest('The trip must end after it starts', 'invalid_range');
      await assertMembers(tx, b.memberIds ?? []);
      await this.assertFinanceLinks(tx, b.financeCategoryId, b.financeAccountId);
      const [row] = await tx
        .update(trips)
        .set({
          ...b,
          ...(b.memberIds ? { memberIds: [...new Set(b.memberIds)] } : {}),
          updatedAt: new Date(),
        })
        .where(eq(trips.id, current.id))
        .returning();
      if (!row) throw notFound('Trip');
      ev.changed('trip', row.id, 'updated');
      return toTrip(row);
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, input.params.tripId);
      await tx.delete(trips).where(eq(trips.id, current.id));
      ev.changed('trip', current.id, 'deleted');
      ev.audit('trip.deleted', 'trip', current.id, { name: current.name });
    });
    return OK;
  }

  // ---------------------------------------------------------------- itinerary

  async addItem(ctx: HouseholdContext, input: In<C['addItem']>): Promise<Out<C['addItem']>> {
    const { confirmationCode, startAt, endAt, ...b } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.load(tx, input.params.tripId);
      const [row] = await tx
        .insert(tripItems)
        .values({
          householdId: ctx.householdId,
          tripId: t.id,
          ...b,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          confirmationCodeEncrypted: confirmationCode
            ? this.crypto.encrypt(confirmationCode)
            : null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('trip', t.id, 'updated');
      return this.toItem(row);
    });
  }

  async updateItem(
    ctx: HouseholdContext,
    input: In<C['updateItem']>,
  ): Promise<Out<C['updateItem']>> {
    const { confirmationCode, startAt, endAt, ...b } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.load(tx, input.params.tripId);
      const [row] = await tx
        .update(tripItems)
        .set({
          ...b,
          ...(startAt !== undefined ? { startAt: startAt ? new Date(startAt) : null } : {}),
          ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
          ...(confirmationCode !== undefined
            ? {
                confirmationCodeEncrypted: confirmationCode
                  ? this.crypto.encrypt(confirmationCode)
                  : null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(tripItems.id, input.params.itemId), eq(tripItems.tripId, t.id)))
        .returning();
      if (!row) throw notFound('Item');
      if (row.startAt && row.endAt && row.startAt > row.endAt)
        throw badRequest('End must be after start', 'invalid_range');
      ev.changed('trip', t.id, 'updated');
      return this.toItem(row);
    });
  }

  async removeItem(
    ctx: HouseholdContext,
    input: In<C['removeItem']>,
  ): Promise<Out<C['removeItem']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.load(tx, input.params.tripId);
      const [row] = await tx
        .delete(tripItems)
        .where(and(eq(tripItems.id, input.params.itemId), eq(tripItems.tripId, t.id)))
        .returning({ id: tripItems.id });
      if (!row) throw notFound('Item');
      ev.changed('trip', t.id, 'updated');
    });
    return OK;
  }

  // ---------------------------------------------------------------- packing

  packingTemplates(
    ctx: HouseholdContext,
    input: In<C['packingTemplates']>,
  ): Out<C['packingTemplates']> {
    return packingTemplates(input.query.locale ?? householdLocale(ctx));
  }

  async createPackingList(
    ctx: HouseholdContext,
    input: In<C['createPackingList']>,
  ): Promise<Out<C['createPackingList']>> {
    const b = input.body;
    const locale = b.locale ?? householdLocale(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.load(tx, input.params.tripId);
      const members = await tx
        .select({ id: householdMembers.id, birthday: householdMembers.birthday })
        .from(householdMembers)
        .where(
          and(
            isNull(householdMembers.removedAt),
            t.memberIds.length > 0 ? inArray(householdMembers.id, t.memberIds) : undefined,
          ),
        );
      const items = buildPackingList({
        templates: b.templates,
        nights: tripNights(t.startDate, t.endDate),
        travellers: members.map((m) => ({
          age: m.birthday ? ageOn(m.birthday, t.startDate) : null,
        })),
        locale,
      });

      let list: typeof lists.$inferSelect | undefined;
      if (t.packingListId) {
        [list] = await tx
          .select()
          .from(lists)
          .where(
            and(
              eq(lists.id, t.packingListId),
              visibleTo(ctx.member.id, {
                visibility: lists.visibility,
                owner: lists.ownerMemberId,
              }),
            ),
          );
      }
      if (!list) {
        [list] = await tx
          .insert(lists)
          .values({
            householdId: ctx.householdId,
            name: b.listName ?? `${locale === 'en' ? 'Packing list' : 'Packliste'}: ${t.name}`,
            kind: 'packing',
            icon: 'luggage',
            ownerMemberId: ctx.member.id,
          })
          .returning();
        if (!list) throw new Error('insert failed');
        await tx.update(trips).set({ packingListId: list.id }).where(eq(trips.id, t.id));
        ev.changed('list', list.id, 'created');
        ev.changed('trip', t.id, 'updated');
      }
      const existing = await tx
        .select({ text: listItems.text, position: listItems.position })
        .from(listItems)
        .where(eq(listItems.listId, list.id));
      const have = new Set(existing.map((e) => e.text.toLowerCase()));
      const fresh = items.filter((i) => !have.has(i.text.toLowerCase()));
      const start = Math.max(0, ...existing.map((e) => e.position));
      if (fresh.length > 0) {
        const inserted = await tx
          .insert(listItems)
          .values(
            fresh.map((i, n) => ({
              householdId: ctx.householdId,
              listId: list.id,
              text: i.text,
              quantity: i.quantity,
              category: i.category,
              position: start + n + 1,
            })),
          )
          .returning({ id: listItems.id });
        for (const r of inserted) ev.changed('list_item', r.id, 'created', list.id);
      }
      const [touched] = await tx
        .update(lists)
        .set({ updatedAt: new Date() })
        .where(eq(lists.id, list.id))
        .returning();
      const l = touched ?? list;
      const dto: ListDto = {
        id: l.id,
        name: l.name,
        kind: l.kind,
        icon: l.icon,
        visibility: l.visibility,
        ownerMemberId: l.ownerMemberId,
        openCount: existing.length + fresh.length,
        updatedAt: iso(l.updatedAt),
      };
      return { list: dto, added: fresh.length };
    });
  }

  // ---------------------------------------------------------------- reminders

  /** Notifies travellers once, up to three days before a trip starts. */
  async notifyUpcoming(now = new Date()): Promise<number> {
    const utcToday = now.toISOString().slice(0, 10);
    const shift = (days: number) =>
      floatingToLocalDate(addFloating(localDateToFloating(utcToday), days, 'day'));
    const rows = await this.db.system
      .select({ trip: trips, timezone: households.timezone, locale: households.locale })
      .from(trips)
      .innerJoin(households, eq(households.id, trips.householdId))
      .where(
        and(
          isNull(households.deletedAt),
          gte(trips.startDate, shift(-1)),
          lte(trips.startDate, shift(UPCOMING_DAYS + 1)),
        ),
      );
    let sent = 0;
    for (const { trip, timezone, locale } of rows) {
      const today = toLocalDate(now, timezone);
      const days = tripNights(today, trip.startDate);
      if (trip.startDate < today || days > UPCOMING_DAYS) continue;
      const inserted = await this.db.system
        .insert(sentReminders)
        .values({ householdId: trip.householdId, key: `trip:${trip.id}:upcoming` })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) continue;
      let memberIds = trip.memberIds;
      if (memberIds.length === 0) {
        const all = await this.db.system
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, trip.householdId),
              isNull(householdMembers.removedAt),
            ),
          );
        memberIds = all.map((m) => m.id);
      }
      await this.notifications.notify({
        householdId: trip.householdId,
        memberIds,
        type: 'travel.upcoming',
        message: 'notifications.tripUpcoming',
        vars: {
          name: trip.name,
          date: formatDate(
            localDateToFloating(trip.startDate),
            locale === 'en' ? 'en' : 'de',
            'UTC',
          ),
        },
        link: `/travel/${trip.id}`,
      });
      sent++;
    }
    return sent;
  }
}
