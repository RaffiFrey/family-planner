import { Injectable } from '@nestjs/common';
import type {
  apiContract,
  HomeAsset as HomeAssetDto,
  MaintenancePlan as MaintenancePlanDto,
} from '@fp/contracts';
import {
  assets,
  files,
  maintenanceLogs,
  maintenancePlans,
  type MaintenanceRecurrenceJson,
  meterReadings,
  type Transaction,
} from '@fp/db';
import {
  consumptionStats,
  initialMaintenanceDue,
  MAINTENANCE_TEMPLATES,
  type MaintenanceRecurrence,
  maintenanceReminderStage,
  maintenanceTemplate,
  nextMaintenanceDue,
  validateMaintenanceRecurrence,
} from '@fp/domain/care';
import { RecurrenceError } from '@fp/domain/recurrence';
import {
  addFloating,
  floatingToLocalDate,
  localDateToFloating,
  toLocalDate,
} from '@fp/domain/time';
import { formatDate } from '@fp/i18n';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { Db } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { activeHouseholds, adultMemberIds, assertMembers, once } from '../shared.js';

type C = typeof apiContract.home;
type AssetRow = typeof assets.$inferSelect;
type PlanRow = typeof maintenancePlans.$inferSelect;
type LogRow = typeof maintenanceLogs.$inferSelect;
type ReadingRow = typeof meterReadings.$inferSelect;

function toAsset(a: AssetRow): HomeAssetDto {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    details: a.details,
    purchaseDate: a.purchaseDate,
    warrantyUntil: a.warrantyUntil,
    receiptFileIds: a.receiptFileIds,
    transactionId: a.transactionId,
    notes: a.notes,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  };
}

function recurrenceOf(r: MaintenanceRecurrenceJson): MaintenanceRecurrence {
  return r.mode === 'rrule'
    ? { mode: 'rrule', rrule: r.rrule ?? 'FREQ=YEARLY' }
    : { mode: 'interval', months: r.months ?? 12 };
}

function toPlan(p: PlanRow, today: string): MaintenancePlanDto {
  const stage = p.nextDueOn ? maintenanceReminderStage(p.nextDueOn, today, p.leadDays) : null;
  return {
    id: p.id,
    assetId: p.assetId,
    title: p.title,
    templateKey: p.templateKey,
    recurrence: recurrenceOf(p.recurrence),
    nextDueOn: p.nextDueOn,
    leadDays: p.leadDays,
    lastDoneOn: p.lastDoneOn,
    assigneeMemberId: p.assigneeMemberId,
    notes: p.notes,
    status: !p.nextDueOn ? 'ended' : stage === 'due' ? 'due' : stage === 'lead' ? 'upcoming' : 'ok',
    createdAt: iso(p.createdAt),
  };
}

function toLog(l: LogRow) {
  return {
    id: l.id,
    planId: l.planId,
    doneOn: l.doneOn,
    dueOn: l.dueOn,
    costMinor: l.costMinor,
    notes: l.notes,
    memberId: l.memberId,
    createdAt: iso(l.createdAt),
  };
}

function toReading(r: ReadingRow) {
  return {
    id: r.id,
    assetId: r.assetId,
    meterType: r.meterType,
    value: r.value,
    unit: r.unit,
    readAt: iso(r.readAt),
    note: r.note,
    createdAt: iso(r.createdAt),
  };
}

function validateRecurrence(r: MaintenanceRecurrence): void {
  try {
    validateMaintenanceRecurrence(r);
  } catch (e) {
    if (e instanceof RecurrenceError) throw badRequest(e.message, 'invalid_recurrence');
    throw e;
  }
}

const today = (ctx: HouseholdContext) => toLocalDate(new Date(), ctx.household.timezone);

@Injectable()
export class HomeService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadAsset(tx: Transaction, id: string): Promise<AssetRow> {
    const [a] = await tx.select().from(assets).where(eq(assets.id, id));
    if (!a) throw notFound('Asset');
    return a;
  }

  private async loadPlan(tx: Transaction, id: string): Promise<PlanRow> {
    const [p] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, id));
    if (!p) throw notFound('Maintenance plan');
    return p;
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

  // ------------------------------------------------------------------ assets

  async listAssets(
    ctx: HouseholdContext,
    input: In<C['assets']['list']>,
  ): Promise<Out<C['assets']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(assets)
        .where(input.query.kind ? eq(assets.kind, input.query.kind) : undefined)
        .orderBy(asc(assets.name));
      return rows.map(toAsset);
    });
  }

  async getAsset(
    ctx: HouseholdContext,
    input: In<C['assets']['get']>,
  ): Promise<Out<C['assets']['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      toAsset(await this.loadAsset(tx, input.params.assetId)),
    );
  }

  async createAsset(
    ctx: HouseholdContext,
    input: In<C['assets']['create']>,
  ): Promise<Out<C['assets']['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertFiles(tx, b.receiptFileIds);
      const [a] = await tx
        .insert(assets)
        .values({
          householdId: ctx.householdId,
          kind: b.kind,
          name: b.name,
          details: b.details,
          purchaseDate: b.purchaseDate ?? null,
          warrantyUntil: b.warrantyUntil ?? null,
          receiptFileIds: [...new Set(b.receiptFileIds)],
          transactionId: b.transactionId ?? null,
          notes: b.notes ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!a) throw new Error('insert failed');
      ev.changed('asset', a.id, 'created');
      return toAsset(a);
    });
  }

  async updateAsset(
    ctx: HouseholdContext,
    input: In<C['assets']['update']>,
  ): Promise<Out<C['assets']['update']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const existing = await this.loadAsset(tx, input.params.assetId);
      if (input.body.receiptFileIds) await this.assertFiles(tx, input.body.receiptFileIds);
      const [a] = await tx
        .update(assets)
        .set(input.body)
        .where(eq(assets.id, existing.id))
        .returning();
      if (!a) throw notFound('Asset');
      ev.changed('asset', a.id, 'updated');
      return toAsset(a);
    });
  }

  async removeAsset(
    ctx: HouseholdContext,
    input: In<C['assets']['remove']>,
  ): Promise<Out<C['assets']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.loadAsset(tx, input.params.assetId);
      await tx.delete(assets).where(eq(assets.id, a.id));
      ev.changed('asset', a.id, 'deleted');
      ev.audit('asset.deleted', 'asset', a.id, { name: a.name });
    });
    return OK;
  }

  async warranties(
    ctx: HouseholdContext,
    input: In<C['assets']['warranties']>,
  ): Promise<Out<C['assets']['warranties']>> {
    const from = today(ctx);
    const until = floatingToLocalDate(
      addFloating(localDateToFloating(from), input.query.days, 'day'),
    );
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(assets)
        .where(and(gte(assets.warrantyUntil, from), lte(assets.warrantyUntil, until)))
        .orderBy(asc(assets.warrantyUntil));
      return rows.map(toAsset);
    });
  }

  // ------------------------------------------------------------------ maintenance

  templates(): Out<C['maintenance']['templates']> {
    return MAINTENANCE_TEMPLATES.map((t) => ({ ...t, assetKinds: [...t.assetKinds] }));
  }

  async listPlans(
    ctx: HouseholdContext,
    input: In<C['maintenance']['list']>,
  ): Promise<Out<C['maintenance']['list']>> {
    const q = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(maintenancePlans)
        .where(
          and(
            q.assetId ? eq(maintenancePlans.assetId, q.assetId) : undefined,
            q.dueBefore ? lte(maintenancePlans.nextDueOn, q.dueBefore) : undefined,
          ),
        )
        .orderBy(asc(maintenancePlans.nextDueOn));
      const t = today(ctx);
      return rows.map((p) => toPlan(p, t));
    });
  }

  async createPlan(
    ctx: HouseholdContext,
    input: In<C['maintenance']['create']>,
  ): Promise<Out<C['maintenance']['create']>> {
    const b = input.body;
    const template = b.templateKey ? maintenanceTemplate(b.templateKey) : undefined;
    if (b.templateKey && !template) throw badRequest('Unknown template', 'unknown_template');
    const recurrence = b.recurrence ?? template?.recurrence;
    const title = b.title ?? template?.title;
    if (!recurrence || !title) throw badRequest('Title and recurrence are required');
    validateRecurrence(recurrence);
    const t = today(ctx);
    const nextDueOn = b.nextDueOn ?? initialMaintenanceDue(recurrence, t);
    if (!nextDueOn) throw badRequest('The schedule has no future date', 'invalid_recurrence');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.loadAsset(tx, b.assetId);
      await assertMembers(tx, [b.assigneeMemberId]);
      const [p] = await tx
        .insert(maintenancePlans)
        .values({
          householdId: ctx.householdId,
          assetId: b.assetId,
          title,
          templateKey: template?.key ?? null,
          recurrence,
          anchorOn: nextDueOn,
          nextDueOn,
          leadDays: b.leadDays ?? template?.leadDays ?? 14,
          assigneeMemberId: b.assigneeMemberId ?? null,
          notes: b.notes ?? null,
        })
        .returning();
      if (!p) throw new Error('insert failed');
      ev.changed('maintenance', p.id, 'created', p.assetId);
      return toPlan(p, t);
    });
  }

  async updatePlan(
    ctx: HouseholdContext,
    input: In<C['maintenance']['update']>,
  ): Promise<Out<C['maintenance']['update']>> {
    const b = input.body;
    if (b.recurrence) validateRecurrence(b.recurrence);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const existing = await this.loadPlan(tx, input.params.planId);
      await assertMembers(tx, [b.assigneeMemberId]);
      const patch: Partial<typeof maintenancePlans.$inferInsert> = { ...b };
      if (b.recurrence?.mode === 'rrule' && b.nextDueOn) patch.anchorOn = b.nextDueOn;
      const [p] = await tx
        .update(maintenancePlans)
        .set(patch)
        .where(eq(maintenancePlans.id, existing.id))
        .returning();
      if (!p) throw notFound('Maintenance plan');
      ev.changed('maintenance', p.id, 'updated', p.assetId);
      return toPlan(p, today(ctx));
    });
  }

  async removePlan(
    ctx: HouseholdContext,
    input: In<C['maintenance']['remove']>,
  ): Promise<Out<C['maintenance']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const p = await this.loadPlan(tx, input.params.planId);
      await tx.delete(maintenancePlans).where(eq(maintenancePlans.id, p.id));
      ev.changed('maintenance', p.id, 'deleted', p.assetId);
    });
    return OK;
  }

  async completePlan(
    ctx: HouseholdContext,
    input: In<C['maintenance']['complete']>,
  ): Promise<Out<C['maintenance']['complete']>> {
    const t = today(ctx);
    const doneOn = input.body.doneOn ?? t;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const p = await this.loadPlan(tx, input.params.planId);
      const next = nextMaintenanceDue(recurrenceOf(p.recurrence), {
        anchor: p.anchorOn,
        currentDue: p.nextDueOn ?? doneOn,
        doneOn,
      });
      const [log] = await tx
        .insert(maintenanceLogs)
        .values({
          householdId: ctx.householdId,
          planId: p.id,
          doneOn,
          dueOn: p.nextDueOn,
          costMinor: input.body.costMinor ?? null,
          notes: input.body.notes ?? null,
          memberId: ctx.member.id,
        })
        .returning();
      const [plan] = await tx
        .update(maintenancePlans)
        .set({ lastDoneOn: doneOn, nextDueOn: next })
        .where(eq(maintenancePlans.id, p.id))
        .returning();
      if (!log || !plan) throw new Error('update failed');
      ev.changed('maintenance', p.id, 'updated', p.assetId);
      ev.audit('maintenance.completed', 'maintenance', p.id, { doneOn, next });
      return { plan: toPlan(plan, t), log: toLog(log) };
    });
  }

  async logs(
    ctx: HouseholdContext,
    input: In<C['maintenance']['logs']>,
  ): Promise<Out<C['maintenance']['logs']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const p = await this.loadPlan(tx, input.params.planId);
      const rows = await tx
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.planId, p.id))
        .orderBy(desc(maintenanceLogs.doneOn));
      return rows.map(toLog);
    });
  }

  // ------------------------------------------------------------------ meters

  async listReadings(
    ctx: HouseholdContext,
    input: In<C['meters']['list']>,
  ): Promise<Out<C['meters']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const a = await this.loadAsset(tx, input.params.assetId);
      const rows = await tx
        .select()
        .from(meterReadings)
        .where(
          and(
            eq(meterReadings.assetId, a.id),
            input.query.meterType ? eq(meterReadings.meterType, input.query.meterType) : undefined,
          ),
        )
        .orderBy(desc(meterReadings.readAt));
      return rows.map(toReading);
    });
  }

  async createReading(
    ctx: HouseholdContext,
    input: In<C['meters']['create']>,
  ): Promise<Out<C['meters']['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const a = await this.loadAsset(tx, input.params.assetId);
      const [r] = await tx
        .insert(meterReadings)
        .values({
          householdId: ctx.householdId,
          assetId: a.id,
          meterType: b.meterType,
          value: b.value,
          unit: b.unit,
          readAt: b.readAt ? new Date(b.readAt) : new Date(),
          note: b.note ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!r) throw new Error('insert failed');
      ev.changed('meter_reading', r.id, 'created', a.id);
      return toReading(r);
    });
  }

  async removeReading(
    ctx: HouseholdContext,
    input: In<C['meters']['remove']>,
  ): Promise<Out<C['meters']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [r] = await tx
        .delete(meterReadings)
        .where(eq(meterReadings.id, input.params.readingId))
        .returning();
      if (!r) throw notFound('Meter reading');
      ev.changed('meter_reading', r.id, 'deleted', r.assetId);
    });
    return OK;
  }

  async consumption(
    ctx: HouseholdContext,
    input: In<C['meters']['consumption']>,
  ): Promise<Out<C['meters']['consumption']>> {
    const q = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const a = await this.loadAsset(tx, input.params.assetId);
      const rows = await tx
        .select()
        .from(meterReadings)
        .where(
          and(
            eq(meterReadings.assetId, a.id),
            eq(meterReadings.meterType, q.meterType),
            q.from ? gte(meterReadings.readAt, new Date(q.from)) : undefined,
            q.to ? lte(meterReadings.readAt, new Date(q.to)) : undefined,
          ),
        )
        .orderBy(asc(meterReadings.readAt));
      const stats = consumptionStats(
        rows.map((r) => ({ readAt: r.readAt, value: r.value })),
        { period: q.period, timeZone: ctx.household.timezone },
      );
      return {
        meterType: q.meterType,
        unit: rows[rows.length - 1]?.unit ?? null,
        ...stats,
        intervals: stats.intervals.map((i) => ({ ...i, from: iso(i.from), to: iso(i.to) })),
      };
    });
  }

  // ------------------------------------------------------------------ jobs

  /** Daily: reminders within the lead time and when a maintenance becomes due. */
  async maintenanceReminders(now = new Date()): Promise<number> {
    const horizon = floatingToLocalDate(
      addFloating(localDateToFloating(toLocalDate(now, 'UTC')), 366, 'day'),
    );
    const rows = await this.db.system
      .select({ plan: maintenancePlans, assetName: assets.name })
      .from(maintenancePlans)
      .innerJoin(assets, eq(assets.id, maintenancePlans.assetId))
      .where(and(isNotNull(maintenancePlans.nextDueOn), lte(maintenancePlans.nextDueOn, horizon)));
    const hh = await activeHouseholds(
      this.db,
      rows.map((r) => r.plan.householdId),
    );
    let sent = 0;
    for (const { plan, assetName } of rows) {
      const h = hh.get(plan.householdId);
      if (!h || !plan.nextDueOn) continue;
      const stage = maintenanceReminderStage(
        plan.nextDueOn,
        toLocalDate(now, h.timezone),
        plan.leadDays,
      );
      if (!stage) continue;
      if (!(await once(this.db, plan.householdId, `maint:${plan.id}:${plan.nextDueOn}:${stage}`)))
        continue;
      const recipients = plan.assigneeMemberId
        ? [plan.assigneeMemberId]
        : await adultMemberIds(this.db, plan.householdId);
      await this.notifications.notify({
        householdId: plan.householdId,
        memberIds: recipients,
        type: 'home.maintenance_due',
        message: 'notifications.maintenanceDue',
        vars: {
          name: assetName,
          task: plan.title,
          date: formatDate(`${plan.nextDueOn}T00:00:00Z`, 'de', 'UTC'),
        },
        link: `/home/maintenance/${plan.id}`,
      });
      sent++;
    }
    return sent;
  }
}
