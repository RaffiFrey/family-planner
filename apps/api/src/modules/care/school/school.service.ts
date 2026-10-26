import { Injectable, Logger } from '@nestjs/common';
import type { apiContract, TimetableEntry as TimetableEntryDto } from '@fp/contracts';
import { schoolHolidayCache, schoolSettings, timetableEntries, type Transaction } from '@fp/db';
import {
  abWeek,
  type GermanState,
  holidaysInRange,
  isGermanState,
  type SchoolHoliday,
  timetableForDate,
} from '@fp/domain/care';
import { and, asc, eq } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { Db } from '../../../infra/database.js';
import { loadMember } from '../shared.js';
import { HolidayFetcher } from './holiday-fetcher.js';

type C = typeof apiContract.school;
type EntryRow = typeof timetableEntries.$inferSelect;

/** Cached holiday lists are refreshed after this age (dates rarely change once published). */
const CACHE_MAX_AGE_MS = 30 * 86_400_000;
const MAX_YEARS = 3;

function toEntry(e: EntryRow): TimetableEntryDto {
  return {
    id: e.id,
    memberId: e.memberId,
    weekday: e.weekday,
    period: e.period,
    startTime: e.startTime,
    endTime: e.endTime,
    subject: e.subject,
    room: e.room,
    teacher: e.teacher,
    validFrom: e.validFrom,
    validTo: e.validTo,
    week: e.week,
    createdAt: iso(e.createdAt),
  };
}

@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);

  constructor(
    private readonly db: Db,
    private readonly fetcher: HolidayFetcher,
  ) {}

  // ------------------------------------------------------------------ holidays

  /** Holidays of one state and year from the cache, fetching when missing or stale. */
  private async holidaysForYear(state: GermanState, year: number): Promise<SchoolHoliday[] | null> {
    const [cached] = await this.db.system
      .select()
      .from(schoolHolidayCache)
      .where(and(eq(schoolHolidayCache.state, state), eq(schoolHolidayCache.year, year)));
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_MAX_AGE_MS)
      return cached.holidays;
    try {
      const { holidays, source } = await this.fetcher.fetch(state, year);
      await this.db.system
        .insert(schoolHolidayCache)
        .values({ state, year, holidays, source, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: [schoolHolidayCache.state, schoolHolidayCache.year],
          set: { holidays, source, fetchedAt: new Date() },
        });
      return holidays;
    } catch (e) {
      this.logger.warn(`School holidays ${state}/${String(year)}: ${(e as Error).message}`);
      return cached?.holidays ?? null;
    }
  }

  async holidaysBetween(
    state: GermanState,
    from: string,
    to: string,
  ): Promise<{ holidays: SchoolHoliday[]; complete: boolean }> {
    const first = Number(from.slice(0, 4));
    const last = Number(to.slice(0, 4));
    if (last - first + 1 > MAX_YEARS)
      throw badRequest(`At most ${String(MAX_YEARS)} years per request`, 'range_too_large');
    const all: SchoolHoliday[] = [];
    let complete = true;
    for (let y = first; y <= last; y++) {
      const list = await this.holidaysForYear(state, y);
      if (list) all.push(...list);
      else complete = false;
    }
    return { holidays: holidaysInRange(all, from, to), complete };
  }

  private async loadSettings(tx: Transaction) {
    const [s] = await tx.select().from(schoolSettings);
    return {
      state: s?.state && isGermanState(s.state) ? s.state : null,
      abWeekAnchor: s?.abWeekAnchor ?? null,
    };
  }

  async holidays(ctx: HouseholdContext, input: In<C['holidays']>): Promise<Out<C['holidays']>> {
    const settings = await this.db.tenant(actorOf(ctx), (tx) => this.loadSettings(tx));
    const state = input.query.state ?? settings.state;
    if (!state) throw badRequest('Set the Bundesland in the school settings', 'state_missing');
    const result = await this.holidaysBetween(state, input.query.from, input.query.to);
    return { state, ...result };
  }

  async settings(ctx: HouseholdContext): Promise<Out<C['settings']>> {
    return this.db.tenant(actorOf(ctx), (tx) => this.loadSettings(tx));
  }

  async updateSettings(
    ctx: HouseholdContext,
    input: In<C['updateSettings']>,
  ): Promise<Out<C['updateSettings']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx
        .insert(schoolSettings)
        .values({ householdId: ctx.householdId, ...input.body })
        .onConflictDoUpdate({ target: schoolSettings.householdId, set: input.body });
      ev.changed('timetable', null, 'updated');
      return this.loadSettings(tx);
    });
  }

  // ------------------------------------------------------------------ timetable

  async list(
    ctx: HouseholdContext,
    input: In<C['timetable']['list']>,
  ): Promise<Out<C['timetable']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(timetableEntries)
        .where(
          input.query.memberId ? eq(timetableEntries.memberId, input.query.memberId) : undefined,
        )
        .orderBy(asc(timetableEntries.weekday), asc(timetableEntries.period));
      return rows.map(toEntry);
    });
  }

  async day(
    ctx: HouseholdContext,
    input: In<C['timetable']['day']>,
  ): Promise<Out<C['timetable']['day']>> {
    const { memberId, date } = input.params;
    const { rows, settings } = await this.db.tenant(actorOf(ctx), async (tx) => {
      await loadMember(tx, memberId);
      return {
        rows: await tx
          .select()
          .from(timetableEntries)
          .where(eq(timetableEntries.memberId, memberId)),
        settings: await this.loadSettings(tx),
      };
    });
    const holidays = settings.state
      ? (await this.holidaysBetween(settings.state, date, date)).holidays
      : [];
    const holiday = holidays[0]?.name ?? null;
    return {
      date,
      week: settings.abWeekAnchor ? abWeek(date, settings.abWeekAnchor) : null,
      holiday,
      entries: timetableForDate(rows, date, {
        abAnchor: settings.abWeekAnchor,
        holidays,
      }).map(toEntry),
    };
  }

  async create(
    ctx: HouseholdContext,
    input: In<C['timetable']['create']>,
  ): Promise<Out<C['timetable']['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await loadMember(tx, b.memberId);
      const [e] = await tx
        .insert(timetableEntries)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          weekday: b.weekday,
          period: b.period,
          startTime: b.startTime,
          endTime: b.endTime,
          subject: b.subject,
          room: b.room ?? null,
          teacher: b.teacher ?? null,
          validFrom: b.validFrom ?? null,
          validTo: b.validTo ?? null,
          week: b.week ?? null,
        })
        .returning();
      if (!e) throw new Error('insert failed');
      ev.changed('timetable', e.id, 'created', e.memberId);
      return toEntry(e);
    });
  }

  async update(
    ctx: HouseholdContext,
    input: In<C['timetable']['update']>,
  ): Promise<Out<C['timetable']['update']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [existing] = await tx
        .select()
        .from(timetableEntries)
        .where(eq(timetableEntries.id, input.params.entryId));
      if (!existing) throw notFound('Timetable entry');
      const start = input.body.startTime ?? existing.startTime;
      const end = input.body.endTime ?? existing.endTime;
      if (start >= end) throw badRequest('Must end after start', 'invalid_time');
      const [e] = await tx
        .update(timetableEntries)
        .set(input.body)
        .where(eq(timetableEntries.id, existing.id))
        .returning();
      if (!e) throw notFound('Timetable entry');
      ev.changed('timetable', e.id, 'updated', e.memberId);
      return toEntry(e);
    });
  }

  async remove(
    ctx: HouseholdContext,
    input: In<C['timetable']['remove']>,
  ): Promise<Out<C['timetable']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [e] = await tx
        .delete(timetableEntries)
        .where(eq(timetableEntries.id, input.params.entryId))
        .returning();
      if (!e) throw notFound('Timetable entry');
      ev.changed('timetable', e.id, 'deleted', e.memberId);
    });
    return OK;
  }
}
