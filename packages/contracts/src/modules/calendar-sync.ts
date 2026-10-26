import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';
import { HexColor } from './households.js';

// ---------------------------------------------------------------- ICS subscriptions

export const CalendarSubscription = z.object({
  id: Id,
  /** Dedicated read-only calendar holding the imported events. */
  calendarId: Id,
  name: z.string(),
  /** Only the host is returned; feed URLs often contain secret tokens. */
  urlHost: z.string(),
  refreshMinutes: z.number().int(),
  status: z.enum(['pending', 'ok', 'error']),
  lastError: z.string().nullable(),
  lastFetchedAt: IsoDateTime.nullable(),
  failureCount: z.number().int(),
  eventCount: z.number().int(),
  createdByMemberId: Id,
  createdAt: IsoDateTime,
});
export type CalendarSubscription = z.infer<typeof CalendarSubscription>;

export const CreateCalendarSubscriptionBody = z.object({
  name: z.string().trim().min(1).max(60),
  /** https:// or webcal:// URL of an ICS feed. */
  url: z.string().trim().min(8).max(2000),
  color: HexColor.default('#64748b'),
  refreshMinutes: z.number().int().min(15).max(10080).default(360),
});

export const CalendarSyncStats = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
  unchanged: z.number().int(),
});

export const RefreshSubscriptionResult = z.object({
  subscription: CalendarSubscription,
  stats: CalendarSyncStats.nullable(),
});

// ---------------------------------------------------------------- Google Calendar

export const GoogleCalendarConnection = z.object({
  id: Id,
  calendarId: Id,
  googleCalendarId: z.string(),
  status: z.enum(['active', 'error', 'revoked']),
  lastError: z.string().nullable(),
  lastSyncedAt: IsoDateTime.nullable(),
  connectedByMemberId: Id,
  createdAt: IsoDateTime,
});
export type GoogleCalendarConnection = z.infer<typeof GoogleCalendarConnection>;

export const GoogleConnectBody = z.object({
  /** Household calendar to keep in sync. */
  calendarId: Id,
  /** Google calendar id; `primary` = the account's main calendar. */
  googleCalendarId: z.string().trim().min(1).max(300).default('primary'),
});

export const GoogleConnectResult = z.object({
  /** Open in the browser; Google redirects to the web app with `code` and `state`. */
  authUrl: z.url(),
  state: z.string(),
});

export const GoogleCallbackBody = z.object({
  code: z.string().min(1).max(2000),
  state: z.string().min(16).max(200),
});

export const GoogleSyncResult = z.object({
  connection: GoogleCalendarConnection,
  pulled: CalendarSyncStats,
  pushed: CalendarSyncStats,
});

const tags = ['calendar-sync'];
const base = '/v1/households/:householdId/calendar-sync';
const SubscriptionParams = withHousehold({ subscriptionId: Id });
const ConnectionParams = withHousehold({ connectionId: Id });

export const calendarSyncContract = {
  listSubscriptions: defineEndpoint({
    method: 'GET',
    path: `${base}/subscriptions`,
    summary: 'External ICS subscriptions',
    tags,
    params: HouseholdParams,
    response: z.array(CalendarSubscription),
  }),
  createSubscription: defineEndpoint({
    method: 'POST',
    path: `${base}/subscriptions`,
    summary: 'Subscribe to an ICS feed (creates a read-only calendar and imports it)',
    tags,
    params: HouseholdParams,
    body: CreateCalendarSubscriptionBody,
    response: RefreshSubscriptionResult,
  }),
  deleteSubscription: defineEndpoint({
    method: 'DELETE',
    path: `${base}/subscriptions/:subscriptionId`,
    summary: 'Unsubscribe (deletes the imported calendar)',
    tags,
    params: SubscriptionParams,
    response: Ok,
  }),
  refreshSubscription: defineEndpoint({
    method: 'POST',
    path: `${base}/subscriptions/:subscriptionId/refresh`,
    summary: 'Fetch the feed now',
    tags,
    params: SubscriptionParams,
    response: RefreshSubscriptionResult,
  }),
  listGoogle: defineEndpoint({
    method: 'GET',
    path: `${base}/google`,
    summary: 'Google Calendar connections',
    tags,
    params: HouseholdParams,
    response: z.array(GoogleCalendarConnection),
  }),
  connectGoogle: defineEndpoint({
    method: 'POST',
    path: `${base}/google/connect`,
    summary: 'Start the Google OAuth flow for a calendar',
    tags,
    params: HouseholdParams,
    body: GoogleConnectBody,
    response: GoogleConnectResult,
  }),
  googleCallback: defineEndpoint({
    method: 'POST',
    path: `${base}/google/callback`,
    summary: 'Finish the OAuth flow (code + state from the redirect) and run the first sync',
    tags,
    params: HouseholdParams,
    body: GoogleCallbackBody,
    response: GoogleSyncResult,
  }),
  disconnectGoogle: defineEndpoint({
    method: 'DELETE',
    path: `${base}/google/:connectionId`,
    summary: 'Disconnect (revokes the token; local events stay)',
    tags,
    params: ConnectionParams,
    response: Ok,
  }),
  syncGoogle: defineEndpoint({
    method: 'POST',
    path: `${base}/google/:connectionId/sync`,
    summary: 'Two-way sync now',
    tags,
    params: ConnectionParams,
    response: GoogleSyncResult,
  }),
} as const;
