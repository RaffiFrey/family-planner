import { Injectable } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import {
  finAccounts,
  finGoalContributions,
  finGoals,
  finTransactions,
  householdMembers,
  type Transaction,
} from '@fp/db';
import { goalProgress } from '@fp/domain/finance';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import { badRequest, notFound } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { Db, type UnitEvents } from '../../infra/database.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  adultMemberIds,
  asCurrency,
  householdCurrency,
  todayIn,
  visibleAccounts,
} from './finance-plus.common.js';

type C = typeof apiContract.financePlus;
type GoalRow = typeof finGoals.$inferSelect;
type GoalDto = Out<C['createGoal']>;

@Injectable()
export class GoalsService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  /** Saved amount per goal: the linked account's balance (if visible) or the contributions. */
  private async saved(
    tx: Transaction,
    ctx: HouseholdContext,
    goals: GoalRow[],
  ): Promise<Map<string, { saved: number; source: 'account' | 'contributions' }>> {
    const out = new Map<string, { saved: number; source: 'account' | 'contributions' }>();
    if (goals.length === 0) return out;
    const sums = await tx
      .select({
        goalId: finGoalContributions.goalId,
        sum: sql<number>`coalesce(sum(${finGoalContributions.amountMinor}), 0)::bigint`,
      })
      .from(finGoalContributions)
      .where(
        inArray(
          finGoalContributions.goalId,
          goals.map((g) => g.id),
        ),
      )
      .groupBy(finGoalContributions.goalId);
    const accountIds = goals.map((g) => g.accountId).filter((a): a is string => !!a);
    const accounts = accountIds.length
      ? await tx
          .select({ id: finAccounts.id, opening: finAccounts.openingBalanceMinor })
          .from(finAccounts)
          .where(and(inArray(finAccounts.id, accountIds), visibleAccounts(ctx)))
      : [];
    const txSums = accounts.length
      ? await tx
          .select({
            accountId: finTransactions.accountId,
            sum: sql<number>`coalesce(sum(${finTransactions.amountMinor}), 0)::bigint`,
          })
          .from(finTransactions)
          .where(
            inArray(
              finTransactions.accountId,
              accounts.map((a) => a.id),
            ),
          )
          .groupBy(finTransactions.accountId)
      : [];
    for (const g of goals) {
      const account = accounts.find((a) => a.id === g.accountId);
      const txSum = txSums.find((s) => s.accountId === g.accountId)?.sum ?? 0;
      out.set(
        g.id,
        account
          ? { saved: account.opening + txSum, source: 'account' }
          : {
              saved: sums.find((s) => s.goalId === g.id)?.sum ?? 0,
              source: 'contributions',
            },
      );
    }
    return out;
  }

  private toGoal(
    g: GoalRow,
    saved: { saved: number; source: 'account' | 'contributions' },
    today: string,
  ): GoalDto {
    const p = goalProgress({
      targetMinor: g.targetMinor,
      savedMinor: saved.saved,
      deadline: g.deadline,
      today,
    });
    return {
      id: g.id,
      name: g.name,
      targetMinor: g.targetMinor,
      currency: asCurrency(g.currency),
      deadline: g.deadline,
      accountId: g.accountId,
      color: g.color,
      icon: g.icon,
      archived: g.archived,
      progressSource: saved.source,
      ...p,
      reachedAt: isoOrNull(g.reachedAt),
      createdAt: iso(g.createdAt),
    };
  }

  /**
   * Maps goals to DTOs and marks newly reached ones (reached_at is set exactly once, which
   * makes the notification fire once). Returns the reached goals for notifying after commit.
   */
  private async present(tx: Transaction, ctx: HouseholdContext, goals: GoalRow[]) {
    const today = todayIn(ctx);
    const saved = await this.saved(tx, ctx, goals);
    const reached: GoalRow[] = [];
    const dtos: GoalDto[] = [];
    for (const g of goals) {
      let row = g;
      const s = saved.get(g.id) ?? { saved: 0, source: 'contributions' as const };
      if (!g.reachedAt && !g.archived && s.saved >= g.targetMinor) {
        const [updated] = await tx
          .update(finGoals)
          .set({ reachedAt: new Date() })
          .where(and(eq(finGoals.id, g.id), isNull(finGoals.reachedAt)))
          .returning();
        if (updated) {
          row = updated;
          reached.push(updated);
        }
      }
      dtos.push(this.toGoal(row, s, today));
    }
    return { dtos, reached };
  }

  private async notifyReached(ctx: HouseholdContext, reached: GoalRow[]): Promise<void> {
    if (reached.length === 0) return;
    const memberIds = await adultMemberIds(this.db.system, ctx.householdId);
    for (const g of reached) {
      await this.notifications.notify({
        householdId: ctx.householdId,
        memberIds,
        type: 'finance.goal_reached',
        message: 'notifications.goalReached',
        vars: { name: g.name },
        link: `/finance/goals?goal=${g.id}`,
      });
    }
  }

  private async load(tx: Transaction, id: string): Promise<GoalRow> {
    const [g] = await tx.select().from(finGoals).where(eq(finGoals.id, id));
    if (!g) throw notFound('Goal');
    return g;
  }

  private async assertAccount(
    tx: Transaction,
    ctx: HouseholdContext,
    accountId: string | null | undefined,
  ): Promise<void> {
    if (!accountId) return;
    const [a] = await tx
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(and(eq(finAccounts.id, accountId), visibleAccounts(ctx)));
    if (!a) throw badRequest('Unknown account', 'invalid_account');
  }

  /** Runs a unit of work returning one goal and sends goal-reached notifications afterwards. */
  private async withGoal(
    ctx: HouseholdContext,
    fn: (tx: Transaction, ev: UnitEvents) => Promise<GoalRow>,
  ): Promise<GoalDto> {
    const { dto, reached } = await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const g = await fn(tx, ev);
      const { dtos, reached } = await this.present(tx, ctx, [g]);
      return { dto: dtos[0] as GoalDto, reached };
    });
    await this.notifyReached(ctx, reached);
    return dto;
  }

  async list(ctx: HouseholdContext, input: In<C['listGoals']>): Promise<Out<C['listGoals']>> {
    const { dtos, reached } = await this.db.tenant(actorOf(ctx), async (tx) => {
      const goals = await tx
        .select()
        .from(finGoals)
        .where(input.query.includeArchived ? undefined : eq(finGoals.archived, false))
        .orderBy(finGoals.createdAt);
      return this.present(tx, ctx, goals);
    });
    await this.notifyReached(ctx, reached);
    return dtos;
  }

  async create(ctx: HouseholdContext, input: In<C['createGoal']>): Promise<Out<C['createGoal']>> {
    const b = input.body;
    return this.withGoal(ctx, async (tx, ev) => {
      await this.assertAccount(tx, ctx, b.accountId);
      const [g] = await tx
        .insert(finGoals)
        .values({
          householdId: ctx.householdId,
          name: b.name,
          targetMinor: b.targetMinor,
          currency: b.currency ?? householdCurrency(ctx),
          deadline: b.deadline ?? null,
          accountId: b.accountId ?? null,
          color: b.color ?? null,
          icon: b.icon ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!g) throw new Error('insert failed');
      ev.changed('goal', g.id, 'created');
      return g;
    });
  }

  async update(ctx: HouseholdContext, input: In<C['updateGoal']>): Promise<Out<C['updateGoal']>> {
    return this.withGoal(ctx, async (tx, ev) => {
      const current = await this.load(tx, input.params.goalId);
      await this.assertAccount(tx, ctx, input.body.accountId);
      // Raising the target re-arms the "reached" notification.
      const rearm =
        input.body.targetMinor !== undefined && input.body.targetMinor > current.targetMinor;
      const [g] = await tx
        .update(finGoals)
        .set({ ...input.body, ...(rearm ? { reachedAt: null } : {}) })
        .where(eq(finGoals.id, current.id))
        .returning();
      if (!g) throw notFound('Goal');
      ev.changed('goal', g.id, 'updated');
      return g;
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['deleteGoal']>): Promise<Out<C['deleteGoal']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const g = await this.load(tx, input.params.goalId);
      await tx.delete(finGoals).where(eq(finGoals.id, g.id));
      ev.changed('goal', g.id, 'deleted');
    });
    return OK;
  }

  async listContributions(
    ctx: HouseholdContext,
    input: In<C['listContributions']>,
  ): Promise<Out<C['listContributions']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const g = await this.load(tx, input.params.goalId);
      const rows = await tx
        .select()
        .from(finGoalContributions)
        .where(eq(finGoalContributions.goalId, g.id))
        .orderBy(desc(finGoalContributions.date), desc(finGoalContributions.createdAt));
      return rows.map((r) => ({
        id: r.id,
        goalId: r.goalId,
        amountMinor: r.amountMinor,
        date: r.date,
        memberId: r.memberId,
        note: r.note,
        createdAt: iso(r.createdAt),
      }));
    });
  }

  async addContribution(
    ctx: HouseholdContext,
    input: In<C['addContribution']>,
  ): Promise<Out<C['addContribution']>> {
    const b = input.body;
    return this.withGoal(ctx, async (tx, ev) => {
      const g = await this.load(tx, input.params.goalId);
      if (b.memberId) {
        const [m] = await tx
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(and(eq(householdMembers.id, b.memberId), isNull(householdMembers.removedAt)));
        if (!m) throw badRequest('Unknown member', 'invalid_member');
      }
      await tx.insert(finGoalContributions).values({
        householdId: ctx.householdId,
        goalId: g.id,
        amountMinor: b.amountMinor,
        date: b.date ?? todayIn(ctx),
        memberId: b.memberId === undefined ? ctx.member.id : b.memberId,
        note: b.note ?? null,
      });
      ev.changed('goal', g.id, 'updated');
      return g;
    });
  }

  async removeContribution(
    ctx: HouseholdContext,
    input: In<C['removeContribution']>,
  ): Promise<Out<C['removeContribution']>> {
    return this.withGoal(ctx, async (tx, ev) => {
      const g = await this.load(tx, input.params.goalId);
      const [r] = await tx
        .delete(finGoalContributions)
        .where(
          and(
            eq(finGoalContributions.id, input.params.contributionId),
            eq(finGoalContributions.goalId, g.id),
          ),
        )
        .returning({ id: finGoalContributions.id });
      if (!r) throw notFound('Contribution');
      ev.changed('goal', g.id, 'updated');
      return g;
    });
  }
}
