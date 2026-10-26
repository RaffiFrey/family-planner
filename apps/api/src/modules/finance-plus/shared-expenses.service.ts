import { Injectable } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import {
  finAccounts,
  finExpenseParties,
  finExpenseShares,
  finSettlements,
  finSharedExpenses,
  finTransactions,
  householdMembers,
  type Transaction,
} from '@fp/db';
import {
  computeShares,
  expenseBalances,
  type SettleUpTransfer,
  settleUp,
  SharedExpenseError,
  type ShareInput,
} from '@fp/domain/finance';
import { type CurrencyCode, formatMoney, money, MoneyError } from '@fp/domain/money';
import { and, desc, eq, exists, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../common/contract.js';
import { badRequest, notFound } from '../../common/errors.js';
import { decodeCursor, toPage } from '../../common/pagination.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { Db } from '../../infra/database.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { asCurrency, householdCurrency, todayIn, visibleAccounts } from './finance-plus.common.js';

type C = typeof apiContract.financePlus;
type PartyRow = typeof finExpenseParties.$inferSelect;
type ExpenseRow = typeof finSharedExpenses.$inferSelect;
type ShareRow = typeof finExpenseShares.$inferSelect;

@Injectable()
export class SharedExpensesService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------ parties

  /** Household members are implicit parties: one row per member, created on demand. */
  private async ensureMemberParties(tx: Transaction, ctx: HouseholdContext): Promise<void> {
    const members = await tx
      .select({ id: householdMembers.id, name: householdMembers.displayName })
      .from(householdMembers)
      .where(isNull(householdMembers.removedAt));
    if (members.length === 0) return;
    await tx
      .insert(finExpenseParties)
      .values(members.map((m) => ({ householdId: ctx.householdId, name: m.name, memberId: m.id })))
      .onConflictDoUpdate({
        target: [finExpenseParties.householdId, finExpenseParties.memberId],
        set: { name: sql`excluded.name` },
      });
  }

  private toParty(p: PartyRow) {
    return { id: p.id, name: p.name, memberId: p.memberId, archived: p.archived };
  }

  private async loadParty(tx: Transaction, id: string): Promise<PartyRow> {
    const [p] = await tx.select().from(finExpenseParties).where(eq(finExpenseParties.id, id));
    if (!p) throw notFound('Party');
    return p;
  }

  async listParties(ctx: HouseholdContext): Promise<Out<C['listParties']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      await this.ensureMemberParties(tx, ctx);
      const rows = await tx
        .select()
        .from(finExpenseParties)
        .orderBy(sql`${finExpenseParties.memberId} is null`, finExpenseParties.name);
      return rows.map((p) => this.toParty(p));
    });
  }

  async createParty(
    ctx: HouseholdContext,
    input: In<C['createParty']>,
  ): Promise<Out<C['createParty']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [p] = await tx
        .insert(finExpenseParties)
        .values({ householdId: ctx.householdId, name: input.body.name })
        .returning();
      if (!p) throw new Error('insert failed');
      ev.changed('shared_expense', null, 'updated');
      return this.toParty(p);
    });
  }

  async updateParty(
    ctx: HouseholdContext,
    input: In<C['updateParty']>,
  ): Promise<Out<C['updateParty']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const p = await this.loadParty(tx, input.params.partyId);
      if (p.memberId && input.body.name !== undefined)
        throw badRequest('Members are named after their profile', 'member_party');
      const [row] = await tx
        .update(finExpenseParties)
        .set(input.body)
        .where(eq(finExpenseParties.id, p.id))
        .returning();
      if (!row) throw notFound('Party');
      ev.changed('shared_expense', null, 'updated');
      return this.toParty(row);
    });
  }

  async deleteParty(
    ctx: HouseholdContext,
    input: In<C['deleteParty']>,
  ): Promise<Out<C['deleteParty']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const p = await this.loadParty(tx, input.params.partyId);
      if (p.memberId) throw badRequest('Household members cannot be removed', 'member_party');
      const [used] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(finExpenseShares)
        .where(eq(finExpenseShares.partyId, p.id));
      const [paid] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(finSharedExpenses)
        .where(eq(finSharedExpenses.paidByPartyId, p.id));
      const [settled] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(finSettlements)
        .where(or(eq(finSettlements.fromPartyId, p.id), eq(finSettlements.toPartyId, p.id)));
      if ((used?.n ?? 0) + (paid?.n ?? 0) + (settled?.n ?? 0) > 0) {
        // Still part of the history: keep for the balances, hide from pickers.
        await tx
          .update(finExpenseParties)
          .set({ archived: true })
          .where(eq(finExpenseParties.id, p.id));
      } else {
        await tx.delete(finExpenseParties).where(eq(finExpenseParties.id, p.id));
      }
      ev.changed('shared_expense', null, 'updated');
    });
    return OK;
  }

  // ------------------------------------------------------------ expenses

  private toExpense(e: ExpenseRow, shares: ShareRow[]) {
    return {
      id: e.id,
      title: e.title,
      amountMinor: e.amountMinor,
      currency: asCurrency(e.currency),
      date: e.date,
      paidByPartyId: e.paidByPartyId,
      splitMethod: e.splitMethod,
      shares: shares.map((s) => ({
        partyId: s.partyId,
        value: s.value,
        amountMinor: s.amountMinor,
      })),
      transactionId: e.transactionId,
      notes: e.notes,
      createdByMemberId: e.createdByMemberId,
      createdAt: iso(e.createdAt),
    };
  }

  private async sharesFor(tx: Transaction, ids: string[]): Promise<Map<string, ShareRow[]>> {
    const map = new Map<string, ShareRow[]>();
    if (ids.length === 0) return map;
    const rows = await tx
      .select()
      .from(finExpenseShares)
      .where(inArray(finExpenseShares.expenseId, ids));
    for (const s of rows) map.set(s.expenseId, [...(map.get(s.expenseId) ?? []), s]);
    return map;
  }

  /** Validates parties and the linked transaction, then computes the split. */
  private async prepare(
    tx: Transaction,
    ctx: HouseholdContext,
    e: {
      amountMinor: number;
      currency: CurrencyCode;
      paidByPartyId: string;
      splitMethod: 'equal' | 'exact' | 'percent' | 'shares';
      shares: ShareInput[];
      transactionId: string | null;
    },
    allowArchived: Set<string> = new Set(),
  ) {
    const ids = [...new Set([e.paidByPartyId, ...e.shares.map((s) => s.partyId)])];
    const parties = await tx
      .select()
      .from(finExpenseParties)
      .where(inArray(finExpenseParties.id, ids));
    for (const id of ids) {
      const p = parties.find((x) => x.id === id);
      if (!p || (p.archived && !allowArchived.has(id)))
        throw badRequest('Unknown participant', 'invalid_party');
    }
    if (e.transactionId) {
      const [t] = await tx
        .select({ id: finTransactions.id })
        .from(finTransactions)
        .innerJoin(finAccounts, eq(finAccounts.id, finTransactions.accountId))
        .where(and(eq(finTransactions.id, e.transactionId), visibleAccounts(ctx)));
      if (!t) throw badRequest('Unknown transaction', 'invalid_transaction');
    }
    try {
      const shares = computeShares(e.amountMinor, e.currency, e.splitMethod, e.shares);
      return {
        parties,
        shares: shares.map((s, i) => ({
          ...s,
          value: e.splitMethod === 'equal' ? null : (e.shares[i]?.value ?? null),
        })),
      };
    } catch (err) {
      if (err instanceof SharedExpenseError || err instanceof MoneyError)
        throw badRequest(err.message, 'invalid_split');
      throw err;
    }
  }

  /** Tells participating members (except the actor) about a new expense. */
  private async notifyAdded(
    ctx: HouseholdContext,
    e: ExpenseRow,
    parties: PartyRow[],
  ): Promise<void> {
    const memberIds = parties
      .map((p) => p.memberId)
      .filter((m): m is string => !!m && m !== ctx.member.id);
    if (memberIds.length === 0) return;
    await this.notifications.notify({
      householdId: ctx.householdId,
      memberIds,
      type: 'finance.expense_added',
      message: 'notifications.expenseAdded',
      vars: {
        actor: ctx.member.displayName,
        title: e.title,
        amount: formatMoney(
          money(e.amountMinor, asCurrency(e.currency)),
          ctx.locale === 'en' ? 'en-GB' : 'de-DE',
        ),
      },
      link: `/finance/shared?expense=${e.id}`,
      exceptMemberId: ctx.member.id,
    });
  }

  async listExpenses(
    ctx: HouseholdContext,
    input: In<C['listSharedExpenses']>,
  ): Promise<Out<C['listSharedExpenses']>> {
    const q = input.query;
    const cursor = decodeCursor(q.cursor);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finSharedExpenses)
        .where(
          and(
            q.partyId
              ? or(
                  eq(finSharedExpenses.paidByPartyId, q.partyId),
                  exists(
                    tx
                      .select({ one: sql`1` })
                      .from(finExpenseShares)
                      .where(
                        and(
                          eq(finExpenseShares.expenseId, finSharedExpenses.id),
                          eq(finExpenseShares.partyId, q.partyId),
                        ),
                      ),
                  ),
                )
              : undefined,
            cursor
              ? or(
                  lt(finSharedExpenses.date, cursor.v),
                  and(eq(finSharedExpenses.date, cursor.v), lt(finSharedExpenses.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(finSharedExpenses.date), desc(finSharedExpenses.id))
        .limit(q.limit + 1);
      const shares = await this.sharesFor(
        tx,
        rows.map((r) => r.id),
      );
      return toPage(
        rows,
        q.limit,
        (r) => ({ v: r.date, id: r.id }),
        (r) => this.toExpense(r, shares.get(r.id) ?? []),
      );
    });
  }

  async createExpense(
    ctx: HouseholdContext,
    input: In<C['createSharedExpense']>,
  ): Promise<Out<C['createSharedExpense']>> {
    const b = input.body;
    const currency = b.currency ?? householdCurrency(ctx);
    const { dto, row, parties } = await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.ensureMemberParties(tx, ctx);
      const prepared = await this.prepare(tx, ctx, {
        amountMinor: b.amountMinor,
        currency,
        paidByPartyId: b.paidByPartyId,
        splitMethod: b.splitMethod,
        shares: b.shares,
        transactionId: b.transactionId ?? null,
      });
      const [e] = await tx
        .insert(finSharedExpenses)
        .values({
          householdId: ctx.householdId,
          title: b.title,
          amountMinor: b.amountMinor,
          currency,
          date: b.date,
          paidByPartyId: b.paidByPartyId,
          splitMethod: b.splitMethod,
          transactionId: b.transactionId ?? null,
          notes: b.notes ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!e) throw new Error('insert failed');
      const shares = await tx
        .insert(finExpenseShares)
        .values(
          prepared.shares.map((s) => ({ householdId: ctx.householdId, expenseId: e.id, ...s })),
        )
        .returning();
      ev.changed('shared_expense', e.id, 'created');
      ev.audit('shared_expense.created', 'shared_expense', e.id, { amountMinor: e.amountMinor });
      return { dto: this.toExpense(e, shares), row: e, parties: prepared.parties };
    });
    await this.notifyAdded(ctx, row, parties);
    return dto;
  }

  private async loadExpense(tx: Transaction, id: string): Promise<ExpenseRow> {
    const [e] = await tx.select().from(finSharedExpenses).where(eq(finSharedExpenses.id, id));
    if (!e) throw notFound('Expense');
    return e;
  }

  async updateExpense(
    ctx: HouseholdContext,
    input: In<C['updateSharedExpense']>,
  ): Promise<Out<C['updateSharedExpense']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const e = await this.loadExpense(tx, input.params.expenseId);
      const current = (await this.sharesFor(tx, [e.id])).get(e.id) ?? [];
      const splitMethod = b.splitMethod ?? e.splitMethod;
      const shareInputs: ShareInput[] =
        b.shares ?? current.map((s) => ({ partyId: s.partyId, value: s.value }));
      // Parties archived after the expense was recorded may stay on it.
      const keep = new Set([e.paidByPartyId, ...current.map((s) => s.partyId)]);
      const prepared = await this.prepare(
        tx,
        ctx,
        {
          amountMinor: b.amountMinor ?? e.amountMinor,
          currency: asCurrency(e.currency),
          paidByPartyId: b.paidByPartyId ?? e.paidByPartyId,
          splitMethod,
          shares: shareInputs,
          transactionId: b.transactionId === undefined ? null : b.transactionId,
        },
        keep,
      );
      const { shares: _shares, ...fields } = b;
      const [row] = await tx
        .update(finSharedExpenses)
        .set(fields)
        .where(eq(finSharedExpenses.id, e.id))
        .returning();
      if (!row) throw notFound('Expense');
      await tx.delete(finExpenseShares).where(eq(finExpenseShares.expenseId, e.id));
      const shares = await tx
        .insert(finExpenseShares)
        .values(
          prepared.shares.map((s) => ({ householdId: ctx.householdId, expenseId: e.id, ...s })),
        )
        .returning();
      ev.changed('shared_expense', e.id, 'updated');
      return this.toExpense(row, shares);
    });
  }

  async deleteExpense(
    ctx: HouseholdContext,
    input: In<C['deleteSharedExpense']>,
  ): Promise<Out<C['deleteSharedExpense']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const e = await this.loadExpense(tx, input.params.expenseId);
      await tx.delete(finSharedExpenses).where(eq(finSharedExpenses.id, e.id));
      ev.changed('shared_expense', e.id, 'deleted');
      ev.audit('shared_expense.deleted', 'shared_expense', e.id, { amountMinor: e.amountMinor });
    });
    return OK;
  }

  // ------------------------------------------------------------ balances & settlements

  private async balancesByCurrency(tx: Transaction) {
    const expenses = await tx.select().from(finSharedExpenses);
    const shares = await this.sharesFor(
      tx,
      expenses.map((e) => e.id),
    );
    const settlements = await tx.select().from(finSettlements);
    const currencies = [
      ...new Set([...expenses.map((e) => e.currency), ...settlements.map((s) => s.currency)]),
    ].sort();
    return currencies.map((currency) => ({
      currency: asCurrency(currency),
      balances: expenseBalances(
        expenses
          .filter((e) => e.currency === currency)
          .map((e) => ({
            paidByPartyId: e.paidByPartyId,
            amountMinor: e.amountMinor,
            shares: shares.get(e.id) ?? [],
          })),
        settlements.filter((s) => s.currency === currency),
      ),
    }));
  }

  async balances(ctx: HouseholdContext): Promise<Out<C['sharedBalances']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const groups = await this.balancesByCurrency(tx);
      const parties = await tx.select().from(finExpenseParties);
      const name = (id: string) => parties.find((p) => p.id === id)?.name ?? '?';
      return groups.map((g) => ({
        currency: g.currency,
        balances: g.balances.map((b) => ({ ...b, name: name(b.partyId) })),
      }));
    });
  }

  async settleUp(ctx: HouseholdContext): Promise<Out<C['settleUpSuggestions']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      (await this.balancesByCurrency(tx)).flatMap((g) =>
        settleUp(g.balances).map((t: SettleUpTransfer) => ({ currency: g.currency, ...t })),
      ),
    );
  }

  private toSettlement(s: typeof finSettlements.$inferSelect) {
    return {
      id: s.id,
      fromPartyId: s.fromPartyId,
      toPartyId: s.toPartyId,
      amountMinor: s.amountMinor,
      currency: asCurrency(s.currency),
      date: s.date,
      note: s.note,
      createdAt: iso(s.createdAt),
    };
  }

  async listSettlements(ctx: HouseholdContext): Promise<Out<C['listSettlements']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finSettlements)
        .orderBy(desc(finSettlements.date), desc(finSettlements.createdAt));
      return rows.map((s) => this.toSettlement(s));
    });
  }

  async createSettlement(
    ctx: HouseholdContext,
    input: In<C['createSettlement']>,
  ): Promise<Out<C['createSettlement']>> {
    const b = input.body;
    if (b.fromPartyId === b.toPartyId)
      throw badRequest('A party cannot pay itself', 'invalid_settlement');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.loadParty(tx, b.fromPartyId);
      await this.loadParty(tx, b.toPartyId);
      const [s] = await tx
        .insert(finSettlements)
        .values({
          householdId: ctx.householdId,
          fromPartyId: b.fromPartyId,
          toPartyId: b.toPartyId,
          amountMinor: b.amountMinor,
          currency: b.currency ?? householdCurrency(ctx),
          date: b.date ?? todayIn(ctx),
          note: b.note ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!s) throw new Error('insert failed');
      ev.changed('shared_expense', null, 'updated');
      ev.audit('settlement.created', 'settlement', s.id, { amountMinor: s.amountMinor });
      return this.toSettlement(s);
    });
  }

  async deleteSettlement(
    ctx: HouseholdContext,
    input: In<C['deleteSettlement']>,
  ): Promise<Out<C['deleteSettlement']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [s] = await tx
        .delete(finSettlements)
        .where(eq(finSettlements.id, input.params.settlementId))
        .returning({ id: finSettlements.id });
      if (!s) throw notFound('Settlement');
      ev.changed('shared_expense', null, 'updated');
    });
    return OK;
  }
}
