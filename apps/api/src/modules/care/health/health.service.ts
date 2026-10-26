import { Injectable } from '@nestjs/common';
import type {
  apiContract,
  Medication as MedicationDto,
  Vaccination as VaccinationDto,
} from '@fp/contracts';
import {
  checkupRecords,
  contacts,
  householdMembers,
  medications,
  type Transaction,
  vaccinations,
} from '@fp/db';
import {
  type CheckupCode,
  checkupReminderStage,
  checkupWindows,
  medicationOccurrences,
  type MedicationSchedule,
  validateMedicationSchedule,
} from '@fp/domain/care';
import { RecurrenceError } from '@fp/domain/recurrence';
import {
  addFloating,
  floatingToLocalDate,
  isValidTimeZone,
  localDateToFloating,
  toLocalDate,
} from '@fp/domain/time';
import { formatDate } from '@fp/i18n';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { Db } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { activeHouseholds, adultMemberIds, loadMember, once } from '../shared.js';

type C = typeof apiContract.health;
type VaccinationRow = typeof vaccinations.$inferSelect;
type MedicationRow = typeof medications.$inferSelect;

const DAY_MS = 86_400_000;
const MAX_SCHEDULE_RANGE_MS = 93 * DAY_MS;
/** Medication reminders fire for intakes in the last few minutes (job runs every minute). */
const MEDICATION_WINDOW_MS = 10 * 60_000;

function toVaccination(v: VaccinationRow): VaccinationDto {
  return {
    id: v.id,
    memberId: v.memberId,
    vaccine: v.vaccine,
    givenOn: v.givenOn,
    dose: v.dose,
    nextDueOn: v.nextDueOn,
    doctorContactId: v.doctorContactId,
    batch: v.batch,
    notes: v.notes,
    createdAt: iso(v.createdAt),
  };
}

function schedule(m: MedicationRow): MedicationSchedule {
  return {
    times: m.times,
    rrule: m.rrule,
    startDate: m.startOn,
    endDate: m.endOn,
    timeZone: m.timezone,
  };
}

function toMedication(m: MedicationRow, now = new Date()): MedicationDto {
  const next = medicationOccurrences(schedule(m), {
    from: now,
    to: new Date(now.getTime() + 400 * DAY_MS),
  })[0];
  return {
    id: m.id,
    memberId: m.memberId,
    name: m.name,
    dose: m.dose,
    times: m.times,
    rrule: m.rrule,
    timezone: m.timezone,
    startOn: m.startOn,
    endOn: m.endOn,
    reminders: m.reminders,
    notes: m.notes,
    nextAt: isoOrNull(next?.at),
    createdAt: iso(m.createdAt),
  };
}

function validateSchedule(s: MedicationSchedule): void {
  if (!isValidTimeZone(s.timeZone)) throw badRequest('Unknown time zone', 'invalid_timezone');
  try {
    validateMedicationSchedule(s);
  } catch (e) {
    if (e instanceof RecurrenceError) throw badRequest(e.message, 'invalid_schedule');
    throw e;
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertDoctor(tx: Transaction, id: string | null | undefined): Promise<void> {
    if (!id) return;
    const [c] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, id));
    if (!c) throw badRequest('Unknown contact', 'unknown_contact');
  }

  // ------------------------------------------------------------------ vaccinations

  async listVaccinations(
    ctx: HouseholdContext,
    input: In<C['vaccinations']['list']>,
  ): Promise<Out<C['vaccinations']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(vaccinations)
        .where(input.query.memberId ? eq(vaccinations.memberId, input.query.memberId) : undefined)
        .orderBy(desc(vaccinations.givenOn));
      return rows.map(toVaccination);
    });
  }

  async createVaccination(
    ctx: HouseholdContext,
    input: In<C['vaccinations']['create']>,
  ): Promise<Out<C['vaccinations']['create']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await loadMember(tx, b.memberId);
      await this.assertDoctor(tx, b.doctorContactId);
      const [v] = await tx
        .insert(vaccinations)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          vaccine: b.vaccine,
          givenOn: b.givenOn,
          dose: b.dose ?? null,
          nextDueOn: b.nextDueOn ?? null,
          doctorContactId: b.doctorContactId ?? null,
          batch: b.batch ?? null,
          notes: b.notes ?? null,
        })
        .returning();
      if (!v) throw new Error('insert failed');
      ev.changed('health_record', v.id, 'created', v.memberId);
      return toVaccination(v);
    });
  }

  async updateVaccination(
    ctx: HouseholdContext,
    input: In<C['vaccinations']['update']>,
  ): Promise<Out<C['vaccinations']['update']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertDoctor(tx, input.body.doctorContactId);
      const [v] = await tx
        .update(vaccinations)
        .set(input.body)
        .where(eq(vaccinations.id, input.params.vaccinationId))
        .returning();
      if (!v) throw notFound('Vaccination');
      ev.changed('health_record', v.id, 'updated', v.memberId);
      return toVaccination(v);
    });
  }

  async removeVaccination(
    ctx: HouseholdContext,
    input: In<C['vaccinations']['remove']>,
  ): Promise<Out<C['vaccinations']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [v] = await tx
        .delete(vaccinations)
        .where(eq(vaccinations.id, input.params.vaccinationId))
        .returning();
      if (!v) throw notFound('Vaccination');
      ev.changed('health_record', v.id, 'deleted', v.memberId);
    });
    return OK;
  }

  // ------------------------------------------------------------------ medications

  async listMedications(
    ctx: HouseholdContext,
    input: In<C['medications']['list']>,
  ): Promise<Out<C['medications']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(medications)
        .where(input.query.memberId ? eq(medications.memberId, input.query.memberId) : undefined)
        .orderBy(asc(medications.name));
      const now = new Date();
      return rows.map((m) => toMedication(m, now));
    });
  }

  async createMedication(
    ctx: HouseholdContext,
    input: In<C['medications']['create']>,
  ): Promise<Out<C['medications']['create']>> {
    const b = input.body;
    const timeZone = b.timezone ?? ctx.household.timezone;
    const times = [...new Set(b.times)].sort();
    validateSchedule({
      times,
      rrule: b.rrule,
      startDate: b.startOn,
      endDate: b.endOn ?? null,
      timeZone,
    });
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await loadMember(tx, b.memberId);
      const [m] = await tx
        .insert(medications)
        .values({
          householdId: ctx.householdId,
          memberId: b.memberId,
          name: b.name,
          dose: b.dose ?? null,
          times,
          rrule: b.rrule,
          timezone: timeZone,
          startOn: b.startOn,
          endOn: b.endOn ?? null,
          reminders: b.reminders,
          notes: b.notes ?? null,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!m) throw new Error('insert failed');
      ev.changed('medication', m.id, 'created', m.memberId);
      return toMedication(m);
    });
  }

  async updateMedication(
    ctx: HouseholdContext,
    input: In<C['medications']['update']>,
  ): Promise<Out<C['medications']['update']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [existing] = await tx
        .select()
        .from(medications)
        .where(eq(medications.id, input.params.medicationId));
      if (!existing) throw notFound('Medication');
      const times = b.times ? [...new Set(b.times)].sort() : existing.times;
      validateSchedule({
        times,
        rrule: b.rrule ?? existing.rrule,
        startDate: b.startOn ?? existing.startOn,
        endDate: b.endOn !== undefined ? b.endOn : existing.endOn,
        timeZone: b.timezone ?? existing.timezone,
      });
      const [m] = await tx
        .update(medications)
        .set({ ...b, times })
        .where(eq(medications.id, existing.id))
        .returning();
      if (!m) throw notFound('Medication');
      ev.changed('medication', m.id, 'updated', m.memberId);
      return toMedication(m);
    });
  }

  async removeMedication(
    ctx: HouseholdContext,
    input: In<C['medications']['remove']>,
  ): Promise<Out<C['medications']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [m] = await tx
        .delete(medications)
        .where(eq(medications.id, input.params.medicationId))
        .returning();
      if (!m) throw notFound('Medication');
      ev.changed('medication', m.id, 'deleted', m.memberId);
    });
    return OK;
  }

  async medicationSchedule(
    ctx: HouseholdContext,
    input: In<C['medications']['schedule']>,
  ): Promise<Out<C['medications']['schedule']>> {
    const from = new Date(input.query.from);
    const to = new Date(input.query.to);
    if (to <= from || to.getTime() - from.getTime() > MAX_SCHEDULE_RANGE_MS)
      throw badRequest('Range must be positive and at most 93 days', 'invalid_range');
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const [m] = await tx
        .select()
        .from(medications)
        .where(eq(medications.id, input.params.medicationId));
      if (!m) throw notFound('Medication');
      return medicationOccurrences(schedule(m), { from, to }).map((o) => ({
        at: iso(o.at),
        time: o.time,
      }));
    });
  }

  // ------------------------------------------------------------------ check-ups

  private async checkups(
    tx: Transaction,
    ctx: HouseholdContext,
    memberId: string,
  ): Promise<Out<C['checkups']['list']>> {
    const member = await loadMember(tx, memberId);
    if (!member.birthday) return { memberId, birthday: null, checkups: [] };
    const records = await tx
      .select()
      .from(checkupRecords)
      .where(eq(checkupRecords.memberId, memberId));
    const done: Partial<Record<CheckupCode, string>> = {};
    for (const r of records) done[r.code as CheckupCode] = r.doneOn;
    const notes = new Map(records.map((r) => [r.code, r.notes]));
    const today = toLocalDate(new Date(), ctx.household.timezone);
    return {
      memberId,
      birthday: member.birthday,
      checkups: checkupWindows(member.birthday, today, done).map((w) => ({
        ...w,
        notes: notes.get(w.code) ?? null,
      })),
    };
  }

  async listCheckups(
    ctx: HouseholdContext,
    input: In<C['checkups']['list']>,
  ): Promise<Out<C['checkups']['list']>> {
    return this.db.tenant(actorOf(ctx), (tx) => this.checkups(tx, ctx, input.params.memberId));
  }

  async markCheckup(
    ctx: HouseholdContext,
    input: In<C['checkups']['markDone']>,
  ): Promise<Out<C['checkups']['markDone']>> {
    const { memberId, code } = input.params;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const member = await loadMember(tx, memberId);
      if (member.birthday && input.body.doneOn < member.birthday)
        throw badRequest('Check-up cannot be before the birthday', 'invalid_date');
      const [row] = await tx
        .insert(checkupRecords)
        .values({
          householdId: ctx.householdId,
          memberId,
          code,
          doneOn: input.body.doneOn,
          notes: input.body.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [checkupRecords.householdId, checkupRecords.memberId, checkupRecords.code],
          set: { doneOn: input.body.doneOn, notes: input.body.notes ?? null },
        })
        .returning();
      if (!row) throw new Error('upsert failed');
      ev.changed('health_record', row.id, 'updated', memberId);
      return this.checkups(tx, ctx, memberId);
    });
  }

  async unmarkCheckup(
    ctx: HouseholdContext,
    input: In<C['checkups']['unmark']>,
  ): Promise<Out<C['checkups']['unmark']>> {
    const { memberId, code } = input.params;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .delete(checkupRecords)
        .where(and(eq(checkupRecords.memberId, memberId), eq(checkupRecords.code, code)))
        .returning();
      if (!row) throw notFound('Check-up record');
      ev.changed('health_record', row.id, 'deleted', memberId);
      return this.checkups(tx, ctx, memberId);
    });
  }

  // ------------------------------------------------------------------ jobs

  /** Every minute: reminders for intakes in the last few minutes (once per occurrence). */
  async medicationReminders(now = new Date()): Promise<number> {
    const from = new Date(now.getTime() - MEDICATION_WINDOW_MS);
    const yesterday = toLocalDate(new Date(now.getTime() - DAY_MS), 'UTC');
    const tomorrow = toLocalDate(new Date(now.getTime() + DAY_MS), 'UTC');
    const rows = await this.db.system
      .select()
      .from(medications)
      .where(
        and(
          eq(medications.reminders, true),
          lte(medications.startOn, tomorrow),
          or(isNull(medications.endOn), gte(medications.endOn, yesterday)),
        ),
      );
    const hh = await activeHouseholds(
      this.db,
      rows.map((r) => r.householdId),
    );
    const names = await this.namesOf(rows.map((r) => r.memberId));
    let sent = 0;
    for (const m of rows) {
      if (!hh.has(m.householdId)) continue;
      const due = medicationOccurrences(schedule(m), {
        from,
        to: new Date(now.getTime() + 1),
      });
      for (const o of due) {
        if (!(await once(this.db, m.householdId, `med:${m.id}:${o.at.toISOString()}`))) continue;
        await this.notifications.notify({
          householdId: m.householdId,
          memberIds: [...new Set([m.memberId, m.createdByMemberId])],
          type: 'health.medication',
          message: 'notifications.medicationReminder',
          vars: { member: names.get(m.memberId) ?? '', name: m.name, dose: m.dose ?? '' },
          link: `/health/medications/${m.id}`,
        });
        sent++;
      }
    }
    return sent;
  }

  private async namesOf(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.system
      .select({ id: householdMembers.id, name: householdMembers.displayName })
      .from(householdMembers)
      .where(inArray(householdMembers.id, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Daily: vaccinations due within two weeks and pediatric check-up windows. */
  async healthReminders(now = new Date()): Promise<number> {
    let sent = 0;
    const utcToday = toLocalDate(now, 'UTC');
    const soon = floatingToLocalDate(addFloating(localDateToFloating(utcToday), 15, 'day'));
    const monthAgo = floatingToLocalDate(addFloating(localDateToFloating(utcToday), -30, 'day'));
    const vacc = await this.db.system
      .select()
      .from(vaccinations)
      .where(
        and(
          isNotNull(vaccinations.nextDueOn),
          lte(vaccinations.nextDueOn, soon),
          gte(vaccinations.nextDueOn, monthAgo),
        ),
      );
    // A newer dose of the same vaccine supersedes the reminder.
    const newer = vacc.length
      ? await this.db.system
          .select({
            memberId: vaccinations.memberId,
            vaccine: vaccinations.vaccine,
            givenOn: vaccinations.givenOn,
          })
          .from(vaccinations)
          .where(inArray(vaccinations.memberId, [...new Set(vacc.map((v) => v.memberId))]))
      : [];
    const names = await this.namesOf(vacc.map((v) => v.memberId));
    const hhIds = new Set(vacc.map((v) => v.householdId));
    const hh = await activeHouseholds(this.db, [...hhIds]);
    for (const v of vacc) {
      if (!hh.has(v.householdId) || !v.nextDueOn) continue;
      const superseded = newer.some(
        (n) =>
          n.memberId === v.memberId &&
          n.vaccine.toLowerCase() === v.vaccine.toLowerCase() &&
          n.givenOn > v.givenOn,
      );
      if (superseded) continue;
      if (!(await once(this.db, v.householdId, `vacc:${v.id}:${v.nextDueOn}`))) continue;
      const adults = await adultMemberIds(this.db, v.householdId);
      await this.notifications.notify({
        householdId: v.householdId,
        memberIds: [...new Set([v.memberId, ...adults])],
        type: 'health.vaccination_due',
        message: 'notifications.vaccinationDue',
        vars: { member: names.get(v.memberId) ?? '', name: v.vaccine },
        link: `/health?member=${v.memberId}`,
      });
      sent++;
    }

    // Children and teens with a birthday in the last 19 years.
    const minBirthday = floatingToLocalDate(
      addFloating(localDateToFloating(utcToday), -19, 'year'),
    );
    const kids = await this.db.system
      .select()
      .from(householdMembers)
      .where(
        and(
          isNull(householdMembers.removedAt),
          isNotNull(householdMembers.birthday),
          gte(householdMembers.birthday, minBirthday),
        ),
      );
    const kidHouseholds = await activeHouseholds(
      this.db,
      kids.map((k) => k.householdId),
    );
    const records = kids.length
      ? await this.db.system
          .select()
          .from(checkupRecords)
          .where(
            inArray(
              checkupRecords.memberId,
              kids.map((k) => k.id),
            ),
          )
      : [];
    for (const kid of kids) {
      const h = kidHouseholds.get(kid.householdId);
      if (!h || !kid.birthday) continue;
      const today = toLocalDate(now, h.timezone);
      const done: Partial<Record<CheckupCode, string>> = {};
      for (const r of records) if (r.memberId === kid.id) done[r.code as CheckupCode] = r.doneOn;
      for (const w of checkupWindows(kid.birthday, today, done)) {
        const stage = checkupReminderStage(w, today);
        if (!stage) continue;
        if (!(await once(this.db, kid.householdId, `checkup:${kid.id}:${w.code}:${stage}`)))
          continue;
        const adults = await adultMemberIds(this.db, kid.householdId);
        await this.notifications.notify({
          householdId: kid.householdId,
          memberIds: adults,
          type: 'health.checkup_due',
          message: 'notifications.checkupDue',
          vars: {
            member: kid.displayName,
            name: w.code,
            date: formatDate(`${stage === 'overdue' ? w.latest : w.to}T00:00:00Z`, 'de', 'UTC'),
          },
          link: `/health/checkups/${kid.id}`,
        });
        sent++;
      }
    }
    return sent;
  }
}
