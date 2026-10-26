import { Inject, Injectable } from '@nestjs/common';
import type {
  apiContract,
  Calendar as CalendarDto,
  Event as EventDto,
  Occurrence,
} from '@fp/contracts';
import {
  calendars,
  calendarSubscriptions,
  eventExceptions,
  events,
  householdMembers,
  type Transaction,
} from '@fp/db';
import {
  expandOccurrences,
  isOccurrence,
  parseRecurrenceRule,
  RecurrenceError,
  type SeriesDefinition,
  seriesEnd,
  splitSeries,
} from '@fp/domain/recurrence';
import { isValidTimeZone } from '@fp/domain/time';
import { and, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../common/contract.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { ENV, type Env } from '../../config/env.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db, type UnitEvents } from '../../infra/database.js';

type C = typeof apiContract.calendar;
type CalendarRow = typeof calendars.$inferSelect;
type EventRow = typeof events.$inferSelect;
type ExceptionRow = typeof eventExceptions.$inferSelect;

const MAX_RANGE_DAYS = 400;

export function seriesOf(
  e: Pick<EventRow, 'startAt' | 'endAt' | 'timezone' | 'allDay' | 'rrule'>,
): SeriesDefinition {
  return { start: e.startAt, end: e.endAt, timeZone: e.timezone, allDay: e.allDay, rrule: e.rrule };
}

export function toEvent(e: EventRow): EventDto {
  return {
    id: e.id,
    calendarId: e.calendarId,
    title: e.title,
    description: e.description,
    location: e.location,
    start: iso(e.startAt),
    end: iso(e.endAt),
    allDay: e.allDay,
    timezone: e.timezone,
    rrule: e.rrule,
    attendeeMemberIds: e.attendeeMemberIds,
    reminders: e.reminders,
    color: e.color,
    createdByMemberId: e.createdByMemberId,
  };
}

/** Expands events into occurrences in [from, to), applying exceptions and per-occurrence overrides. */
export function expandEvents(
  rows: EventRow[],
  exceptions: ExceptionRow[],
  from: Date,
  to: Date,
): Occurrence[] {
  const byEvent = new Map<string, ExceptionRow[]>();
  for (const x of exceptions) byEvent.set(x.eventId, [...(byEvent.get(x.eventId) ?? []), x]);
  const out: Occurrence[] = [];
  for (const e of rows) {
    const exs = byEvent.get(e.id) ?? [];
    const overrides = new Map(exs.map((x) => [x.originalStart.getTime(), x.overrides]));
    const occ = expandOccurrences(
      seriesOf(e),
      { from, to },
      exs.map((x) => ({
        originalStart: x.originalStart,
        cancelled: x.cancelled,
        ...(x.startAt ? { start: x.startAt } : {}),
        ...(x.endAt ? { end: x.endAt } : {}),
      })),
    );
    for (const o of occ) {
      const ov = overrides.get(o.originalStart.getTime()) ?? null;
      out.push({
        ...toEvent(e),
        ...(ov?.title !== undefined ? { title: ov.title } : {}),
        ...(ov?.description !== undefined ? { description: ov.description } : {}),
        ...(ov?.location !== undefined ? { location: ov.location } : {}),
        eventId: e.id,
        start: iso(o.start),
        end: iso(o.end),
        originalStart: iso(o.originalStart),
        modified: o.modified,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async readOnlyIds(tx: Transaction): Promise<Set<string>> {
    const rows = await tx
      .select({ id: calendarSubscriptions.calendarId })
      .from(calendarSubscriptions);
    return new Set(rows.map((r) => r.id));
  }

  private toCalendar(c: CalendarRow, readOnly = false): CalendarDto {
    return {
      readOnly,
      id: c.id,
      name: c.name,
      color: c.color,
      visibility: c.visibility,
      ownerMemberId: c.ownerMemberId,
      sharedWith: c.sharedWith ?? null,
      icsUrl: c.icsToken ? `${this.env.API_PUBLIC_URL}/v1/ics/${c.icsToken}.ics` : null,
    };
  }

  private visibleCalendars(ctx: HouseholdContext) {
    return visibleTo(ctx.member.id, {
      visibility: calendars.visibility,
      owner: calendars.ownerMemberId,
      sharedWith: calendars.sharedWith,
    });
  }

  /** Events of subscribed (imported) calendars are owned by the feed and can't be edited. */
  private async assertWritable(tx: Transaction, calendarId: string): Promise<void> {
    const [sub] = await tx
      .select({ id: calendarSubscriptions.id })
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.calendarId, calendarId))
      .limit(1);
    if (sub) throw badRequest('This calendar is a read-only subscription', 'calendar_read_only');
  }

  private async loadCalendar(
    tx: Transaction,
    ctx: HouseholdContext,
    id: string,
    forWrite = false,
  ): Promise<CalendarRow> {
    const [c] = await tx
      .select()
      .from(calendars)
      .where(and(eq(calendars.id, id), this.visibleCalendars(ctx)));
    if (!c) throw notFound('Calendar');
    if (forWrite && c.visibility === 'private' && c.ownerMemberId !== ctx.member.id)
      throw forbidden();
    return c;
  }

  private canManageCalendar(ctx: HouseholdContext, c: CalendarRow): boolean {
    return c.ownerMemberId === ctx.member.id || ['owner', 'admin'].includes(ctx.member.role);
  }

  async listCalendars(ctx: HouseholdContext): Promise<Out<C['listCalendars']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(calendars)
        .where(this.visibleCalendars(ctx))
        .orderBy(calendars.createdAt);
      const readOnly = await this.readOnlyIds(tx);
      return rows.map((c) => this.toCalendar(c, readOnly.has(c.id)));
    });
  }

  async createCalendar(
    ctx: HouseholdContext,
    input: In<C['createCalendar']>,
  ): Promise<Out<C['createCalendar']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [c] = await tx
        .insert(calendars)
        .values({
          householdId: ctx.householdId,
          ...input.body,
          sharedWith: input.body.sharedWith ?? null,
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!c) throw new Error('insert failed');
      ev.changed('calendar', c.id, 'created');
      ev.audit('calendar.created', 'calendar', c.id, { name: c.name });
      return this.toCalendar(c);
    });
  }

  async updateCalendar(
    ctx: HouseholdContext,
    input: In<C['updateCalendar']>,
  ): Promise<Out<C['updateCalendar']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.loadCalendar(tx, ctx, input.params.calendarId);
      if (!this.canManageCalendar(ctx, c)) throw forbidden();
      const [row] = await tx
        .update(calendars)
        .set(input.body)
        .where(eq(calendars.id, c.id))
        .returning();
      if (!row) throw notFound('Calendar');
      ev.changed('calendar', row.id, 'updated');
      return this.toCalendar(row, (await this.readOnlyIds(tx)).has(row.id));
    });
  }

  async deleteCalendar(
    ctx: HouseholdContext,
    input: In<C['deleteCalendar']>,
  ): Promise<Out<C['deleteCalendar']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.loadCalendar(tx, ctx, input.params.calendarId);
      if (!this.canManageCalendar(ctx, c)) throw forbidden();
      await tx.delete(calendars).where(eq(calendars.id, c.id));
      ev.changed('calendar', c.id, 'deleted');
      ev.audit('calendar.deleted', 'calendar', c.id, { name: c.name });
    });
    return OK;
  }

  async rotateIcsToken(
    ctx: HouseholdContext,
    input: In<C['rotateIcsToken']>,
  ): Promise<Out<C['rotateIcsToken']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const c = await this.loadCalendar(tx, ctx, input.params.calendarId);
      if (!this.canManageCalendar(ctx, c)) throw forbidden();
      const [row] = await tx
        .update(calendars)
        .set({ icsToken: CryptoService.token(32) })
        .where(eq(calendars.id, c.id))
        .returning();
      if (!row) throw notFound('Calendar');
      ev.audit('calendar.ics_rotated', 'calendar', c.id);
      return this.toCalendar(row, (await this.readOnlyIds(tx)).has(row.id));
    });
  }

  async occurrences(
    ctx: HouseholdContext,
    input: In<C['occurrences']>,
  ): Promise<Out<C['occurrences']>> {
    const from = new Date(input.query.from);
    const to = new Date(input.query.to);
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000)
      throw badRequest('Range too large', 'range_too_large');
    const ids = input.query.calendarIds ? [input.query.calendarIds].flat() : null;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const visible = await tx
        .select({ id: calendars.id })
        .from(calendars)
        .where(this.visibleCalendars(ctx));
      const calIds = visible.map((c) => c.id).filter((id) => !ids || ids.includes(id));
      if (calIds.length === 0) return [];
      const rows = await tx
        .select()
        .from(events)
        .where(
          and(
            inArray(events.calendarId, calIds),
            isNull(events.deletedAt),
            lt(events.startAt, to),
            or(isNull(events.seriesEndAt), gte(events.seriesEndAt, from)),
          ),
        );
      const exs = rows.length
        ? await tx
            .select()
            .from(eventExceptions)
            .where(
              inArray(
                eventExceptions.eventId,
                rows.map((r) => r.id),
              ),
            )
        : [];
      return expandEvents(rows, exs, from, to);
    });
  }

  private async loadEvent(tx: Transaction, ctx: HouseholdContext, id: string): Promise<EventRow> {
    const [row] = await tx
      .select({ event: events })
      .from(events)
      .innerJoin(calendars, eq(calendars.id, events.calendarId))
      .where(and(eq(events.id, id), isNull(events.deletedAt), this.visibleCalendars(ctx)));
    if (!row) throw notFound('Event');
    return row.event;
  }

  async getEvent(ctx: HouseholdContext, input: In<C['getEvent']>): Promise<Out<C['getEvent']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      toEvent(await this.loadEvent(tx, ctx, input.params.eventId)),
    );
  }

  private validateSeries(s: SeriesDefinition): Date | null {
    if (!isValidTimeZone(s.timeZone)) throw badRequest('Unknown time zone', 'invalid_timezone');
    if (s.end < s.start) throw badRequest('end must not be before start');
    try {
      if (s.rrule) parseRecurrenceRule(s.rrule);
      return seriesEnd(s);
    } catch (e) {
      if (e instanceof RecurrenceError) throw badRequest(e.message, 'invalid_rrule');
      throw e;
    }
  }

  private async assertAttendees(tx: Transaction, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await tx
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(inArray(householdMembers.id, ids), isNull(householdMembers.removedAt)));
    if (found.length !== new Set(ids).size)
      throw badRequest('Unknown attendee', 'invalid_attendee');
  }

  private notifyAttendees(
    ev: UnitEvents,
    ctx: HouseholdContext,
    e: EventRow,
    previous: string[] = [],
  ): void {
    const added = e.attendeeMemberIds.filter(
      (id) => id !== ctx.member.id && !previous.includes(id),
    );
    if (added.length > 0)
      ev.emit('event.invited', {
        eventId: e.id,
        title: e.title,
        start: iso(e.startAt),
        memberIds: added,
      });
  }

  async createEvent(
    ctx: HouseholdContext,
    input: In<C['createEvent']>,
  ): Promise<Out<C['createEvent']>> {
    const b = input.body;
    const series: SeriesDefinition = {
      start: new Date(b.start),
      end: new Date(b.end),
      timeZone: b.timezone,
      allDay: b.allDay,
      rrule: b.rrule ?? null,
    };
    const end = this.validateSeries(series);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.loadCalendar(tx, ctx, b.calendarId, true);
      await this.assertWritable(tx, b.calendarId);
      await this.assertAttendees(tx, b.attendeeMemberIds);
      const [row] = await tx
        .insert(events)
        .values({
          householdId: ctx.householdId,
          calendarId: b.calendarId,
          title: b.title,
          description: b.description ?? null,
          location: b.location ?? null,
          startAt: series.start,
          endAt: series.end,
          allDay: b.allDay,
          timezone: b.timezone,
          rrule: series.rrule ?? null,
          seriesEndAt: end,
          attendeeMemberIds: b.attendeeMemberIds,
          reminders: b.reminders,
          color: b.color ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('event', row.id, 'created', row.calendarId);
      ev.audit('event.created', 'event', row.id, { title: row.title });
      this.notifyAttendees(ev, ctx, row);
      return toEvent(row);
    });
  }

  async updateEvent(
    ctx: HouseholdContext,
    input: In<C['updateEvent']>,
  ): Promise<Out<C['updateEvent']>> {
    const { scope, occurrenceStart, ...changes } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadEvent(tx, ctx, input.params.eventId);
      await this.assertWritable(tx, current.calendarId);
      if (changes.calendarId && changes.calendarId !== current.calendarId) {
        await this.loadCalendar(tx, ctx, changes.calendarId, true);
        await this.assertWritable(tx, changes.calendarId);
      }
      if (changes.attendeeMemberIds) await this.assertAttendees(tx, changes.attendeeMemberIds);
      const effectiveScope = current.rrule ? scope : 'all';

      if (effectiveScope === 'this') {
        const at = this.requireOccurrence(current, occurrenceStart);
        const duration = current.endAt.getTime() - current.startAt.getTime();
        const start = changes.start ? new Date(changes.start) : at;
        const end = changes.end ? new Date(changes.end) : new Date(start.getTime() + duration);
        if (end < start) throw badRequest('end must not be before start');
        const overrides = {
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.description !== undefined ? { description: changes.description } : {}),
          ...(changes.location !== undefined ? { location: changes.location } : {}),
        };
        await tx
          .insert(eventExceptions)
          .values({
            householdId: ctx.householdId,
            eventId: current.id,
            originalStart: at,
            cancelled: false,
            startAt: start,
            endAt: end,
            overrides,
          })
          .onConflictDoUpdate({
            target: [eventExceptions.eventId, eventExceptions.originalStart],
            set: { cancelled: false, startAt: start, endAt: end, overrides },
          });
        ev.changed('event', current.id, 'updated', current.calendarId);
        ev.audit('event.occurrence_updated', 'event', current.id, { occurrenceStart: iso(at) });
        return toEvent(current);
      }

      if (effectiveScope === 'following') {
        const at = this.requireOccurrence(current, occurrenceStart);
        const split = splitSeries(seriesOf(current), at);
        if (split.headRrule !== null) {
          const head = { ...seriesOf(current), rrule: split.headRrule };
          await tx
            .update(events)
            .set({ rrule: split.headRrule, seriesEndAt: seriesEnd(head) })
            .where(eq(events.id, current.id));
          await tx
            .delete(eventExceptions)
            .where(
              and(eq(eventExceptions.eventId, current.id), gte(eventExceptions.originalStart, at)),
            );
          const duration = current.endAt.getTime() - current.startAt.getTime();
          const start = changes.start ? new Date(changes.start) : at;
          const end = changes.end ? new Date(changes.end) : new Date(start.getTime() + duration);
          const tail: SeriesDefinition = {
            start,
            end,
            timeZone: changes.timezone ?? current.timezone,
            allDay: changes.allDay ?? current.allDay,
            rrule: changes.rrule !== undefined ? changes.rrule : split.tailRrule,
          };
          const tailEnd = this.validateSeries(tail);
          const [row] = await tx
            .insert(events)
            .values({
              householdId: ctx.householdId,
              calendarId: changes.calendarId ?? current.calendarId,
              title: changes.title ?? current.title,
              description:
                changes.description !== undefined ? changes.description : current.description,
              location: changes.location !== undefined ? changes.location : current.location,
              startAt: tail.start,
              endAt: tail.end,
              allDay: tail.allDay,
              timezone: tail.timeZone,
              rrule: tail.rrule ?? null,
              seriesEndAt: tailEnd,
              attendeeMemberIds: changes.attendeeMemberIds ?? current.attendeeMemberIds,
              reminders: changes.reminders ?? current.reminders,
              color: changes.color !== undefined ? changes.color : current.color,
              createdByMemberId: ctx.member.id,
            })
            .returning();
          if (!row) throw new Error('insert failed');
          ev.changed('event', current.id, 'updated', current.calendarId);
          ev.changed('event', row.id, 'created', row.calendarId);
          ev.audit('event.split', 'event', current.id, { newEventId: row.id, at: iso(at) });
          return toEvent(row);
        }
        // Splitting at the first occurrence is the same as editing all.
      }

      const next: SeriesDefinition = {
        start: changes.start ? new Date(changes.start) : current.startAt,
        end: changes.end ? new Date(changes.end) : current.endAt,
        timeZone: changes.timezone ?? current.timezone,
        allDay: changes.allDay ?? current.allDay,
        rrule: changes.rrule !== undefined ? changes.rrule : current.rrule,
      };
      const end = this.validateSeries(next);
      const timingChanged =
        next.start.getTime() !== current.startAt.getTime() ||
        next.rrule !== current.rrule ||
        next.timeZone !== current.timezone;
      if (timingChanged)
        await tx.delete(eventExceptions).where(eq(eventExceptions.eventId, current.id));
      const [row] = await tx
        .update(events)
        .set({
          ...(changes.calendarId ? { calendarId: changes.calendarId } : {}),
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.description !== undefined ? { description: changes.description } : {}),
          ...(changes.location !== undefined ? { location: changes.location } : {}),
          ...(changes.attendeeMemberIds ? { attendeeMemberIds: changes.attendeeMemberIds } : {}),
          ...(changes.reminders ? { reminders: changes.reminders } : {}),
          ...(changes.color !== undefined ? { color: changes.color } : {}),
          startAt: next.start,
          endAt: next.end,
          allDay: next.allDay,
          timezone: next.timeZone,
          rrule: next.rrule ?? null,
          seriesEndAt: end,
        })
        .where(eq(events.id, current.id))
        .returning();
      if (!row) throw notFound('Event');
      ev.changed('event', row.id, 'updated', row.calendarId);
      ev.audit('event.updated', 'event', row.id, { title: row.title });
      this.notifyAttendees(ev, ctx, row, current.attendeeMemberIds);
      return toEvent(row);
    });
  }

  private requireOccurrence(e: EventRow, occurrenceStart: string | undefined): Date {
    if (!occurrenceStart)
      throw badRequest('occurrenceStart is required for this scope', 'occurrence_required');
    const at = new Date(occurrenceStart);
    if (!isOccurrence(seriesOf(e), at))
      throw badRequest('occurrenceStart is not an occurrence of this event', 'invalid_occurrence');
    return at;
  }

  async deleteEvent(
    ctx: HouseholdContext,
    input: In<C['deleteEvent']>,
  ): Promise<Out<C['deleteEvent']>> {
    const { scope, occurrenceStart } = input.query;
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadEvent(tx, ctx, input.params.eventId);
      await this.assertWritable(tx, current.calendarId);
      const effective = current.rrule ? scope : 'all';
      if (effective === 'this') {
        const at = this.requireOccurrence(current, occurrenceStart);
        await tx
          .insert(eventExceptions)
          .values({
            householdId: ctx.householdId,
            eventId: current.id,
            originalStart: at,
            cancelled: true,
          })
          .onConflictDoUpdate({
            target: [eventExceptions.eventId, eventExceptions.originalStart],
            set: { cancelled: true },
          });
      } else if (effective === 'following') {
        const at = this.requireOccurrence(current, occurrenceStart);
        const split = splitSeries(seriesOf(current), at);
        if (split.headRrule === null) {
          await tx.update(events).set({ deletedAt: new Date() }).where(eq(events.id, current.id));
        } else {
          const head = { ...seriesOf(current), rrule: split.headRrule };
          await tx
            .update(events)
            .set({ rrule: split.headRrule, seriesEndAt: seriesEnd(head) })
            .where(eq(events.id, current.id));
          await tx
            .delete(eventExceptions)
            .where(
              and(eq(eventExceptions.eventId, current.id), gte(eventExceptions.originalStart, at)),
            );
        }
      } else {
        await tx.update(events).set({ deletedAt: new Date() }).where(eq(events.id, current.id));
      }
      ev.changed(
        'event',
        current.id,
        effective === 'all' ? 'deleted' : 'updated',
        current.calendarId,
      );
      ev.audit(`event.deleted.${effective}`, 'event', current.id, { title: current.title });
    });
    return OK;
  }
}
