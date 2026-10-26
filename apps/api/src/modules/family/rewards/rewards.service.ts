import { Injectable } from '@nestjs/common';
import type { apiContract, Redemption as RedemptionDto, Reward as RewardDto } from '@fp/contracts';
import {
  allowanceLedger,
  allowanceRules,
  householdMembers,
  households,
  rewardPoints,
  rewardRedemptions,
  rewards,
  tasks,
  type Transaction,
} from '@fp/db';
import {
  dueAllowance,
  leaderboard,
  nextPayday,
  periodRange,
  settlePoints,
  signedAllowanceAmount,
} from '@fp/domain/family';
import { toLocalDate } from '@fp/domain/time';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { conflict, forbidden, notFound } from '../../../common/errors.js';
import { decodeCursor, toPage } from '../../../common/pagination.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { Db, flushEvents, UnitEvents } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { assertMembers, hasRewards, isAdult, requireAdult, requireRewards } from '../common.js';

type C = typeof apiContract.rewards;
type RewardRow = typeof rewards.$inferSelect;
type RedemptionRow = typeof rewardRedemptions.$inferSelect;
type RuleRow = typeof allowanceRules.$inferSelect;
type PointsRow = typeof rewardPoints.$inferSelect;
type AllowanceRow = typeof allowanceLedger.$inferSelect;

function toReward(r: RewardRow): RewardDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    costPoints: r.costPoints,
    icon: r.icon,
    active: r.active,
    createdAt: iso(r.createdAt),
  };
}

function toRedemption(r: RedemptionRow): RedemptionDto {
  return {
    id: r.id,
    rewardId: r.rewardId,
    rewardTitle: r.rewardTitle,
    costPoints: r.costPoints,
    memberId: r.memberId,
    status: r.status,
    note: r.note,
    decidedByMemberId: r.decidedByMemberId,
    decidedAt: isoOrNull(r.decidedAt),
    createdAt: iso(r.createdAt),
  };
}

function toPointsEntry(p: PointsRow) {
  return {
    id: p.id,
    memberId: p.memberId,
    delta: p.delta,
    reason: p.reason,
    taskId: p.taskId,
    rewardId: p.rewardId,
    createdByMemberId: p.createdByMemberId,
    createdAt: iso(p.createdAt),
  };
}

function toAllowanceEntry(a: AllowanceRow) {
  return {
    id: a.id,
    memberId: a.memberId,
    amountMinor: a.amountMinor,
    currency: a.currency,
    kind: a.kind,
    note: a.note,
    date: a.date,
    ruleId: a.ruleId,
    createdByMemberId: a.createdByMemberId,
    createdAt: iso(a.createdAt),
  };
}

function toRule(r: RuleRow, today: string) {
  const schedule = {
    interval: r.interval,
    weekday: r.weekday,
    dayOfMonth: r.dayOfMonth,
    startsOn: r.startsOn,
  };
  return {
    id: r.id,
    memberId: r.memberId,
    amountMinor: r.amountMinor,
    currency: r.currency,
    interval: r.interval,
    weekday: r.weekday,
    dayOfMonth: r.dayOfMonth,
    startsOn: r.startsOn,
    active: r.active,
    nextPayday: r.active ? nextPayday(schedule, today) : null,
  };
}

/** Members whose personal reward data the caller may see: adults see everyone, others themselves. */
function scopeMember(ctx: HouseholdContext, requested: string | undefined): string | undefined {
  if (isAdult(ctx)) return requested;
  if (requested && requested !== ctx.member.id) throw forbidden();
  return ctx.member.id;
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private today(ctx: HouseholdContext): string {
    return toLocalDate(new Date(), ctx.household.timezone);
  }

  /** Serializes point spending per member so concurrent requests can't overdraw. */
  private async lockMember(tx: Transaction, memberId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`points:${memberId}`}))`);
  }

  private async accounts(tx: Transaction, memberIds: string[]) {
    if (memberIds.length === 0) return [];
    const sums = await tx
      .select({
        memberId: rewardPoints.memberId,
        delta: sql<number>`coalesce(sum(${rewardPoints.delta}), 0)::int`,
      })
      .from(rewardPoints)
      .where(inArray(rewardPoints.memberId, memberIds))
      .groupBy(rewardPoints.memberId);
    const pending = await tx
      .select({ memberId: rewardRedemptions.memberId, cost: rewardRedemptions.costPoints })
      .from(rewardRedemptions)
      .where(
        and(
          inArray(rewardRedemptions.memberId, memberIds),
          eq(rewardRedemptions.status, 'requested'),
        ),
      );
    return settlePoints(memberIds, sums, pending);
  }

  private async activeMemberIds(tx: Transaction): Promise<string[]> {
    const rows = await tx
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(isNull(householdMembers.removedAt), ne(householdMembers.role, 'caregiver')))
      .orderBy(asc(householdMembers.joinedAt));
    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------------- points

  async balances(ctx: HouseholdContext): Promise<Out<C['balances']>> {
    requireRewards(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const ids = isAdult(ctx) ? await this.activeMemberIds(tx) : [ctx.member.id];
      return this.accounts(tx, ids);
    });
  }

  async points(ctx: HouseholdContext, input: In<C['points']>): Promise<Out<C['points']>> {
    requireRewards(ctx);
    const q = input.query;
    const memberId = scopeMember(ctx, q.memberId);
    const cursor = decodeCursor(q.cursor);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(rewardPoints)
        .where(
          and(
            memberId ? eq(rewardPoints.memberId, memberId) : undefined,
            cursor ? lt(rewardPoints.id, cursor.id) : undefined,
          ),
        )
        .orderBy(desc(rewardPoints.id))
        .limit(q.limit + 1);
      return toPage(rows, q.limit, (r) => ({ v: iso(r.createdAt), id: r.id }), toPointsEntry);
    });
  }

  async adjustPoints(
    ctx: HouseholdContext,
    input: In<C['adjustPoints']>,
  ): Promise<Out<C['adjustPoints']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [b.memberId]);
      const [row] = await tx
        .insert(rewardPoints)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          delta: b.delta,
          reason: b.reason,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('points', row.id, 'created', b.memberId);
      ev.audit('rewards.points_adjusted', 'member', b.memberId, {
        delta: b.delta,
        reason: b.reason,
      });
      return toPointsEntry(row);
    });
  }

  async leaderboard(
    ctx: HouseholdContext,
    input: In<C['leaderboard']>,
  ): Promise<Out<C['leaderboard']>> {
    requireRewards(ctx);
    const period = input.query.period;
    // Noon UTC lies on the same calendar day in every European time zone.
    const at = input.query.at ? new Date(`${input.query.at}T12:00:00Z`) : new Date();
    const range = periodRange(period, at, ctx.household.timezone);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const ids = await this.activeMemberIds(tx);
      const rows = await tx
        .select({
          memberId: rewardPoints.memberId,
          delta: rewardPoints.delta,
          at: rewardPoints.createdAt,
        })
        .from(rewardPoints)
        .where(
          and(
            sql`${rewardPoints.delta} > 0`,
            gte(rewardPoints.createdAt, range.start),
            lt(rewardPoints.createdAt, range.end),
          ),
        );
      const active = new Set(ids);
      return {
        period,
        from: range.startDate,
        to: range.endDate,
        rows: leaderboard(
          rows.filter((r) => active.has(r.memberId)),
          range.start,
          range.end,
          ids,
        ),
      };
    });
  }

  // ---------------------------------------------------------------- catalogue & redemptions

  private async loadReward(tx: Transaction, id: string): Promise<RewardRow> {
    const [r] = await tx.select().from(rewards).where(eq(rewards.id, id));
    if (!r) throw notFound('Reward');
    return r;
  }

  async catalog(ctx: HouseholdContext): Promise<Out<C['catalog']>> {
    requireRewards(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(rewards)
        .where(isAdult(ctx) ? undefined : eq(rewards.active, true))
        .orderBy(asc(rewards.costPoints), asc(rewards.title));
      return rows.map(toReward);
    });
  }

  async createReward(
    ctx: HouseholdContext,
    input: In<C['createReward']>,
  ): Promise<Out<C['createReward']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .insert(rewards)
        .values({ householdId: ctx.householdId, ...input.body, createdByMemberId: ctx.member.id })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('reward', row.id, 'created');
      ev.audit('reward.created', 'reward', row.id, { title: row.title });
      return toReward(row);
    });
  }

  async updateReward(
    ctx: HouseholdContext,
    input: In<C['updateReward']>,
  ): Promise<Out<C['updateReward']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadReward(tx, input.params.rewardId);
      const [row] = await tx
        .update(rewards)
        .set({ ...input.body, updatedAt: new Date() })
        .where(eq(rewards.id, current.id))
        .returning();
      if (!row) throw notFound('Reward');
      ev.changed('reward', row.id, 'updated');
      return toReward(row);
    });
  }

  async removeReward(
    ctx: HouseholdContext,
    input: In<C['removeReward']>,
  ): Promise<Out<C['removeReward']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadReward(tx, input.params.rewardId);
      // Open requests for a deleted reward are void.
      await tx
        .update(rewardRedemptions)
        .set({ status: 'cancelled', decidedAt: new Date(), decidedByMemberId: ctx.member.id })
        .where(
          and(
            eq(rewardRedemptions.rewardId, current.id),
            eq(rewardRedemptions.status, 'requested'),
          ),
        );
      await tx.delete(rewards).where(eq(rewards.id, current.id));
      ev.changed('reward', current.id, 'deleted');
      ev.audit('reward.deleted', 'reward', current.id, { title: current.title });
    });
    return OK;
  }

  async redeem(ctx: HouseholdContext, input: In<C['redeem']>): Promise<Out<C['redeem']>> {
    requireRewards(ctx);
    const memberId = input.body.memberId ?? ctx.member.id;
    if (memberId !== ctx.member.id && !isAdult(ctx)) throw forbidden();
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [memberId]);
      const reward = await this.loadReward(tx, input.params.rewardId);
      if (!reward.active) throw conflict('This reward is not available', 'reward_inactive');
      await this.lockMember(tx, memberId);
      const [account] = await this.accounts(tx, [memberId]);
      if (!account || account.available < reward.costPoints)
        throw conflict('Not enough points', 'insufficient_points');
      const [row] = await tx
        .insert(rewardRedemptions)
        .values({
          householdId: ctx.householdId,
          rewardId: reward.id,
          rewardTitle: reward.title,
          costPoints: reward.costPoints,
          memberId,
          note: input.body.note ?? null,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('reward', row.id, 'created', reward.id);
      ev.audit('reward.redemption_requested', 'reward', reward.id, { memberId });
      ev.emit('rewards.redemption_requested', {
        redemptionId: row.id,
        memberId,
        rewardTitle: reward.title,
      });
      return toRedemption(row);
    });
  }

  async redemptions(
    ctx: HouseholdContext,
    input: In<C['redemptions']>,
  ): Promise<Out<C['redemptions']>> {
    requireRewards(ctx);
    const memberId = scopeMember(ctx, input.query.memberId);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(rewardRedemptions)
        .where(
          and(
            memberId ? eq(rewardRedemptions.memberId, memberId) : undefined,
            input.query.status ? eq(rewardRedemptions.status, input.query.status) : undefined,
          ),
        )
        .orderBy(desc(rewardRedemptions.createdAt))
        .limit(500);
      return rows.map(toRedemption);
    });
  }

  private async loadOpenRedemption(tx: Transaction, id: string): Promise<RedemptionRow> {
    const [r] = await tx.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, id));
    if (!r) throw notFound('Redemption');
    if (r.status !== 'requested') throw conflict('Already decided', 'already_decided');
    return r;
  }

  async approveRedemption(
    ctx: HouseholdContext,
    input: In<C['approveRedemption']>,
  ): Promise<Out<C['approveRedemption']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadOpenRedemption(tx, input.params.redemptionId);
      await this.lockMember(tx, current.memberId);
      const [account] = await this.accounts(tx, [current.memberId]);
      // This request's own reservation is part of `reserved`.
      if (!account || account.available + current.costPoints < current.costPoints)
        throw conflict('Not enough points', 'insufficient_points');
      const [row] = await tx
        .update(rewardRedemptions)
        .set({
          status: 'approved',
          decidedAt: new Date(),
          decidedByMemberId: ctx.member.id,
          ...(input.body.note ? { note: input.body.note } : {}),
        })
        .where(and(eq(rewardRedemptions.id, current.id), eq(rewardRedemptions.status, 'requested')))
        .returning();
      if (!row) throw conflict('Already decided', 'already_decided');
      const [points] = await tx
        .insert(rewardPoints)
        .values({
          householdId: ctx.householdId,
          memberId: row.memberId,
          delta: -row.costPoints,
          reason: row.rewardTitle,
          rewardId: row.rewardId,
          redemptionId: row.id,
          createdByMemberId: ctx.member.id,
        })
        .returning({ id: rewardPoints.id });
      ev.changed('reward', row.id, 'updated', row.rewardId);
      if (points) ev.changed('points', points.id, 'created', row.memberId);
      ev.audit('reward.redemption_approved', 'reward', row.rewardId, { memberId: row.memberId });
      ev.emit('rewards.redemption_decided', {
        redemptionId: row.id,
        memberId: row.memberId,
        rewardTitle: row.rewardTitle,
        status: row.status,
      });
      return toRedemption(row);
    });
  }

  async rejectRedemption(
    ctx: HouseholdContext,
    input: In<C['rejectRedemption']>,
  ): Promise<Out<C['rejectRedemption']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    return this.decide(ctx, input.params.redemptionId, 'rejected', input.body.note);
  }

  async cancelRedemption(
    ctx: HouseholdContext,
    input: In<C['cancelRedemption']>,
  ): Promise<Out<C['cancelRedemption']>> {
    requireRewards(ctx);
    return this.decide(ctx, input.params.redemptionId, 'cancelled');
  }

  private async decide(
    ctx: HouseholdContext,
    id: string,
    status: 'rejected' | 'cancelled',
    note?: string,
  ): Promise<RedemptionDto> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadOpenRedemption(tx, id);
      if (status === 'cancelled' && current.memberId !== ctx.member.id && !isAdult(ctx))
        throw forbidden();
      const [row] = await tx
        .update(rewardRedemptions)
        .set({
          status,
          decidedAt: new Date(),
          decidedByMemberId: ctx.member.id,
          ...(note ? { note } : {}),
        })
        .where(and(eq(rewardRedemptions.id, current.id), eq(rewardRedemptions.status, 'requested')))
        .returning();
      if (!row) throw conflict('Already decided', 'already_decided');
      ev.changed('reward', row.id, 'updated', row.rewardId);
      ev.audit(`reward.redemption_${status}`, 'reward', row.rewardId, { memberId: row.memberId });
      return toRedemption(row);
    });
  }

  // ---------------------------------------------------------------- pocket money

  async allowanceRules(ctx: HouseholdContext): Promise<Out<C['allowanceRules']>> {
    requireRewards(ctx);
    const memberId = scopeMember(ctx, undefined);
    const today = this.today(ctx);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(allowanceRules)
        .where(memberId ? eq(allowanceRules.memberId, memberId) : undefined)
        .orderBy(asc(allowanceRules.createdAt));
      return rows.map((r) => toRule(r, today));
    });
  }

  async createAllowanceRule(
    ctx: HouseholdContext,
    input: In<C['createAllowanceRule']>,
  ): Promise<Out<C['createAllowanceRule']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    const b = input.body;
    const today = this.today(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [b.memberId]);
      const [row] = await tx
        .insert(allowanceRules)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          amountMinor: b.amountMinor,
          currency: b.currency ?? ctx.household.currency,
          interval: b.interval,
          weekday: b.interval === 'weekly' ? b.weekday : null,
          dayOfMonth: b.interval === 'monthly' ? b.dayOfMonth : null,
          startsOn: b.startsOn ?? today,
          active: b.active,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('points', row.id, 'created', row.memberId);
      ev.audit('allowance.rule_created', 'member', row.memberId, {
        amountMinor: row.amountMinor,
        interval: row.interval,
      });
      return toRule(row, today);
    });
  }

  async updateAllowanceRule(
    ctx: HouseholdContext,
    input: In<C['updateAllowanceRule']>,
  ): Promise<Out<C['updateAllowanceRule']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    const today = this.today(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [current] = await tx
        .select()
        .from(allowanceRules)
        .where(eq(allowanceRules.id, input.params.ruleId));
      if (!current) throw notFound('Rule');
      const next = { ...current, ...input.body };
      if (next.interval === 'weekly' ? next.weekday === null : next.dayOfMonth === null)
        throw conflict('Weekly rules need a weekday, monthly rules a day of month', 'invalid_rule');
      const [row] = await tx
        .update(allowanceRules)
        .set({ ...input.body, updatedAt: new Date() })
        .where(eq(allowanceRules.id, current.id))
        .returning();
      if (!row) throw notFound('Rule');
      ev.changed('points', row.id, 'updated', row.memberId);
      ev.audit('allowance.rule_updated', 'member', row.memberId, input.body);
      return toRule(row, today);
    });
  }

  async removeAllowanceRule(
    ctx: HouseholdContext,
    input: In<C['removeAllowanceRule']>,
  ): Promise<Out<C['removeAllowanceRule']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .delete(allowanceRules)
        .where(eq(allowanceRules.id, input.params.ruleId))
        .returning();
      if (!row) throw notFound('Rule');
      ev.changed('points', row.id, 'deleted', row.memberId);
      ev.audit('allowance.rule_deleted', 'member', row.memberId);
    });
    return OK;
  }

  async allowanceBalances(ctx: HouseholdContext): Promise<Out<C['allowanceBalances']>> {
    requireRewards(ctx);
    const memberId = scopeMember(ctx, undefined);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select({
          memberId: allowanceLedger.memberId,
          currency: allowanceLedger.currency,
          balanceMinor: sql<string>`coalesce(sum(${allowanceLedger.amountMinor}), 0)`,
        })
        .from(allowanceLedger)
        .where(memberId ? eq(allowanceLedger.memberId, memberId) : undefined)
        .groupBy(allowanceLedger.memberId, allowanceLedger.currency)
        .orderBy(asc(allowanceLedger.memberId));
      return rows.map((r) => ({ ...r, balanceMinor: Number(r.balanceMinor) }));
    });
  }

  async allowanceLedger(
    ctx: HouseholdContext,
    input: In<C['allowanceLedger']>,
  ): Promise<Out<C['allowanceLedger']>> {
    requireRewards(ctx);
    const q = input.query;
    const memberId = scopeMember(ctx, q.memberId);
    const cursor = decodeCursor(q.cursor);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(allowanceLedger)
        .where(
          and(
            memberId ? eq(allowanceLedger.memberId, memberId) : undefined,
            cursor
              ? or(
                  lt(allowanceLedger.date, cursor.v),
                  and(eq(allowanceLedger.date, cursor.v), lt(allowanceLedger.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(allowanceLedger.date), desc(allowanceLedger.id))
        .limit(q.limit + 1);
      return toPage(rows, q.limit, (r) => ({ v: r.date, id: r.id }), toAllowanceEntry);
    });
  }

  async addAllowanceEntry(
    ctx: HouseholdContext,
    input: In<C['addAllowanceEntry']>,
  ): Promise<Out<C['addAllowanceEntry']>> {
    requireRewards(ctx);
    requireAdult(ctx);
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [b.memberId]);
      const [row] = await tx
        .insert(allowanceLedger)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          amountMinor: signedAllowanceAmount(b.kind, b.amountMinor),
          currency: ctx.household.currency,
          kind: b.kind,
          note: b.note,
          date: b.date ?? this.today(ctx),
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('points', row.id, 'created', row.memberId);
      ev.audit('allowance.entry_added', 'member', row.memberId, {
        kind: row.kind,
        amountMinor: row.amountMinor,
      });
      return toAllowanceEntry(row);
    });
  }

  // ---------------------------------------------------------------- background work

  /**
   * Handler for the `task.completed` domain event: books the task's points once per task
   * (unique `task_id`), only for households with the rewards feature.
   */
  async awardTaskPoints(e: {
    householdId: string;
    taskId: string;
    memberId: string;
    /** Untrusted job payload. */
    points?: unknown;
  }): Promise<boolean> {
    const points = Number(e.points ?? 0);
    if (!Number.isInteger(points) || points <= 0) return false;
    const [h] = await this.db.system
      .select({ plan: households.plan })
      .from(households)
      .where(eq(households.id, e.householdId));
    if (!h || !hasRewards(h.plan)) return false;
    const [task] = await this.db.system
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.id, e.taskId), eq(tasks.householdId, e.householdId)));
    const [member] = await this.db.system
      .select({ name: householdMembers.displayName })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.id, e.memberId), eq(householdMembers.householdId, e.householdId)),
      );
    if (!task || !member) return false;
    const awarded = await this.db.system.transaction(async (tx) => {
      const rows = await tx
        .insert(rewardPoints)
        .values({
          id: uuidv7(),
          householdId: e.householdId,
          memberId: e.memberId,
          delta: points,
          reason: task.title,
          taskId: e.taskId,
        })
        .onConflictDoNothing()
        .returning({ id: rewardPoints.id });
      const row = rows[0];
      if (!row) return false;
      const ev = new UnitEvents();
      ev.changed('points', row.id, 'created', e.memberId);
      await flushEvents(tx, { householdId: e.householdId, memberId: null, userId: null }, ev);
      return true;
    });
    if (!awarded) return false;
    const adults = await this.db.system
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, e.householdId),
          isNull(householdMembers.removedAt),
          inArray(householdMembers.role, ['owner', 'admin', 'adult']),
        ),
      );
    await this.notifications.notify({
      householdId: e.householdId,
      memberIds: [...new Set([e.memberId, ...adults.map((a) => a.id)])],
      type: 'rewards.points_earned',
      message: 'notifications.pointsEarned',
      vars: { points, member: member.name, task: task.title },
      link: '/rewards',
    });
    return true;
  }

  /** Notifies adults about a new redemption request, or the member about the decision. */
  async notifyRedemption(e: {
    householdId: string;
    actorMemberId: string | null;
    memberId: string;
    rewardTitle: string;
    status?: string;
  }): Promise<void> {
    const [member] = await this.db.system
      .select({ name: householdMembers.displayName })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.id, e.memberId), eq(householdMembers.householdId, e.householdId)),
      );
    let recipients = [e.memberId];
    if (!e.status) {
      const adults = await this.db.system
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, e.householdId),
            isNull(householdMembers.removedAt),
            inArray(householdMembers.role, ['owner', 'admin', 'adult']),
          ),
        );
      recipients = adults.map((a) => a.id);
    }
    await this.notifications.notify({
      householdId: e.householdId,
      memberIds: recipients,
      exceptMemberId: e.actorMemberId,
      type: 'rewards.redeemed',
      message: 'notifications.rewardRedeemed',
      vars: { member: member?.name ?? '', reward: e.rewardTitle },
      link: '/rewards',
    });
  }

  /** Books due pocket-money payouts (once per rule and period). Returns the number booked. */
  async payAllowances(now = new Date()): Promise<number> {
    const rules = await this.db.system
      .select({ rule: allowanceRules, timezone: households.timezone, plan: households.plan })
      .from(allowanceRules)
      .innerJoin(households, eq(households.id, allowanceRules.householdId))
      .innerJoin(householdMembers, eq(householdMembers.id, allowanceRules.memberId))
      .where(
        and(
          eq(allowanceRules.active, true),
          isNull(households.deletedAt),
          isNull(householdMembers.removedAt),
        ),
      );
    let booked = 0;
    for (const { rule, timezone, plan } of rules) {
      if (!hasRewards(plan)) continue;
      const today = toLocalDate(now, timezone);
      const due = dueAllowance(rule, today);
      if (!due) continue;
      const inserted = await this.db.system.transaction(async (tx) => {
        const rows = await tx
          .insert(allowanceLedger)
          .values({
            householdId: rule.householdId,
            memberId: rule.memberId,
            amountMinor: rule.amountMinor,
            currency: rule.currency,
            kind: 'payout',
            date: due.payday,
            ruleId: rule.id,
            periodKey: due.periodKey,
          })
          .onConflictDoNothing()
          .returning({ id: allowanceLedger.id });
        const row = rows[0];
        if (!row) return false;
        const ev = new UnitEvents();
        ev.changed('points', row.id, 'created', rule.memberId);
        ev.audit('allowance.payout', 'member', rule.memberId, {
          amountMinor: rule.amountMinor,
          period: due.periodKey,
        });
        await flushEvents(tx, { householdId: rule.householdId, memberId: null, userId: null }, ev);
        return true;
      });
      if (inserted) booked++;
    }
    return booked;
  }
}
