import { Inject, Injectable } from '@nestjs/common';
import type { apiContract, Transaction as TxDto } from '@fp/contracts';
import {
  finAccounts,
  finBudgets,
  finCategories,
  finCategoryPrefs,
  finImports,
  finRules,
  finSplits,
  finTransactions,
  type Transaction,
} from '@fp/db';
import {
  budgetPeriodRange,
  budgetStatus,
  type CategorizationRule,
  categorize,
  CSV_PRESETS,
  hashBatch,
  ImportError,
  importStatement,
  isValidRegex,
  monthlyCashflow,
  type ParsedTransaction,
  totalsByCategory,
} from '@fp/domain/finance';
import { type CurrencyCode, isCurrencyCode, MoneyError } from '@fp/domain/money';
import { addInZone, monthRangeInZone, toLocalDate, toWallTime } from '@fp/domain/time';
import { and, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../common/contract.js';
import { badRequest, forbidden, notFound, planLimit } from '../../common/errors.js';
import { decodeCursor, toPage } from '../../common/pagination.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db, type UnitEvents } from '../../infra/database.js';
import { entitlementsFor } from '../billing/entitlements.js';

type C = typeof apiContract.finance;
type AccountRow = typeof finAccounts.$inferSelect;
type TxRow = typeof finTransactions.$inferSelect;
type CategoryRow = typeof finCategories.$inferSelect;
type RuleRow = typeof finRules.$inferSelect;

function toRule(r: RuleRow): CategorizationRule {
  return {
    id: r.id,
    categoryId: r.categoryId,
    scope: r.householdId ? 'household' : 'global',
    priority: r.priority,
    conditions: r.conditions,
    direction: r.direction ?? undefined,
    amountMinMinor: r.amountMinMinor ?? undefined,
    amountMaxMinor: r.amountMaxMinor ?? undefined,
  };
}

/** Category id plus all descendants (budgets on "Wohnen" include "Miete"). */
export function subtree(
  categories: Pick<CategoryRow, 'id' | 'parentId'>[],
  rootId: string,
): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const c of categories) if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly db: Db,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  // ------------------------------------------------------------ helpers

  private visibleAccounts(ctx: HouseholdContext) {
    return visibleTo(ctx.member.id, {
      visibility: finAccounts.visibility,
      owner: finAccounts.ownerMemberId,
    });
  }

  private async accountIds(tx: Transaction, ctx: HouseholdContext): Promise<string[]> {
    const rows = await tx
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(this.visibleAccounts(ctx));
    return rows.map((r) => r.id);
  }

  private async loadAccount(
    tx: Transaction,
    ctx: HouseholdContext,
    id: string,
  ): Promise<AccountRow> {
    const [a] = await tx
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, id), this.visibleAccounts(ctx)));
    if (!a) throw notFound('Account');
    return a;
  }

  private async balances(tx: Transaction, ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select({
        accountId: finTransactions.accountId,
        sum: sql<number>`coalesce(sum(${finTransactions.amountMinor}), 0)::bigint`,
      })
      .from(finTransactions)
      .where(inArray(finTransactions.accountId, ids))
      .groupBy(finTransactions.accountId);
    return new Map(rows.map((r) => [r.accountId, r.sum]));
  }

  private toAccount(a: AccountRow, txSum: number) {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency as CurrencyCode,
      institution: a.institution,
      ibanLast4: a.ibanLast4,
      openingBalanceMinor: a.openingBalanceMinor,
      balanceMinor: a.openingBalanceMinor + txSum,
      color: a.color,
      visibility: a.visibility,
      ownerMemberId: a.ownerMemberId,
      source: a.source,
      archived: a.archived,
      createdAt: iso(a.createdAt),
    };
  }

  private async categories(tx: Transaction): Promise<CategoryRow[]> {
    return tx.select().from(finCategories);
  }

  private async assertCategory(tx: Transaction, id: string | null | undefined): Promise<void> {
    if (!id) return;
    const [c] = await tx
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(eq(finCategories.id, id));
    if (!c) throw badRequest('Unknown category', 'invalid_category');
  }

  private async rules(tx: Transaction): Promise<CategorizationRule[]> {
    return (await tx.select().from(finRules)).map(toRule);
  }

  private async splitsFor(tx: Transaction, ids: string[]) {
    if (ids.length === 0) return new Map<string, (typeof finSplits.$inferSelect)[]>();
    const rows = await tx.select().from(finSplits).where(inArray(finSplits.transactionId, ids));
    const map = new Map<string, (typeof finSplits.$inferSelect)[]>();
    for (const s of rows) map.set(s.transactionId, [...(map.get(s.transactionId) ?? []), s]);
    return map;
  }

  private toTx(t: TxRow, splits: (typeof finSplits.$inferSelect)[] = []): TxDto {
    return {
      id: t.id,
      accountId: t.accountId,
      bookingDate: t.bookingDate,
      valueDate: t.valueDate,
      amountMinor: t.amountMinor,
      currency: t.currency as CurrencyCode,
      counterpartyName: t.counterpartyName,
      counterpartyIban: t.counterpartyIban,
      purpose: t.purpose,
      categoryId: t.categoryId,
      ruleId: t.ruleId,
      tags: t.tags,
      notes: t.notes,
      status: t.status,
      source: t.source,
      transferAccountId: t.transferAccountId,
      splits: splits.map((s) => ({
        categoryId: s.categoryId,
        amountMinor: s.amountMinor,
        memberId: s.memberId,
        note: s.note,
      })),
      createdAt: iso(t.createdAt),
    };
  }

  /** Earliest visible booking date for the plan (free: last 12 months). */
  private historyStart(ctx: HouseholdContext): string | null {
    const months = entitlementsFor(ctx.household.plan).historyMonths;
    if (months === null) return null;
    return toLocalDate(
      addInZone(new Date(), -months, 'month', ctx.household.timezone),
      ctx.household.timezone,
    );
  }

  private budgetCheck(ev: UnitEvents, categoryIds: (string | null)[]): void {
    const ids = [...new Set(categoryIds.filter((c): c is string => !!c))];
    if (ids.length > 0) ev.emit('finance.budget_check', { categoryIds: ids });
  }

  // ------------------------------------------------------------ accounts

  async listAccounts(
    ctx: HouseholdContext,
    input: In<C['listAccounts']>,
  ): Promise<Out<C['listAccounts']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finAccounts)
        .where(
          and(
            this.visibleAccounts(ctx),
            input.query.includeArchived ? undefined : eq(finAccounts.archived, false),
          ),
        )
        .orderBy(finAccounts.createdAt);
      const sums = await this.balances(
        tx,
        rows.map((r) => r.id),
      );
      return rows.map((a) => this.toAccount(a, sums.get(a.id) ?? 0));
    });
  }

  async createAccount(
    ctx: HouseholdContext,
    input: In<C['createAccount']>,
  ): Promise<Out<C['createAccount']>> {
    const b = input.body;
    const iban = b.iban?.replace(/\s/g, '').toUpperCase() || null;
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban))
      throw badRequest('Invalid IBAN', 'invalid_iban');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const max = entitlementsFor(ctx.household.plan).maxAccounts;
      if (max !== null) {
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(finAccounts)
          .where(eq(finAccounts.archived, false));
        if ((count?.n ?? 0) >= max) throw planLimit(`Your plan allows ${max} accounts`);
      }
      const [a] = await tx
        .insert(finAccounts)
        .values({
          householdId: ctx.householdId,
          name: b.name,
          type: b.type,
          currency: b.currency,
          institution: b.institution ?? null,
          ibanEncrypted: iban ? this.crypto.encrypt(iban) : null,
          ibanLast4: iban ? iban.slice(-4) : null,
          openingBalanceMinor: b.openingBalanceMinor,
          color: b.color ?? null,
          visibility: b.visibility,
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!a) throw new Error('insert failed');
      ev.changed('account', a.id, 'created');
      ev.audit('account.created', 'account', a.id, { name: a.name });
      return this.toAccount(a, 0);
    });
  }

  async updateAccount(
    ctx: HouseholdContext,
    input: In<C['updateAccount']>,
  ): Promise<Out<C['updateAccount']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.loadAccount(tx, ctx, input.params.accountId);
      if (input.body.visibility && a.ownerMemberId !== ctx.member.id)
        throw forbidden('Only the owner can change visibility');
      const [row] = await tx
        .update(finAccounts)
        .set(input.body)
        .where(eq(finAccounts.id, a.id))
        .returning();
      if (!row) throw notFound('Account');
      ev.changed('account', row.id, 'updated');
      ev.audit('account.updated', 'account', row.id, input.body);
      return this.toAccount(row, (await this.balances(tx, [row.id])).get(row.id) ?? 0);
    });
  }

  async deleteAccount(
    ctx: HouseholdContext,
    input: In<C['deleteAccount']>,
  ): Promise<Out<C['deleteAccount']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.loadAccount(tx, ctx, input.params.accountId);
      if (a.ownerMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
        throw forbidden();
      // Unlink transfer peers on other accounts before the cascade removes this side.
      await tx
        .update(finTransactions)
        .set({ transferAccountId: null, transferPeerId: null })
        .where(eq(finTransactions.transferAccountId, a.id));
      await tx.delete(finAccounts).where(eq(finAccounts.id, a.id));
      ev.changed('account', a.id, 'deleted');
      ev.changed('transaction', null, 'deleted');
      ev.audit('account.deleted', 'account', a.id, { name: a.name });
    });
    return OK;
  }

  // ------------------------------------------------------------ categories

  async listCategories(ctx: HouseholdContext): Promise<Out<C['listCategories']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await this.categories(tx);
      const prefs = await tx.select().from(finCategoryPrefs);
      const hidden = new Set(prefs.filter((p) => p.hidden).map((p) => p.categoryId));
      return rows.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        color: c.color,
        key: c.key,
        isSystem: c.householdId === null,
        hidden: hidden.has(c.id),
      }));
    });
  }

  async createCategory(
    ctx: HouseholdContext,
    input: In<C['createCategory']>,
  ): Promise<Out<C['createCategory']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertCategory(tx, input.body.parentId);
      const [c] = await tx
        .insert(finCategories)
        .values({
          householdId: ctx.householdId,
          parentId: input.body.parentId ?? null,
          name: input.body.name,
          kind: input.body.kind,
          icon: input.body.icon ?? null,
          color: input.body.color ?? null,
        })
        .returning();
      if (!c) throw new Error('insert failed');
      ev.changed('category', c.id, 'created');
      return {
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        color: c.color,
        key: null,
        isSystem: false,
        hidden: false,
      };
    });
  }

  async updateCategory(
    ctx: HouseholdContext,
    input: In<C['updateCategory']>,
  ): Promise<Out<C['updateCategory']>> {
    const { hidden, ...fields } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [c] = await tx
        .select()
        .from(finCategories)
        .where(eq(finCategories.id, input.params.categoryId));
      if (!c) throw notFound('Category');
      if (c.householdId === null && Object.keys(fields).length > 0)
        throw forbidden('System categories can only be hidden');
      if (fields.parentId) {
        await this.assertCategory(tx, fields.parentId);
        if (subtree(await this.categories(tx), c.id).includes(fields.parentId))
          throw badRequest('Category cycle');
      }
      let row = c;
      if (c.householdId !== null && Object.keys(fields).length > 0) {
        [row = c] = await tx
          .update(finCategories)
          .set(fields)
          .where(eq(finCategories.id, c.id))
          .returning();
      }
      if (hidden !== undefined) {
        await tx
          .insert(finCategoryPrefs)
          .values({ householdId: ctx.householdId, categoryId: c.id, hidden })
          .onConflictDoUpdate({
            target: [finCategoryPrefs.householdId, finCategoryPrefs.categoryId],
            set: { hidden },
          });
      }
      const [pref] = await tx
        .select()
        .from(finCategoryPrefs)
        .where(eq(finCategoryPrefs.categoryId, c.id));
      ev.changed('category', c.id, 'updated');
      return {
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        kind: row.kind,
        icon: row.icon,
        color: row.color,
        key: row.key,
        isSystem: row.householdId === null,
        hidden: pref?.hidden ?? false,
      };
    });
  }

  // ------------------------------------------------------------ transactions

  async listTransactions(
    ctx: HouseholdContext,
    input: In<C['listTransactions']>,
  ): Promise<Out<C['listTransactions']>> {
    const q = input.query;
    const cursor = decodeCursor(q.cursor);
    const historyStart = this.historyStart(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const ids = await this.accountIds(tx, ctx);
      if (ids.length === 0 || (q.accountId && !ids.includes(q.accountId)))
        return { items: [], nextCursor: null };
      const categoryIds = q.categoryId ? subtree(await this.categories(tx), q.categoryId) : null;
      const search = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
      const rows = await tx
        .select()
        .from(finTransactions)
        .where(
          and(
            inArray(finTransactions.accountId, q.accountId ? [q.accountId] : ids),
            categoryIds ? inArray(finTransactions.categoryId, categoryIds) : undefined,
            q.uncategorized
              ? and(isNull(finTransactions.categoryId), isNull(finTransactions.transferAccountId))
              : undefined,
            q.from ? gte(finTransactions.bookingDate, q.from) : undefined,
            q.to ? lte(finTransactions.bookingDate, q.to) : undefined,
            historyStart ? gte(finTransactions.bookingDate, historyStart) : undefined,
            search
              ? or(
                  ilike(finTransactions.counterpartyName, search),
                  ilike(finTransactions.purpose, search),
                  ilike(finTransactions.notes, search),
                )
              : undefined,
            cursor
              ? or(
                  lt(finTransactions.bookingDate, cursor.v),
                  and(eq(finTransactions.bookingDate, cursor.v), lt(finTransactions.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(finTransactions.bookingDate), desc(finTransactions.id))
        .limit(q.limit + 1);
      const splits = await this.splitsFor(
        tx,
        rows.map((r) => r.id),
      );
      return toPage(
        rows,
        q.limit,
        (r) => ({ v: r.bookingDate, id: r.id }),
        (r) => this.toTx(r, splits.get(r.id)),
      );
    });
  }

  private validateSplits(amountMinor: number, splits: { amountMinor: number }[]): void {
    if (splits.length === 0) return;
    const sum = splits.reduce((s, x) => s + x.amountMinor, 0);
    if (sum !== amountMinor)
      throw badRequest('Split amounts must add up to the transaction amount', 'split_mismatch');
  }

  async createTransaction(
    ctx: HouseholdContext,
    input: In<C['createTransaction']>,
  ): Promise<Out<C['createTransaction']>> {
    const b = input.body;
    this.validateSplits(b.amountMinor, b.splits);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const account = await this.loadAccount(tx, ctx, b.accountId);
      await this.assertCategory(tx, b.categoryId);
      for (const s of b.splits) await this.assertCategory(tx, s.categoryId);
      let categoryId = b.categoryId ?? null;
      let ruleId: string | null = null;
      if (b.categoryId === undefined && !b.transferAccountId) {
        const match = categorize(
          {
            amountMinor: b.amountMinor,
            counterpartyName: b.counterpartyName ?? null,
            counterpartyIban: null,
            purpose: b.purpose,
            bookingText: null,
          },
          await this.rules(tx),
        );
        categoryId = match?.categoryId ?? null;
        ruleId = match?.id ?? null;
      }
      const target = b.transferAccountId
        ? await this.loadAccount(tx, ctx, b.transferAccountId)
        : null;
      if (target && target.id === account.id)
        throw badRequest('Cannot transfer to the same account');
      if (target && target.currency !== account.currency)
        throw badRequest('Transfers between currencies are not supported yet');
      const [row] = await tx
        .insert(finTransactions)
        .values({
          householdId: ctx.householdId,
          accountId: account.id,
          bookingDate: b.bookingDate,
          amountMinor: b.amountMinor,
          currency: account.currency,
          counterpartyName: b.counterpartyName ?? target?.name ?? null,
          purpose: b.purpose,
          categoryId: target ? null : categoryId,
          ruleId,
          tags: b.tags,
          notes: b.notes ?? null,
          source: 'manual',
          transferAccountId: target?.id ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      if (target) {
        const [peer] = await tx
          .insert(finTransactions)
          .values({
            householdId: ctx.householdId,
            accountId: target.id,
            bookingDate: b.bookingDate,
            amountMinor: -b.amountMinor,
            currency: target.currency,
            counterpartyName: account.name,
            purpose: b.purpose,
            tags: b.tags,
            notes: b.notes ?? null,
            source: 'manual',
            transferAccountId: account.id,
            transferPeerId: row.id,
            createdByMemberId: ctx.member.id,
          })
          .returning();
        if (peer)
          await tx
            .update(finTransactions)
            .set({ transferPeerId: peer.id })
            .where(eq(finTransactions.id, row.id));
      }
      if (b.splits.length > 0) {
        await tx
          .insert(finSplits)
          .values(
            b.splits.map((s) => ({ householdId: ctx.householdId, transactionId: row.id, ...s })),
          );
      }
      ev.changed('transaction', row.id, 'created', account.id);
      ev.changed('account', account.id, 'updated');
      if (target) ev.changed('account', target.id, 'updated');
      ev.audit('transaction.created', 'transaction', row.id, { amountMinor: row.amountMinor });
      this.budgetCheck(ev, [row.categoryId, ...b.splits.map((s) => s.categoryId)]);
      const splits = await this.splitsFor(tx, [row.id]);
      return this.toTx({ ...row, transferAccountId: target?.id ?? null }, splits.get(row.id));
    });
  }

  private async loadTx(tx: Transaction, ctx: HouseholdContext, id: string): Promise<TxRow> {
    const ids = await this.accountIds(tx, ctx);
    const [t] = await tx.select().from(finTransactions).where(eq(finTransactions.id, id));
    if (!t || !ids.includes(t.accountId)) throw notFound('Transaction');
    return t;
  }

  async updateTransaction(
    ctx: HouseholdContext,
    input: In<C['updateTransaction']>,
  ): Promise<Out<C['updateTransaction']>> {
    const { createRule, splits, ...b } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.loadTx(tx, ctx, input.params.transactionId);
      if (t.source !== 'manual' && (b.amountMinor !== undefined || b.bookingDate !== undefined)) {
        throw badRequest(
          'Amount and date of imported transactions cannot be changed',
          'imported_readonly',
        );
      }
      await this.assertCategory(tx, b.categoryId);
      const amount = b.amountMinor ?? t.amountMinor;
      if (splits) {
        this.validateSplits(amount, splits);
        for (const s of splits) await this.assertCategory(tx, s.categoryId);
      }
      const [row] = await tx
        .update(finTransactions)
        .set({ ...b, ...(b.categoryId !== undefined ? { ruleId: null } : {}) })
        .where(eq(finTransactions.id, t.id))
        .returning();
      if (!row) throw notFound('Transaction');
      if (t.transferPeerId && (b.amountMinor !== undefined || b.bookingDate !== undefined)) {
        await tx
          .update(finTransactions)
          .set({ amountMinor: -row.amountMinor, bookingDate: row.bookingDate })
          .where(eq(finTransactions.id, t.transferPeerId));
      }
      if (splits) {
        await tx.delete(finSplits).where(eq(finSplits.transactionId, t.id));
        if (splits.length > 0)
          await tx
            .insert(finSplits)
            .values(
              splits.map((s) => ({ householdId: ctx.householdId, transactionId: t.id, ...s })),
            );
      }
      if (createRule && b.categoryId && (row.counterpartyName || row.counterpartyIban)) {
        const conditions = row.counterpartyIban
          ? [{ field: 'iban' as const, op: 'equals' as const, value: row.counterpartyIban }]
          : [
              {
                field: 'counterparty' as const,
                op: 'equals' as const,
                value: row.counterpartyName as string,
              },
            ];
        const [rule] = await tx
          .insert(finRules)
          .values({
            householdId: ctx.householdId,
            categoryId: b.categoryId,
            priority: 50,
            conditions,
            direction: row.amountMinor < 0 ? 'out' : 'in',
          })
          .returning();
        if (rule) {
          await this.applyRuleToUncategorized(tx, toRule(rule));
          ev.changed('rule', rule.id, 'created');
        }
      }
      ev.changed('transaction', row.id, 'updated', row.accountId);
      ev.changed('account', row.accountId, 'updated');
      this.budgetCheck(ev, [row.categoryId, t.categoryId]);
      const sp = await this.splitsFor(tx, [row.id]);
      return this.toTx(row, sp.get(row.id));
    });
  }

  async deleteTransaction(
    ctx: HouseholdContext,
    input: In<C['deleteTransaction']>,
  ): Promise<Out<C['deleteTransaction']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const t = await this.loadTx(tx, ctx, input.params.transactionId);
      const ids = [t.id, ...(t.transferPeerId ? [t.transferPeerId] : [])];
      await tx.delete(finTransactions).where(inArray(finTransactions.id, ids));
      ev.changed('transaction', t.id, 'deleted', t.accountId);
      ev.changed('account', t.accountId, 'updated');
      if (t.transferAccountId) ev.changed('account', t.transferAccountId, 'updated');
      ev.audit('transaction.deleted', 'transaction', t.id, { amountMinor: t.amountMinor });
    });
    return OK;
  }

  // ------------------------------------------------------------ rules

  private async applyRuleToUncategorized(
    tx: Transaction,
    rule: CategorizationRule,
  ): Promise<number> {
    const candidates = await tx
      .select()
      .from(finTransactions)
      .where(and(isNull(finTransactions.categoryId), isNull(finTransactions.transferAccountId)))
      .limit(5000);
    const matched = candidates.filter((t) => categorize(t, [rule]) !== null).map((t) => t.id);
    if (matched.length > 0) {
      await tx
        .update(finTransactions)
        .set({ categoryId: rule.categoryId, ruleId: rule.id })
        .where(inArray(finTransactions.id, matched));
    }
    return matched.length;
  }

  async listRules(ctx: HouseholdContext): Promise<Out<C['listRules']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finRules)
        .where(eq(finRules.householdId, ctx.householdId))
        .orderBy(finRules.priority);
      return rows.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        priority: r.priority,
        conditions: r.conditions,
        direction: r.direction,
        amountMinMinor: r.amountMinMinor,
        amountMaxMinor: r.amountMaxMinor,
      }));
    });
  }

  async createRule(
    ctx: HouseholdContext,
    input: In<C['createRule']>,
  ): Promise<Out<C['createRule']>> {
    const { applyToExisting, ...b } = input.body;
    for (const c of b.conditions) {
      if (c.op === 'regex' && !isValidRegex(c.value))
        throw badRequest(`Invalid regular expression "${c.value}"`, 'invalid_regex');
    }
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertCategory(tx, b.categoryId);
      const [r] = await tx
        .insert(finRules)
        .values({ householdId: ctx.householdId, ...b })
        .returning();
      if (!r) throw new Error('insert failed');
      if (applyToExisting) {
        const n = await this.applyRuleToUncategorized(tx, toRule(r));
        if (n > 0) ev.changed('transaction', null, 'updated');
      }
      ev.changed('rule', r.id, 'created');
      return {
        id: r.id,
        categoryId: r.categoryId,
        priority: r.priority,
        conditions: r.conditions,
        direction: r.direction,
        amountMinMinor: r.amountMinMinor,
        amountMaxMinor: r.amountMaxMinor,
      };
    });
  }

  async deleteRule(
    ctx: HouseholdContext,
    input: In<C['deleteRule']>,
  ): Promise<Out<C['deleteRule']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [r] = await tx
        .delete(finRules)
        .where(and(eq(finRules.id, input.params.ruleId), eq(finRules.householdId, ctx.householdId)))
        .returning({ id: finRules.id });
      if (!r) throw notFound('Rule');
      ev.changed('rule', r.id, 'deleted');
    });
    return OK;
  }

  // ------------------------------------------------------------ budgets

  /** Positive amount spent in [start, end) on the category subtree (refunds reduce it). */
  async spent(
    tx: Transaction,
    accountIds: string[],
    categoryIds: string[],
    start: string,
    end: string,
  ): Promise<number> {
    if (accountIds.length === 0) return 0;
    const [direct] = await tx
      .select({ s: sql<number>`coalesce(sum(${finTransactions.amountMinor}), 0)::bigint` })
      .from(finTransactions)
      .where(
        and(
          inArray(finTransactions.accountId, accountIds),
          inArray(finTransactions.categoryId, categoryIds),
          isNull(finTransactions.transferAccountId),
          gte(finTransactions.bookingDate, start),
          lt(finTransactions.bookingDate, end),
          sql`not exists (select 1 from fin_splits s where s.transaction_id = ${finTransactions.id})`,
        ),
      );
    const [split] = await tx
      .select({ s: sql<number>`coalesce(sum(${finSplits.amountMinor}), 0)::bigint` })
      .from(finSplits)
      .innerJoin(finTransactions, eq(finTransactions.id, finSplits.transactionId))
      .where(
        and(
          inArray(finTransactions.accountId, accountIds),
          inArray(finSplits.categoryId, categoryIds),
          gte(finTransactions.bookingDate, start),
          lt(finTransactions.bookingDate, end),
        ),
      );
    return -((direct?.s ?? 0) + (split?.s ?? 0));
  }

  async budgetStatuses(tx: Transaction, ctx: HouseholdContext, at: Date, budgetIds?: string[]) {
    const tz = ctx.household.timezone;
    const budgets = await tx
      .select()
      .from(finBudgets)
      .where(budgetIds ? inArray(finBudgets.id, budgetIds) : undefined)
      .orderBy(finBudgets.createdAt);
    if (budgets.length === 0) return [];
    // Budgets cover all household accounts that aren't private to someone else.
    const accountIds = await this.accountIds(tx, ctx);
    const cats = await this.categories(tx);
    const out = [];
    for (const b of budgets) {
      const range = budgetPeriodRange(b.period, at, tz);
      const start = toLocalDate(range.start, tz);
      const end = toLocalDate(range.end, tz);
      const ids = subtree(cats, b.categoryId);
      const spent = await this.spent(tx, accountIds, ids, start, end);
      let rollover = 0;
      if (b.rollover) {
        const prevAt = new Date(range.start.getTime() - 1000);
        const prev = budgetPeriodRange(b.period, prevAt, tz);
        const prevSpent = await this.spent(tx, accountIds, ids, toLocalDate(prev.start, tz), start);
        rollover = Math.max(0, b.limitMinor - prevSpent);
      }
      const s = budgetStatus(b.limitMinor, spent, rollover);
      out.push({
        budget: {
          id: b.id,
          categoryId: b.categoryId,
          period: b.period,
          limitMinor: b.limitMinor,
          rollover: b.rollover,
        },
        periodStart: iso(range.start),
        periodEnd: iso(range.end),
        spentMinor: s.spentMinor,
        rolloverMinor: s.rolloverMinor,
        availableMinor: s.availableMinor,
        remainingMinor: s.remainingMinor,
        ratio: Number.isFinite(s.ratio) ? s.ratio : 999,
        level: s.level,
      });
    }
    return out;
  }

  async listBudgets(
    ctx: HouseholdContext,
    input: In<C['listBudgets']>,
  ): Promise<Out<C['listBudgets']>> {
    const at = input.query.at ? new Date(input.query.at) : new Date();
    return this.db.tenant(actorOf(ctx), (tx) => this.budgetStatuses(tx, ctx, at));
  }

  async createBudget(
    ctx: HouseholdContext,
    input: In<C['createBudget']>,
  ): Promise<Out<C['createBudget']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertCategory(tx, input.body.categoryId);
      const [b] = await tx
        .insert(finBudgets)
        .values({ householdId: ctx.householdId, ...input.body })
        .onConflictDoNothing()
        .returning();
      if (!b)
        throw badRequest('A budget for this category and period already exists', 'budget_exists');
      ev.changed('budget', b.id, 'created');
      return {
        id: b.id,
        categoryId: b.categoryId,
        period: b.period,
        limitMinor: b.limitMinor,
        rollover: b.rollover,
      };
    });
  }

  async updateBudget(
    ctx: HouseholdContext,
    input: In<C['updateBudget']>,
  ): Promise<Out<C['updateBudget']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [b] = await tx
        .update(finBudgets)
        .set(input.body)
        .where(eq(finBudgets.id, input.params.budgetId))
        .returning();
      if (!b) throw notFound('Budget');
      ev.changed('budget', b.id, 'updated');
      return {
        id: b.id,
        categoryId: b.categoryId,
        period: b.period,
        limitMinor: b.limitMinor,
        rollover: b.rollover,
      };
    });
  }

  async deleteBudget(
    ctx: HouseholdContext,
    input: In<C['deleteBudget']>,
  ): Promise<Out<C['deleteBudget']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [b] = await tx
        .delete(finBudgets)
        .where(eq(finBudgets.id, input.params.budgetId))
        .returning({ id: finBudgets.id });
      if (!b) throw notFound('Budget');
      ev.changed('budget', b.id, 'deleted');
    });
    return OK;
  }

  // ------------------------------------------------------------ import

  csvPresets(): Out<C['csvPresets']> {
    return CSV_PRESETS.map((p) => ({ id: p.id, name: p.name }));
  }

  private parse(
    input: { body: { content: string; presetId?: string | undefined } },
    currency: CurrencyCode,
  ) {
    try {
      return importStatement(input.body.content, {
        ...(input.body.presetId ? { presetId: input.body.presetId } : {}),
        defaultCurrency: currency,
      });
    } catch (e) {
      if (e instanceof ImportError || e instanceof MoneyError)
        throw badRequest(e.message, 'import_failed');
      throw e;
    }
  }

  private async classify(tx: Transaction, account: AccountRow, txs: ParsedTransaction[]) {
    const hashed = hashBatch(account.id, txs);
    const existing = hashed.length
      ? await tx
          .select({ hash: finTransactions.importHash })
          .from(finTransactions)
          .where(
            and(
              eq(finTransactions.accountId, account.id),
              inArray(
                finTransactions.importHash,
                hashed.map((h) => h.hash),
              ),
            ),
          )
      : [];
    const seen = new Set(existing.map((e) => e.hash));
    const rules = await this.rules(tx);
    return hashed.map((h) => ({
      ...h,
      duplicate: seen.has(h.hash),
      rule: categorize(h.tx, rules),
    }));
  }

  async previewImport(
    ctx: HouseholdContext,
    input: In<C['previewImport']>,
  ): Promise<Out<C['previewImport']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const account = await this.loadAccount(tx, ctx, input.params.accountId);
      const parsed = this.parse(input, isCurrencyCode(account.currency) ? account.currency : 'EUR');
      const rows = await this.classify(tx, account, parsed.transactions);
      return {
        format: parsed.format,
        issues: parsed.issues,
        rows: rows.map((r) => ({
          bookingDate: r.tx.bookingDate,
          amountMinor: r.tx.amountMinor,
          counterpartyName: r.tx.counterpartyName,
          purpose: r.tx.purpose,
          status: r.tx.status,
          duplicate: r.duplicate,
          suggestedCategoryId: r.rule?.categoryId ?? null,
        })),
      };
    });
  }

  async importStatement(
    ctx: HouseholdContext,
    input: In<C['importStatement']>,
  ): Promise<Out<C['importStatement']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const account = await this.loadAccount(tx, ctx, input.params.accountId);
      const parsed = this.parse(input, isCurrencyCode(account.currency) ? account.currency : 'EUR');
      const mismatched = parsed.transactions.filter((t) => t.currency !== account.currency);
      if (mismatched.length > 0)
        throw badRequest(
          `Statement currency does not match account currency ${account.currency}`,
          'currency_mismatch',
        );
      const rows = (await this.classify(tx, account, parsed.transactions)).filter(
        (r) => !r.duplicate,
      );
      const source: 'csv' | 'camt' | 'mt940' =
        parsed.format === 'camt' ? 'camt' : parsed.format === 'mt940' ? 'mt940' : 'csv';
      const [imp] = await tx
        .insert(finImports)
        .values({
          householdId: ctx.householdId,
          accountId: account.id,
          format: parsed.format,
          fileName: input.body.fileName ?? null,
          imported: rows.length,
          duplicates: parsed.transactions.length - rows.length,
          issues: parsed.issues,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!imp) throw new Error('insert failed');
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await tx
          .insert(finTransactions)
          .values(
            chunk.map((r) => ({
              householdId: ctx.householdId,
              accountId: account.id,
              bookingDate: r.tx.bookingDate,
              valueDate: r.tx.valueDate,
              amountMinor: r.tx.amountMinor,
              currency: r.tx.currency,
              counterpartyName: r.tx.counterpartyName,
              counterpartyIban: r.tx.counterpartyIban,
              purpose: r.tx.purpose,
              bookingText: r.tx.bookingText,
              categoryId: r.rule?.categoryId ?? null,
              ruleId: r.rule?.id ?? null,
              status: r.tx.status,
              source: source,
              importId: imp.id,
              importHash: r.hash,
              bankReference: r.tx.bankReference,
            })),
          )
          .onConflictDoNothing();
      }
      ev.changed('transaction', null, 'created', account.id);
      ev.changed('account', account.id, 'updated');
      ev.audit('finance.imported', 'account', account.id, {
        format: parsed.format,
        imported: rows.length,
      });
      this.budgetCheck(
        ev,
        rows.map((r) => r.rule?.categoryId ?? null),
      );
      return {
        importId: imp.id,
        format: parsed.format,
        imported: rows.length,
        duplicates: parsed.transactions.length - rows.length,
        issues: parsed.issues,
      };
    });
  }

  // ------------------------------------------------------------ reports

  private async reportRows(tx: Transaction, ctx: HouseholdContext, from: string, to: string) {
    const ids = await this.accountIds(tx, ctx);
    if (ids.length === 0) return [];
    const rows = await tx
      .select({
        bookingDate: finTransactions.bookingDate,
        amountMinor: finTransactions.amountMinor,
        categoryId: finTransactions.categoryId,
        transfer: finTransactions.transferAccountId,
      })
      .from(finTransactions)
      .where(
        and(
          inArray(finTransactions.accountId, ids),
          gte(finTransactions.bookingDate, from),
          lte(finTransactions.bookingDate, to),
        ),
      );
    return rows.map((r) => ({
      bookingDate: r.bookingDate,
      amountMinor: r.amountMinor,
      categoryId: r.categoryId,
      isTransfer: r.transfer !== null,
    }));
  }

  async cashflow(ctx: HouseholdContext, input: In<C['cashflow']>): Promise<Out<C['cashflow']>> {
    const { from, to } = input.query;
    if (from > to) throw badRequest('from must not be after to');
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [y, m] = to.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const rows = await this.reportRows(tx, ctx, `${from}-01`, last);
      return monthlyCashflow(rows, from, to);
    });
  }

  async byCategory(
    ctx: HouseholdContext,
    input: In<C['byCategory']>,
  ): Promise<Out<C['byCategory']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      totalsByCategory(await this.reportRows(tx, ctx, input.query.from, input.query.to)),
    );
  }

  async overview(ctx: HouseholdContext): Promise<Out<C['overview']>> {
    const tz = ctx.household.timezone;
    const now = new Date();
    const w = toWallTime(now, tz);
    const range = monthRangeInZone(w.year, w.month, tz);
    const month = `${w.year}-${String(w.month).padStart(2, '0')}`;
    const currency = isCurrencyCode(ctx.household.currency) ? ctx.household.currency : 'EUR';
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const accounts = await tx
        .select()
        .from(finAccounts)
        .where(and(this.visibleAccounts(ctx), eq(finAccounts.archived, false)));
      const sums = await this.balances(
        tx,
        accounts.map((a) => a.id),
      );
      const netWorth = accounts
        .filter((a) => a.currency === currency)
        .reduce((s, a) => s + a.openingBalanceMinor + (sums.get(a.id) ?? 0), 0);
      const rows = await this.reportRows(
        tx,
        ctx,
        toLocalDate(range.start, tz),
        toLocalDate(new Date(range.end.getTime() - 1), tz),
      );
      const [flow] = monthlyCashflow(rows, month, month);
      const ids = accounts.map((a) => a.id);
      const [uncat] = ids.length
        ? await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(finTransactions)
            .where(
              and(
                inArray(finTransactions.accountId, ids),
                isNull(finTransactions.categoryId),
                isNull(finTransactions.transferAccountId),
              ),
            )
        : [{ n: 0 }];
      return {
        currency,
        netWorthMinor: netWorth,
        month,
        incomeMinor: flow?.incomeMinor ?? 0,
        expenseMinor: flow?.expenseMinor ?? 0,
        budgets: await this.budgetStatuses(tx, ctx, now),
        uncategorizedCount: uncat?.n ?? 0,
      };
    });
  }
}
