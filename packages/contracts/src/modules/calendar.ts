import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';
import { HexColor, TimeZone } from './households.js';

export const Visibility = z.enum(['household', 'private', 'members']);
export const RRuleString = z.string().min(6).max(500);

export const Calendar = z.object({
  id: Id,
  name: z.string(),
  color: HexColor,
  visibility: Visibility,
  ownerMemberId: Id,
  sharedWith: z.array(Id).nullable(),
  /** Secret ICS feed URL for subscribing from other calendar apps. */
  icsUrl: z.string().nullable(),
  /** Calendars filled by an ICS subscription can't be edited. */
  readOnly: z.boolean(),
});
export type Calendar = z.infer<typeof Calendar>;

export const CreateCalendarBody = z.object({
  name: z.string().trim().min(1).max(60),
  color: HexColor,
  visibility: Visibility.default('household'),
  sharedWith: z.array(Id).optional(),
});

export const UpdateCalendarBody = CreateCalendarBody.partial();

/** Fields without defaults, so PATCH never resets omitted values. */
const EventBase = z.object({
  calendarId: Id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  location: z.string().max(300).nullable(),
  /** For all-day events: midnight UTC of the first day; end is exclusive. */
  start: IsoDateTime,
  end: IsoDateTime,
  allDay: z.boolean(),
  timezone: TimeZone,
  rrule: RRuleString.nullable(),
  attendeeMemberIds: z.array(Id),
  /** Minutes before start. */
  reminders: z.array(z.number().int().min(0).max(40320)).max(5),
  color: HexColor.nullable(),
});

export const CreateEventBody = EventBase.extend({
  description: EventBase.shape.description.optional(),
  location: EventBase.shape.location.optional(),
  allDay: EventBase.shape.allDay.default(false),
  timezone: EventBase.shape.timezone.default('Europe/Berlin'),
  rrule: EventBase.shape.rrule.optional(),
  attendeeMemberIds: EventBase.shape.attendeeMemberIds.default([]),
  reminders: EventBase.shape.reminders.default([]),
  color: EventBase.shape.color.optional(),
}).refine((e) => e.end >= e.start, { message: 'end must not be before start', path: ['end'] });

export const EditScope = z.enum(['this', 'following', 'all']);

export const UpdateEventBody = EventBase.partial().extend({
  /** For recurring events: which occurrences the change applies to. */
  scope: EditScope.default('all'),
  /** Original start of the occurrence being edited (required for this/following). */
  occurrenceStart: IsoDateTime.optional(),
});

export const DeleteEventQuery = z.object({
  scope: EditScope.default('all'),
  occurrenceStart: IsoDateTime.optional(),
});

export const Event = z.object({
  id: Id,
  calendarId: Id,
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  start: IsoDateTime,
  end: IsoDateTime,
  allDay: z.boolean(),
  timezone: TimeZone,
  rrule: z.string().nullable(),
  attendeeMemberIds: z.array(Id),
  reminders: z.array(z.number().int()),
  color: HexColor.nullable(),
  createdByMemberId: Id,
});
export type Event = z.infer<typeof Event>;

/** A concrete occurrence of an event in a requested range. */
export const Occurrence = Event.extend({
  eventId: Id,
  originalStart: IsoDateTime,
  modified: z.boolean(),
});
export type Occurrence = z.infer<typeof Occurrence>;

export const RangeQuery = z
  .object({
    from: IsoDateTime,
    to: IsoDateTime,
    calendarIds: z.union([Id, z.array(Id)]).optional(),
  })
  .refine((q) => q.to > q.from, { message: 'to must be after from', path: ['to'] });

const tags = ['calendar'];
const CalendarParams = withHousehold({ calendarId: Id });
const EventParams = withHousehold({ eventId: Id });

export const calendarContract = {
  listCalendars: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/calendars',
    summary: 'Visible calendars',
    tags,
    params: HouseholdParams,
    response: z.array(Calendar),
  }),
  createCalendar: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/calendars',
    summary: 'Create calendar',
    tags,
    params: HouseholdParams,
    body: CreateCalendarBody,
    response: Calendar,
  }),
  updateCalendar: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/calendars/:calendarId',
    summary: 'Update calendar',
    tags,
    params: CalendarParams,
    body: UpdateCalendarBody,
    response: Calendar,
  }),
  deleteCalendar: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/calendars/:calendarId',
    summary: 'Delete calendar and its events',
    tags,
    params: CalendarParams,
    response: Ok,
  }),
  rotateIcsToken: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/calendars/:calendarId/ics-token',
    summary: 'Create/rotate the ICS feed URL',
    tags,
    params: CalendarParams,
    response: Calendar,
  }),
  occurrences: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/occurrences',
    summary: 'Expanded occurrences in a range',
    tags,
    params: HouseholdParams,
    query: RangeQuery,
    response: z.array(Occurrence),
  }),
  getEvent: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/events/:eventId',
    summary: 'Event series',
    tags,
    params: EventParams,
    response: Event,
  }),
  createEvent: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/events',
    summary: 'Create event',
    tags,
    params: HouseholdParams,
    body: CreateEventBody,
    response: Event,
  }),
  updateEvent: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/events/:eventId',
    summary: 'Update event (this / following / all)',
    tags,
    params: EventParams,
    body: UpdateEventBody,
    response: Event,
  }),
  deleteEvent: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/events/:eventId',
    summary: 'Delete event (this / following / all)',
    tags,
    params: EventParams,
    query: DeleteEventQuery,
    response: Ok,
  }),
} as const;
