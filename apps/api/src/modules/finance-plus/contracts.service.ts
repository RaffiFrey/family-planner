import { Inject, Injectable } from '@nestjs/common';
import type { apiContract, FinContract } from '@fp/contracts';
import {
  finAccounts,
  finCategories,
  finContracts,
  finTransactions,
  households,
  type Transaction,
} from '@fp/db';
import {
  cancellationDeadline,
  candidateMatches,
  contractTotals,
  counterpartyKey,
  daysUntil,
  detectRecurringPayments,
  guessContractType,
  monthlyAmount,
  type RecurringCandidate,
  rollForward,
  yearlyAmount,
} from '@fp/domain/finance';
import { addInZone, localDateToFloating, toLocalDate } from '@fp/domain/time';
import { formatDate } from '@fp/i18n';
import { and, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../common/contract.js';
import { badRequest, notFound } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db } from '../../infra/database.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  adultMemberIds,
  asCurrency,
  hasFeature,
  householdCurrency,
  once,
  requireFeature,
  todayIn,
  visibleAccounts,
} from './finance-plus.common.js';

type C = typeof apiContract.financePlus;
type ContractRow = typeof finContracts.$inferSelect;

/** Notify this many days before the last day to give notice. */
export const NOTICE_LEAD_DAYS = 14;
/** How far back recurring payments are searched. */
const DETECTION_MONTHS = 15;

@Injectable()
export class ContractsService {
  constructor(
    private readonly db: Db,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  private toContract(c: ContractRow, today: string): FinContract {
    return {
      id: c.id,
      name: c.name,
      contractType: c.contractType,
      status: c.status,
      counterpartyName: c.counterpartyName,
      direction: c.direction,
      amountMinor: c.amountMinor,
      currency: asCurrency(c.currency),
      interval: c.interval,
      monthlyMinor: monthlyAmount(c.amountMinor, c.interval),
      yearlyMinor: yearlyAmount(c.amountMinor, c.interval),
      categoryId: c.categoryId,
      accountId: c.accountId,
      startDate: c.startDate,
      nextDueDate: c.nextDueDate,
      minimumTermEnd: c.minimumTermEnd,
      noticePeriodDays: c.noticePeriodDays,
      cancellationDeadline: c.status === 'active' ? cancellationDeadline(c, today) : null,
      endDate: c.endDate,
      providerName: c.providerName,
      providerContact: c.providerContact,
      contractNumber: c.contractNumberEncrypted
        ? this.crypto.decrypt(c.contractNumberEncrypted)
        : null,
      notes: c.notes,
      source: c.source,
      confidence: c.confidence,
      createdAt: iso(c.createdAt),
    };
  }

  private async assertRefs(
    tx: Transaction,
    ctx: HouseholdContext,
    refs: { categoryId?: string | null | undefined; accountId?: string | null | undefined },
  ): Promise<void> {
    if (refs.categoryId) {
      const [c] = await tx
        .select({ id: finCategories.id })
        .from(finCategories)
        .where(eq(finCategories.id, refs.categoryId));
      if (!c) throw badRequest('Unknown category', 'invalid_category');
    }
    if (refs.accountId) {
      const [a] = await tx
        .select({ id: finAccounts.id })
        .from(finAccounts)
        .where(and(eq(finAccounts.id, refs.accountId), visibleAccounts(ctx)));
      if (!a) throw badRequest('Unknown account', 'invalid_account');
    }
  }

  private async load(tx: Transaction, id: string): Promise<ContractRow> {
    const [c] = await tx
      .select()
      .from(finContracts)
      .where(and(eq(finContracts.id, id), ne(finContracts.status, 'dismissed')));
    if (!c) throw notFound('Contract');
    return c;
  }

  // ------------------------------------------------------------ detection

  /** Detected recurring payments not yet covered by a contract or a dismissal. */
  private async detect(tx: Transaction, ctx: HouseholdContext) {
    const today = todayIn(ctx);
    const since = toLocalDate(
      addInZone(new Date(), -DETECTION_MONTHS, 'month', ctx.household.timezone),
      ctx.household.timezone,
    );
    const accounts = await tx
      .select({ id: finAccounts.id, currency: finAccounts.currency })
      .from(finAccounts)
      .where(visibleAccounts(ctx));
    if (accounts.length === 0) return [];
    const rows = await tx
      .select({
        id: finTransactions.id,
        bookingDate: finTransactions.bookingDate,
        amountMinor: finTransactions.amountMinor,
        counterpartyName: finTransactions.counterpartyName,
        counterpartyIban: finTransactions.counterpartyIban,
        categoryId: finTransactions.categoryId,
        accountId: finTransactions.accountId,
      })
      .from(finTransactions)
      .where(
        and(
          inArray(
            finTransactions.accountId,
            accounts.map((a) => a.id),
          ),
          isNull(finTransactions.transferAccountId),
          gte(finTransactions.bookingDate, since),
        ),
      );
    const existing = await tx.select().from(finContracts);
    const candidates = detectRecurringPayments(rows, { today }).filter(
      (c) => !existing.some((e) => candidateMatches(c, e)),
    );
    const categoryIds = [
      ...new Set(candidates.map((c) => c.categoryId).filter((c): c is string => !!c)),
    ];
    const cats = categoryIds.length
      ? await tx
          .select({ id: finCategories.id, key: finCategories.key })
          .from(finCategories)
          .where(inArray(finCategories.id, categoryIds))
      : [];
    const currencyOf = new Map(accounts.map((a) => [a.id, asCurrency(a.currency)]));
    return candidates.map((c) => ({
      candidate: c,
      currency: (c.accountId && currencyOf.get(c.accountId)) || householdCurrency(ctx),
      suggestedType: guessContractType(
        cats.find((x) => x.id === c.categoryId)?.key,
        c.counterpartyName,
      ),
      name: suggestionName(c),
    }));
  }

  async suggestions(ctx: HouseholdContext): Promise<Out<C['contractSuggestions']>> {
    requireFeature(ctx, 'contracts');
    return this.db.tenant(actorOf(ctx), async (tx) =>
      (await this.detect(tx, ctx)).map(({ candidate: c, currency, suggestedType, name }) => ({
        key: c.key,
        name,
        counterpartyName: c.counterpartyName,
        direction: c.direction,
        interval: c.interval,
        averageAmountMinor: c.averageAmountMinor,
        lastAmountMinor: c.lastAmountMinor,
        currency,
        occurrences: c.occurrences,
        firstDate: c.firstDate,
        lastDate: c.lastDate,
        nextExpectedDate: c.nextExpectedDate,
        confidence: c.confidence,
        suggestedType,
        categoryId: c.categoryId,
        accountId: c.accountId,
        transactionIds: c.transactionIds,
      })),
    );
  }

  async confirmSuggestion(
    ctx: HouseholdContext,
    input: In<C['confirmSuggestion']>,
  ): Promise<Out<C['confirmSuggestion']>> {
    requireFeature(ctx, 'contracts');
    const b = input.body;
    const today = todayIn(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const found = (await this.detect(tx, ctx)).find((s) => s.candidate.key === b.key);
      if (!found) throw notFound('Suggestion');
      const c = found.candidate;
      const [row] = await tx
        .insert(finContracts)
        .values({
          householdId: ctx.householdId,
          name: b.name ?? found.name,
          contractType: b.contractType ?? found.suggestedType,
          counterpartyKey: c.counterpartyKey,
          counterpartyName: c.counterpartyName,
          direction: c.direction,
          amountMinor: c.lastAmountMinor,
          currency: found.currency,
          interval: c.interval,
          categoryId: c.categoryId,
          accountId: c.accountId,
          startDate: c.firstDate,
          nextDueDate: rollForward(c.nextExpectedDate, c.interval, today),
          minimumTermEnd: b.minimumTermEnd ?? null,
          noticePeriodDays: b.noticePeriodDays ?? null,
          providerName: b.providerName ?? null,
          contractNumberEncrypted: b.contractNumber ? this.crypto.encrypt(b.contractNumber) : null,
          notes: b.notes ?? null,
          source: 'detected',
          confidence: c.confidence,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('fin_contract', row.id, 'created');
      ev.audit('contract.confirmed', 'fin_contract', row.id, { name: row.name });
      return this.toContract(row, today);
    });
  }

  async dismissSuggestion(
    ctx: HouseholdContext,
    input: In<C['dismissSuggestion']>,
  ): Promise<Out<C['dismissSuggestion']>> {
    requireFeature(ctx, 'contracts');
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const found = (await this.detect(tx, ctx)).find((s) => s.candidate.key === input.body.key);
      if (!found) throw notFound('Suggestion');
      const c = found.candidate;
      const [row] = await tx
        .insert(finContracts)
        .values({
          householdId: ctx.householdId,
          name: found.name,
          contractType: found.suggestedType,
          status: 'dismissed',
          counterpartyKey: c.counterpartyKey,
          counterpartyName: c.counterpartyName,
          direction: c.direction,
          amountMinor: c.averageAmountMinor,
          currency: found.currency,
          interval: c.interval,
          source: 'detected',
          confidence: c.confidence,
          createdByMemberId: ctx.member.id,
        })
        .returning({ id: finContracts.id });
      ev.changed('fin_contract', row?.id ?? null, 'created');
    });
    return OK;
  }

  // ------------------------------------------------------------ CRUD

  async list(
    ctx: HouseholdContext,
    input: In<C['listContracts']>,
  ): Promise<Out<C['listContracts']>> {
    requireFeature(ctx, 'contracts');
    const { status, type } = input.query;
    const today = todayIn(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finContracts)
        .where(
          and(
            status === 'all'
              ? ne(finContracts.status, 'dismissed')
              : eq(finContracts.status, status),
            type ? eq(finContracts.contractType, type) : undefined,
          ),
        )
        .orderBy(finContracts.name);
      return rows.map((r) => this.toContract(r, today));
    });
  }

  async create(
    ctx: HouseholdContext,
    input: In<C['createContract']>,
  ): Promise<Out<C['createContract']>> {
    requireFeature(ctx, 'contracts');
    const b = input.body;
    const today = todayIn(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertRefs(tx, ctx, b);
      const [row] = await tx
        .insert(finContracts)
        .values({
          householdId: ctx.householdId,
          name: b.name,
          contractType: b.contractType,
          counterpartyKey: counterpartyKey({
            counterpartyName: b.counterpartyName ?? b.name,
            counterpartyIban: null,
          }),
          counterpartyName: b.counterpartyName ?? null,
          direction: b.direction,
          amountMinor: b.amountMinor,
          currency: b.currency ?? householdCurrency(ctx),
          interval: b.interval,
          categoryId: b.categoryId ?? null,
          accountId: b.accountId ?? null,
          startDate: b.startDate ?? null,
          nextDueDate: b.nextDueDate ?? null,
          minimumTermEnd: b.minimumTermEnd ?? null,
          noticePeriodDays: b.noticePeriodDays ?? null,
          endDate: b.endDate ?? null,
          providerName: b.providerName ?? null,
          providerContact: b.providerContact ?? null,
          contractNumberEncrypted: b.contractNumber ? this.crypto.encrypt(b.contractNumber) : null,
          notes: b.notes ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('fin_contract', row.id, 'created');
      ev.audit('contract.created', 'fin_contract', row.id, { name: row.name });
      return this.toContract(row, today);
    });
  }

  async update(
    ctx: HouseholdContext,
    input: In<C['updateContract']>,
  ): Promise<Out<C['updateContract']>> {
    requireFeature(ctx, 'contracts');
    const { contractNumber, counterpartyName, ...b } = input.body;
    const today = todayIn(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, input.params.contractId);
      await this.assertRefs(tx, ctx, b);
      const [row] = await tx
        .update(finContracts)
        .set({
          ...b,
          ...(contractNumber !== undefined
            ? {
                contractNumberEncrypted: contractNumber
                  ? this.crypto.encrypt(contractNumber)
                  : null,
              }
            : {}),
          ...(counterpartyName !== undefined
            ? {
                counterpartyName,
                counterpartyKey: counterpartyKey({
                  counterpartyName: counterpartyName ?? b.name ?? current.name,
                  counterpartyIban: null,
                }),
              }
            : {}),
          ...(b.status === 'cancelled' && current.status !== 'cancelled' && b.endDate === undefined
            ? { endDate: current.endDate ?? cancellationEnd(current, today) }
            : {}),
        })
        .where(eq(finContracts.id, current.id))
        .returning();
      if (!row) throw notFound('Contract');
      ev.changed('fin_contract', row.id, 'updated');
      if (b.status && b.status !== current.status)
        ev.audit(`contract.${b.status}`, 'fin_contract', row.id, { name: row.name });
      return this.toContract(row, today);
    });
  }

  async remove(
    ctx: HouseholdContext,
    input: In<C['deleteContract']>,
  ): Promise<Out<C['deleteContract']>> {
    requireFeature(ctx, 'contracts');
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.load(tx, input.params.contractId);
      await tx.delete(finContracts).where(eq(finContracts.id, c.id));
      ev.changed('fin_contract', c.id, 'deleted');
      ev.audit('contract.deleted', 'fin_contract', c.id, { name: c.name });
    });
    return OK;
  }

  // ------------------------------------------------------------ overviews

  async summary(ctx: HouseholdContext): Promise<Out<C['contractSummary']>> {
    requireFeature(ctx, 'contracts');
    const today = todayIn(ctx);
    const currency = householdCurrency(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const active = await tx.select().from(finContracts).where(eq(finContracts.status, 'active'));
      const totals = contractTotals(active.filter((c) => c.currency === currency));
      const upcomingDeadlines = active
        .map((c) => ({ c, deadline: cancellationDeadline(c, today) }))
        .filter((x): x is { c: ContractRow; deadline: string } => x.deadline !== null)
        .map((x) => ({
          contractId: x.c.id,
          name: x.c.name,
          cancellationDeadline: x.deadline,
          daysLeft: daysUntil(x.deadline, today),
        }))
        .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 90)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return {
        currency,
        activeCount: active.length,
        ...totals,
        upcomingDeadlines,
        suggestionCount: (await this.detect(tx, ctx)).length,
      };
    });
  }

  async insurance(ctx: HouseholdContext): Promise<Out<C['insuranceOverview']>> {
    requireFeature(ctx, 'contracts');
    const today = todayIn(ctx);
    const currency = householdCurrency(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(finContracts)
        .where(and(eq(finContracts.status, 'active'), eq(finContracts.contractType, 'insurance')))
        .orderBy(finContracts.name);
      const totals = contractTotals(rows.filter((r) => r.currency === currency));
      return {
        currency,
        monthlyMinor: totals.monthlyMinor,
        yearlyMinor: totals.yearlyMinor,
        contracts: rows.map((r) => this.toContract(r, today)),
      };
    });
  }

  // ------------------------------------------------------------ maintenance

  /**
   * Daily job: rolls past due dates forward and reminds adults when the last day to give
   * notice is at most NOTICE_LEAD_DAYS away (once per contract and deadline).
   */
  async noticeReminders(now = new Date()): Promise<number> {
    const rows = await this.db.system
      .select({ contract: finContracts, household: households })
      .from(finContracts)
      .innerJoin(households, eq(households.id, finContracts.householdId))
      .where(
        and(
          eq(finContracts.status, 'active'),
          isNotNull(finContracts.noticePeriodDays),
          isNull(households.deletedAt),
        ),
      );
    let sent = 0;
    for (const { contract: c, household: h } of rows) {
      if (!hasFeature(h.plan, 'contracts')) continue;
      const today = toLocalDate(now, h.timezone);
      if (c.nextDueDate && c.nextDueDate < today) {
        const next = rollForward(c.nextDueDate, c.interval, today);
        await this.db.system
          .update(finContracts)
          .set({ nextDueDate: next })
          .where(and(eq(finContracts.id, c.id), eq(finContracts.householdId, h.id)));
        c.nextDueDate = next;
      }
      const deadline = cancellationDeadline(c, today);
      if (!deadline) continue;
      const days = daysUntil(deadline, today);
      if (days < 0 || days > NOTICE_LEAD_DAYS) continue;
      if (!(await once(this.db.system, h.id, `contract-notice:${c.id}:${deadline}`))) continue;
      await this.notifications.notify({
        householdId: h.id,
        memberIds: await adultMemberIds(this.db.system, h.id),
        type: 'finance.contract_notice',
        message: 'notifications.contractNotice',
        vars: {
          name: c.name,
          date: formatDate(localDateToFloating(deadline), h.locale === 'en' ? 'en' : 'de', 'UTC'),
        },
        link: `/finance/contracts?contract=${c.id}`,
      });
      sent++;
    }
    return sent;
  }
}

function suggestionName(c: RecurringCandidate): string {
  return (c.counterpartyName ?? c.counterpartyKey.replace(/^(iban|name):/, ''))
    .trim()
    .slice(0, 120);
}

/** When a cancellation takes effect: the minimum term end if still ahead, else the next due date. */
function cancellationEnd(c: ContractRow, today: string): string | null {
  if (c.minimumTermEnd && c.minimumTermEnd >= today) return c.minimumTermEnd;
  return c.nextDueDate;
}
