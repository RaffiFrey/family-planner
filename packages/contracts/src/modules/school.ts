import { GERMAN_STATES } from '@fp/domain/care';
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

export const GermanState = z.enum(GERMAN_STATES);
const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
export const SchoolWeek = z.enum(['A', 'B']);

export const TimetableEntry = z.object({
  id: Id,
  memberId: Id,
  weekday: z.number().int().min(1).max(7),
  period: z.number().int(),
  startTime: z.string(),
  endTime: z.string(),
  subject: z.string(),
  room: z.string().nullable(),
  teacher: z.string().nullable(),
  validFrom: LocalDate.nullable(),
  validTo: LocalDate.nullable(),
  week: SchoolWeek.nullable(),
  createdAt: IsoDateTime,
});
export type TimetableEntry = z.infer<typeof TimetableEntry>;

const TimetableBase = z.object({
  memberId: Id,
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: z.number().int().min(1).max(7),
  period: z.number().int().min(0).max(20),
  startTime: TimeOfDay,
  endTime: TimeOfDay,
  subject: z.string().trim().min(1).max(100),
  room: z.string().trim().max(50).nullable(),
  teacher: z.string().trim().max(100).nullable(),
  validFrom: LocalDate.nullable(),
  validTo: LocalDate.nullable(),
  /** Only in A or B weeks; null = every week. */
  week: SchoolWeek.nullable(),
});
export const CreateTimetableEntryBody = TimetableBase.extend({
  room: TimetableBase.shape.room.optional(),
  teacher: TimetableBase.shape.teacher.optional(),
  validFrom: TimetableBase.shape.validFrom.optional(),
  validTo: TimetableBase.shape.validTo.optional(),
  week: TimetableBase.shape.week.optional(),
}).refine((e) => e.startTime < e.endTime, { message: 'Must end after start', path: ['endTime'] });
export const UpdateTimetableEntryBody = TimetableBase.omit({ memberId: true }).partial();

export const TimetableQuery = z.object({ memberId: Id.optional() });

export const TimetableDay = z.object({
  date: LocalDate,
  week: SchoolWeek.nullable(),
  holiday: z.string().nullable(),
  entries: z.array(TimetableEntry),
});

export const SchoolSettings = z.object({
  state: GermanState.nullable(),
  abWeekAnchor: LocalDate.nullable(),
});
export const UpdateSchoolSettingsBody = z.object({
  state: GermanState.nullable().optional(),
  /** Any date in a week that counts as "A". */
  abWeekAnchor: LocalDate.nullable().optional(),
});

export const SchoolHoliday = z.object({ name: z.string(), start: LocalDate, end: LocalDate });
export const SchoolHolidaysQuery = z
  .object({
    from: LocalDate,
    to: LocalDate,
    /** Defaults to the household's state from the school settings. */
    state: GermanState.optional(),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] });
export const SchoolHolidays = z.object({
  state: GermanState,
  holidays: z.array(SchoolHoliday),
  /** False when the public holiday API was unreachable and nothing was cached. */
  complete: z.boolean(),
});

const tags = ['school'];
const base = '/v1/households/:householdId/school';
const EntryParams = withHousehold({ entryId: Id });

export const schoolContract = {
  timetable: {
    list: defineEndpoint({
      method: 'GET',
      path: `${base}/timetable`,
      summary: 'Timetable entries',
      tags,
      params: HouseholdParams,
      query: TimetableQuery,
      response: z.array(TimetableEntry),
    }),
    day: defineEndpoint({
      method: 'GET',
      path: `${base}/timetable/:memberId/day/:date`,
      summary: "A child's lessons on a date (A/B weeks, holidays)",
      tags,
      params: withHousehold({ memberId: Id, date: LocalDate }),
      response: TimetableDay,
    }),
    create: defineEndpoint({
      method: 'POST',
      path: `${base}/timetable`,
      summary: 'Add a lesson',
      tags,
      params: HouseholdParams,
      body: CreateTimetableEntryBody,
      response: TimetableEntry,
    }),
    update: defineEndpoint({
      method: 'PATCH',
      path: `${base}/timetable/:entryId`,
      summary: 'Update a lesson',
      tags,
      params: EntryParams,
      body: UpdateTimetableEntryBody,
      response: TimetableEntry,
    }),
    remove: defineEndpoint({
      method: 'DELETE',
      path: `${base}/timetable/:entryId`,
      summary: 'Delete a lesson',
      tags,
      params: EntryParams,
      response: Ok,
    }),
  },
  settings: defineEndpoint({
    method: 'GET',
    path: `${base}/settings`,
    summary: 'School settings (Bundesland, A/B week)',
    tags,
    params: HouseholdParams,
    response: SchoolSettings,
  }),
  updateSettings: defineEndpoint({
    method: 'PUT',
    path: `${base}/settings`,
    summary: 'Update school settings',
    tags,
    params: HouseholdParams,
    body: UpdateSchoolSettingsBody,
    response: SchoolSettings,
  }),
  holidays: defineEndpoint({
    method: 'GET',
    path: `${base}/holidays`,
    summary: 'School holidays of a Bundesland in a date range',
    tags,
    params: HouseholdParams,
    query: SchoolHolidaysQuery,
    response: SchoolHolidays,
  }),
} as const;
