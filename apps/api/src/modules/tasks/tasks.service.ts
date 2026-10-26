import { Injectable } from '@nestjs/common';
import type { apiContract, Task as TaskDto, TaskRecurrence } from '@fp/contracts';
import { householdMembers, type TaskRecurrenceJson, tasks, type Transaction } from '@fp/db';
import {
  computeStreak,
  nextAssignee,
  nextDueDate,
  RecurrenceError,
  validateTaskRecurrence,
} from '@fp/domain/recurrence';
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { Db, type UnitEvents } from '../../infra/database.js';

type C = typeof apiContract.tasks;
type TaskRow = typeof tasks.$inferSelect;

function toRecurrence(r: TaskRecurrenceJson | null): TaskRecurrence | null {
  if (!r) return null;
  if (r.mode === 'fixed') return { mode: 'fixed', rrule: r.rrule ?? '' };
  return { mode: 'floating', interval: r.interval ?? 1, unit: r.unit ?? 'day' };
}

function toTask(t: TaskRow, streak = 0): TaskDto {
  return {
    id: t.id,
    seriesId: t.seriesId,
    title: t.title,
    notes: t.notes,
    assigneeMemberId: t.assigneeMemberId,
    dueAt: isoOrNull(t.dueAt),
    priority: t.priority,
    recurrence: toRecurrence(t.recurrence),
    rotationMemberIds: t.rotationMemberIds,
    points: t.points,
    checklist: t.checklist,
    status: t.status,
    completedAt: isoOrNull(t.completedAt),
    completedByMemberId: t.completedByMemberId,
    streak,
    visibility: t.visibility,
    createdByMemberId: t.createdByMemberId,
    createdAt: iso(t.createdAt),
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly db: Db) {}

  private visible(ctx: HouseholdContext) {
    return and(
      isNull(tasks.deletedAt),
      visibleTo(ctx.member.id, { visibility: tasks.visibility, owner: tasks.createdByMemberId }),
    );
  }

  private async load(tx: Transaction, ctx: HouseholdContext, id: string): Promise<TaskRow> {
    const [t] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), this.visible(ctx)));
    if (!t) throw notFound('Task');
    return t;
  }

  /** Streak per series, computed from the recent instance history. */
  private async streaks(
    tx: Transaction,
    rows: TaskRow[],
    timeZone: string,
  ): Promise<Map<string, number>> {
    const seriesIds = [...new Set(rows.filter((r) => r.recurrence).map((r) => r.seriesId))];
    const result = new Map<string, number>();
    if (seriesIds.length === 0) return result;
    const history = await tx
      .select({
        seriesId: tasks.seriesId,
        dueAt: tasks.dueAt,
        completedAt: tasks.completedAt,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(inArray(tasks.seriesId, seriesIds), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.dueAt))
      .limit(seriesIds.length * 60);
    const now = new Date();
    for (const id of seriesIds) {
      const items = history
        .filter((h) => h.seriesId === id && h.dueAt)
        .map((h) => ({
          dueAt: h.dueAt as Date,
          completedAt: h.completedAt,
          skipped: h.status === 'skipped',
        }));
      result.set(id, computeStreak(items, timeZone, now));
    }
    return result;
  }

  private async withStreaks(
    tx: Transaction,
    ctx: HouseholdContext,
    rows: TaskRow[],
  ): Promise<TaskDto[]> {
    const streaks = await this.streaks(tx, rows, ctx.household.timezone);
    return rows.map((r) => toTask(r, streaks.get(r.seriesId) ?? 0));
  }

  private async assertMembers(tx: Transaction, ids: (string | null | undefined)[]): Promise<void> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return;
    const found = await tx
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(inArray(householdMembers.id, unique), isNull(householdMembers.removedAt)));
    if (found.length !== unique.length) throw badRequest('Unknown member', 'invalid_member');
  }

  private validateRecurrence(r: TaskRecurrence | null | undefined): void {
    if (!r) return;
    try {
      validateTaskRecurrence(r);
    } catch (e) {
      if (e instanceof RecurrenceError) throw badRequest(e.message, 'invalid_recurrence');
      throw e;
    }
  }

  private notifyAssignee(ev: UnitEvents, ctx: HouseholdContext, t: TaskRow): void {
    if (t.assigneeMemberId && t.assigneeMemberId !== ctx.member.id) {
      ev.emit('task.assigned', {
        taskId: t.id,
        title: t.title,
        assigneeMemberId: t.assigneeMemberId,
        dueAt: isoOrNull(t.dueAt),
      });
    }
  }

  async list(ctx: HouseholdContext, input: In<C['list']>): Promise<Out<C['list']>> {
    const q = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(tasks)
        .where(
          and(
            this.visible(ctx),
            q.status === 'open'
              ? eq(tasks.status, 'open')
              : q.status === 'done'
                ? ne(tasks.status, 'open')
                : undefined,
            q.assigneeMemberId ? eq(tasks.assigneeMemberId, q.assigneeMemberId) : undefined,
            q.dueBefore ? lte(tasks.dueAt, new Date(q.dueBefore)) : undefined,
          ),
        )
        .orderBy(
          q.status === 'open' ? sql`${tasks.dueAt} asc nulls last` : desc(tasks.completedAt),
          asc(tasks.createdAt),
        )
        .limit(500);
      return this.withStreaks(tx, ctx, rows);
    });
  }

  async get(ctx: HouseholdContext, input: In<C['get']>): Promise<Out<C['get']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [dto] = await this.withStreaks(tx, ctx, [
        await this.load(tx, ctx, input.params.taskId),
      ]);
      return dto as TaskDto;
    });
  }

  async create(ctx: HouseholdContext, input: In<C['create']>): Promise<Out<C['create']>> {
    const b = input.body;
    this.validateRecurrence(b.recurrence);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertMembers(tx, [b.assigneeMemberId, ...b.rotationMemberIds]);
      const id = uuidv7();
      const due = b.dueAt ? new Date(b.dueAt) : null;
      const [row] = await tx
        .insert(tasks)
        .values({
          id,
          householdId: ctx.householdId,
          seriesId: id,
          title: b.title,
          notes: b.notes ?? null,
          assigneeMemberId: b.assigneeMemberId ?? b.rotationMemberIds[0] ?? null,
          dueAt: due,
          anchorAt: due,
          priority: b.priority,
          recurrence: b.recurrence ?? null,
          rotationMemberIds: b.rotationMemberIds,
          points: b.points,
          checklist: b.checklist.map((c) => ({ id: uuidv7(), text: c.text, done: c.done })),
          visibility: b.visibility,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('task', row.id, 'created');
      ev.audit('task.created', 'task', row.id, { title: row.title });
      this.notifyAssignee(ev, ctx, row);
      return toTask(row);
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    const b = input.body;
    this.validateRecurrence(b.recurrence);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, ctx, input.params.taskId);
      if (ctx.member.role === 'child' && current.createdByMemberId !== ctx.member.id)
        throw forbidden();
      await this.assertMembers(tx, [b.assigneeMemberId, ...(b.rotationMemberIds ?? [])]);
      const recurrence =
        b.recurrence !== undefined ? b.recurrence : toRecurrence(current.recurrence);
      const dueAt = b.dueAt !== undefined ? b.dueAt : isoOrNull(current.dueAt);
      if (recurrence && !dueAt) throw badRequest('Recurring tasks need a due date', 'due_required');
      const [row] = await tx
        .update(tasks)
        .set({
          ...(b.title !== undefined ? { title: b.title } : {}),
          ...(b.notes !== undefined ? { notes: b.notes } : {}),
          ...(b.assigneeMemberId !== undefined ? { assigneeMemberId: b.assigneeMemberId } : {}),
          ...(b.dueAt !== undefined ? { dueAt: b.dueAt ? new Date(b.dueAt) : null } : {}),
          ...(b.priority !== undefined ? { priority: b.priority } : {}),
          ...(b.recurrence !== undefined
            ? { recurrence: b.recurrence, anchorAt: dueAt ? new Date(dueAt) : null }
            : {}),
          ...(b.rotationMemberIds !== undefined ? { rotationMemberIds: b.rotationMemberIds } : {}),
          ...(b.points !== undefined ? { points: b.points } : {}),
          ...(b.checklist !== undefined
            ? { checklist: b.checklist.map((c) => ({ id: uuidv7(), text: c.text, done: c.done })) }
            : {}),
          ...(b.visibility !== undefined ? { visibility: b.visibility } : {}),
        })
        .where(eq(tasks.id, current.id))
        .returning();
      if (!row) throw notFound('Task');
      ev.changed('task', row.id, 'updated');
      ev.audit('task.updated', 'task', row.id, { title: row.title });
      if (row.assigneeMemberId !== current.assigneeMemberId) this.notifyAssignee(ev, ctx, row);
      return toTask(row);
    });
  }

  async remove(ctx: HouseholdContext, input: In<C['remove']>): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, ctx, input.params.taskId);
      if (ctx.member.role === 'child' && current.createdByMemberId !== ctx.member.id)
        throw forbidden();
      await tx
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(and(eq(tasks.seriesId, current.seriesId), eq(tasks.status, 'open')));
      if (current.status !== 'open')
        await tx.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, current.id));
      ev.changed('task', current.id, 'deleted');
      ev.audit('task.deleted', 'task', current.id, { title: current.title });
    });
    return OK;
  }

  async complete(ctx: HouseholdContext, input: In<C['complete']>): Promise<Out<C['complete']>> {
    const completedAt = input.body.completedAt ? new Date(input.body.completedAt) : new Date();
    if (completedAt.getTime() > Date.now() + 60_000)
      throw badRequest('completedAt cannot be in the future');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, ctx, input.params.taskId);
      if (current.status !== 'open')
        throw conflict('Task is already completed', 'already_completed');
      const status = input.body.skip ? 'skipped' : 'done';
      const [done] = await tx
        .update(tasks)
        .set({ status, completedAt, completedByMemberId: ctx.member.id })
        .where(and(eq(tasks.id, current.id), eq(tasks.status, 'open')))
        .returning();
      if (!done) throw conflict('Task is already completed', 'already_completed');

      let next: TaskRow | null = null;
      const recurrence = toRecurrence(current.recurrence);
      if (recurrence && current.dueAt) {
        const due = nextDueDate({
          recurrence,
          timeZone: ctx.household.timezone,
          anchor: current.anchorAt ?? current.dueAt,
          currentDue: current.dueAt,
          completedAt: input.body.skip ? current.dueAt : completedAt,
        });
        if (due) {
          const assignee =
            current.rotationMemberIds.length > 0
              ? nextAssignee(current.rotationMemberIds, current.assigneeMemberId)
              : current.assigneeMemberId;
          [next = null] = await tx
            .insert(tasks)
            .values({
              householdId: ctx.householdId,
              seriesId: current.seriesId,
              title: current.title,
              notes: current.notes,
              assigneeMemberId: assignee,
              dueAt: due,
              anchorAt: current.anchorAt,
              priority: current.priority,
              recurrence: current.recurrence,
              rotationMemberIds: current.rotationMemberIds,
              points: current.points,
              checklist: current.checklist.map((c) => ({ ...c, done: false })),
              visibility: current.visibility,
              createdByMemberId: current.createdByMemberId,
            })
            .returning();
          if (next) {
            ev.changed('task', next.id, 'created');
            this.notifyAssignee(ev, ctx, next);
          }
        }
      }
      ev.changed('task', done.id, 'updated');
      ev.audit(status === 'done' ? 'task.completed' : 'task.skipped', 'task', done.id, {
        title: done.title,
      });
      if (status === 'done')
        ev.emit('task.completed', {
          taskId: done.id,
          points: done.points,
          memberId: ctx.member.id,
        });
      const dtos = await this.withStreaks(tx, ctx, next ? [done, next] : [done]);
      return { completed: dtos[0] as TaskDto, next: next ? (dtos[1] as TaskDto) : null };
    });
  }

  async reopen(ctx: HouseholdContext, input: In<C['reopen']>): Promise<Out<C['reopen']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, ctx, input.params.taskId);
      if (current.status === 'open') return toTask(current);
      // Undo: drop the follow-up instance created by the completion, if it is still untouched.
      const removed = await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.seriesId, current.seriesId),
            eq(tasks.status, 'open'),
            sql`${tasks.id} <> ${current.id}`,
          ),
        )
        .returning({ id: tasks.id });
      for (const r of removed) ev.changed('task', r.id, 'deleted');
      const [row] = await tx
        .update(tasks)
        .set({ status: 'open', completedAt: null, completedByMemberId: null })
        .where(eq(tasks.id, current.id))
        .returning();
      if (!row) throw notFound('Task');
      ev.changed('task', row.id, 'updated');
      ev.audit('task.reopened', 'task', row.id, { title: row.title });
      return toTask(row);
    });
  }

  async toggleChecklistItem(
    ctx: HouseholdContext,
    input: In<C['toggleChecklistItem']>,
  ): Promise<Out<C['toggleChecklistItem']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, ctx, input.params.taskId);
      if (!current.checklist.some((c) => c.id === input.params.itemId))
        throw notFound('Checklist item');
      const checklist = current.checklist.map((c) =>
        c.id === input.params.itemId ? { ...c, done: input.body.done } : c,
      );
      const [row] = await tx
        .update(tasks)
        .set({ checklist })
        .where(eq(tasks.id, current.id))
        .returning();
      if (!row) throw notFound('Task');
      ev.changed('task', row.id, 'updated');
      return toTask(row);
    });
  }
}
