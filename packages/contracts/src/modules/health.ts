import { CHECKUP_CODES } from '@fp/domain/care';
import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  Ok,
  withHousehold,
} from '../core.js';
import { RRuleString } from './calendar.js';
import { TimeZone } from './households.js';

export const Vaccination = z.object({
  id: Id,
  memberId: Id,
  vaccine: z.string(),
  givenOn: LocalDate,
  dose: z.string().nullable(),
  nextDueOn: LocalDate.nullable(),
  doctorContactId: Id.nullable(),
  batch: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type Vaccination = z.infer<typeof Vaccination>;

const VaccinationBase = z.object({
  memberId: Id,
  vaccine: z.string().trim().min(1).max(200),
  givenOn: LocalDate,
  dose: z.string().trim().max(50).nullable(),
  nextDueOn: LocalDate.nullable(),
  doctorContactId: Id.nullable(),
  batch: z.string().trim().max(50).nullable(),
  notes: z.string().max(2000).nullable(),
});
export const CreateVaccinationBody = VaccinationBase.extend({
  dose: VaccinationBase.shape.dose.optional(),
  nextDueOn: VaccinationBase.shape.nextDueOn.optional(),
  doctorContactId: VaccinationBase.shape.doctorContactId.optional(),
  batch: VaccinationBase.shape.batch.optional(),
  notes: VaccinationBase.shape.notes.optional(),
});
export const UpdateVaccinationBody = VaccinationBase.omit({ memberId: true }).partial();

export const HealthMemberQuery = z.object({ memberId: Id.optional() });

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

export const Medication = z.object({
  id: Id,
  memberId: Id,
  name: z.string(),
  dose: z.string().nullable(),
  times: z.array(z.string()),
  rrule: z.string(),
  timezone: TimeZone,
  startOn: LocalDate,
  endOn: LocalDate.nullable(),
  reminders: z.boolean(),
  notes: z.string().nullable(),
  /** Next intake (null when the plan ended). */
  nextAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Medication = z.infer<typeof Medication>;

const MedicationBase = z.object({
  memberId: Id,
  name: z.string().trim().min(1).max(200),
  dose: z.string().trim().max(100).nullable(),
  times: z.array(TimeOfDay).min(1).max(12),
  /** Day rule, e.g. FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,TH. */
  rrule: RRuleString,
  timezone: TimeZone,
  startOn: LocalDate,
  endOn: LocalDate.nullable(),
  reminders: z.boolean(),
  notes: z.string().max(2000).nullable(),
});
export const CreateMedicationBody = MedicationBase.extend({
  dose: MedicationBase.shape.dose.optional(),
  rrule: MedicationBase.shape.rrule.default('FREQ=DAILY'),
  timezone: MedicationBase.shape.timezone.optional(),
  endOn: MedicationBase.shape.endOn.optional(),
  reminders: MedicationBase.shape.reminders.default(true),
  notes: MedicationBase.shape.notes.optional(),
});
export const UpdateMedicationBody = MedicationBase.omit({ memberId: true }).partial();

export const MedicationScheduleQuery = z.object({ from: IsoDateTime, to: IsoDateTime });
export const MedicationIntake = z.object({ at: IsoDateTime, time: z.string() });

export const CheckupCode = z.enum(CHECKUP_CODES);
export const CheckupStatus = z.enum(['upcoming', 'due', 'overdue', 'missed', 'done']);

export const Checkup = z.object({
  code: CheckupCode,
  from: LocalDate,
  to: LocalDate,
  latest: LocalDate,
  status: CheckupStatus,
  doneOn: LocalDate.nullable(),
  notes: z.string().nullable(),
});

export const MemberCheckups = z.object({
  memberId: Id,
  birthday: LocalDate.nullable(),
  /** Empty when the member has no birthday set. */
  checkups: z.array(Checkup),
});

export const MarkCheckupBody = z.object({
  doneOn: LocalDate,
  notes: z.string().max(2000).nullable().optional(),
});

const tags = ['health'];
const base = '/v1/households/:householdId/health';
const VaccinationParams = withHousehold({ vaccinationId: Id });
const MedicationParams = withHousehold({ medicationId: Id });
const CheckupParams = withHousehold({ memberId: Id, code: CheckupCode });

export const healthContract = {
  vaccinations: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/vaccinations`,
      summary: 'Vaccinations',
      tags,
      params: HouseholdParams,
      query: HealthMemberQuery,
      response: z.array(Vaccination),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/vaccinations`,
      summary: 'Record a vaccination',
      tags,
      params: HouseholdParams,
      body: CreateVaccinationBody,
      response: Vaccination,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/vaccinations/:vaccinationId`,
      summary: 'Update a vaccination',
      tags,
      params: VaccinationParams,
      body: UpdateVaccinationBody,
      response: Vaccination,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/vaccinations/:vaccinationId`,
      summary: 'Delete a vaccination',
      tags,
      params: VaccinationParams,
      response: Ok,
    }),
  },
  medications: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/medications`,
      summary: 'Medication plans',
      tags,
      params: HouseholdParams,
      query: HealthMemberQuery,
      response: z.array(Medication),
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/medications`,
      summary: 'Add a medication plan',
      tags,
      params: HouseholdParams,
      body: CreateMedicationBody,
      response: Medication,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/medications/:medicationId`,
      summary: 'Update a medication plan',
      tags,
      params: MedicationParams,
      body: UpdateMedicationBody,
      response: Medication,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/medications/:medicationId`,
      summary: 'Delete a medication plan',
      tags,
      params: MedicationParams,
      response: Ok,
    }),
    schedule: defineEndpoint({
      method: 'GET',
      path: `${base}/medications/:medicationId/schedule`,
      summary: 'Intake times in a range',
      tags,
      params: MedicationParams,
      query: MedicationScheduleQuery,
      response: z.array(MedicationIntake),
    }),
  },
  checkups: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/checkups/:memberId`,
      summary: 'Pediatric check-ups (U1–U9, J1, J2) with due/overdue/done status',
      tags,
      params: withHousehold({ memberId: Id }),
      response: MemberCheckups,
    }),
    markDone: defineEndpoint({
      method: 'PUT',
      path: `${base}/checkups/:memberId/:code`,
      summary: 'Mark a check-up as done',
      tags,
      params: CheckupParams,
      body: MarkCheckupBody,
      response: MemberCheckups,
    }),
    unmark: defineEndpoint({
      method: 'DELETE',
      path: `${base}/checkups/:memberId/:code`,
      summary: 'Undo a check-up record',
      tags,
      params: CheckupParams,
      response: MemberCheckups,
    }),
  },
} as const;
