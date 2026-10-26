import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tenantPolicy, ts, updatedAt } from './_helpers.js';
import { households } from './core.js';
import { calendars, events } from './modules.js';

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });

// ---------------------------------------------------------------- AI assistant

/** Per-household opt-in. Nothing is sent to the model unless `enabled` is true. */
export const assistantSettings = pgTable(
  'assistant_settings',
  {
    householdId: uuid('household_id')
      .primaryKey()
      .references(() => households.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    consentedAt: ts('consented_at'),
    consentedByMemberId: uuid('consented_by_member_id'),
    disabledAt: ts('disabled_at'),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy('assistant_settings')],
).enableRLS();

/** Validated actions proposed by the assistant; executed only when the user applies them. */
export const assistantProposals = pgTable(
  'assistant_proposals',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    kind: text('kind', { enum: ['capture', 'receipt'] }).notNull(),
    status: text('status', { enum: ['pending', 'applied', 'discarded'] })
      .notNull()
      .default('pending'),
    /** User input; purged by the retention job (prompt contents ≤ 30 days). */
    inputText: text('input_text'),
    message: text('message'),
    actions: jsonb('actions').$type<Record<string, unknown>[]>().notNull(),
    issues: jsonb('issues').$type<Record<string, unknown>[]>().notNull().default([]),
    /** Ids created per applied action index. */
    results: jsonb('results')
      .$type<{ index: number; type: string; id: string }[]>()
      .notNull()
      .default([]),
    /** Extra structured output, e.g. the extracted receipt. */
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    appliedAt: ts('applied_at'),
  },
  (t) => [
    index('assistant_proposals_household_idx').on(t.householdId, t.createdAt),
    tenantPolicy('assistant_proposals'),
  ],
).enableRLS();

/** Audit/cost log of model calls. Holds metadata only, never prompt or response contents. */
export const assistantRequests = pgTable(
  'assistant_requests',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id'),
    kind: text('kind', { enum: ['capture', 'receipt', 'insights', 'meals'] }).notNull(),
    model: text('model').notNull(),
    status: text('status', { enum: ['ok', 'error', 'refused', 'invalid'] }).notNull(),
    errorCode: text('error_code'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('assistant_requests_household_idx').on(t.householdId, t.createdAt),
    tenantPolicy('assistant_requests'),
  ],
).enableRLS();

// ---------------------------------------------------------------- ICS subscriptions

/** Read-only import of an external ICS feed into a dedicated household calendar. */
export const calendarSubscriptions = pgTable(
  'calendar_subscriptions',
  {
    id: id(),
    householdId: householdId(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Feed URLs often embed a secret token, so they are stored encrypted. */
    urlEnc: text('url_enc').notNull(),
    urlHost: text('url_host').notNull(),
    refreshMinutes: integer('refresh_minutes').notNull().default(360),
    etag: text('etag'),
    lastModified: text('last_modified'),
    lastFetchedAt: ts('last_fetched_at'),
    nextFetchAt: ts('next_fetch_at').notNull().defaultNow(),
    status: text('status', { enum: ['pending', 'ok', 'error'] })
      .notNull()
      .default('pending'),
    lastError: text('last_error'),
    failureCount: integer('failure_count').notNull().default(0),
    /** Set when the failure notification was sent; cleared on success (once per outage). */
    failureNotifiedAt: ts('failure_notified_at'),
    eventCount: integer('event_count').notNull().default(0),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('calendar_subscriptions_calendar_uq').on(t.calendarId),
    index('calendar_subscriptions_due_idx').on(t.nextFetchAt),
    tenantPolicy('calendar_subscriptions'),
  ],
).enableRLS();

/** Imported VEVENT (by UID) ↔ local event, with a content hash to skip unchanged events. */
export const calendarSubscriptionEvents = pgTable(
  'calendar_subscription_events',
  {
    householdId: householdId(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => calendarSubscriptions.id, { onDelete: 'cascade' }),
    uid: text('uid').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subscriptionId, t.uid] }),
    tenantPolicy('calendar_subscription_events'),
  ],
).enableRLS();

// ---------------------------------------------------------------- Google Calendar

/** One household calendar ↔ one Google calendar; the refresh token is stored encrypted. */
export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: id(),
    householdId: householdId(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    memberId: uuid('member_id').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    accessTokenEnc: text('access_token_enc'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    /** Incremental sync token of events.list; null → full sync. */
    syncToken: text('sync_token'),
    status: text('status', { enum: ['active', 'error', 'revoked'] })
      .notNull()
      .default('active'),
    lastError: text('last_error'),
    failureCount: integer('failure_count').notNull().default(0),
    failureNotifiedAt: ts('failure_notified_at'),
    lastSyncedAt: ts('last_synced_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('google_calendar_connections_calendar_uq').on(t.calendarId),
    tenantPolicy('google_calendar_connections'),
  ],
).enableRLS();

/** Local event ↔ Google event, with the versions seen on both sides at the last sync. */
export const googleEventLinks = pgTable(
  'google_event_links',
  {
    householdId: householdId(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    googleEventId: text('google_event_id').notNull(),
    etag: text('etag'),
    /** Google's `updated` at the last sync. */
    googleUpdatedAt: ts('google_updated_at').notNull(),
    /** Local `events.updated_at` at the last sync; newer → local change to push. */
    localUpdatedAt: ts('local_updated_at').notNull(),
    /** Hash of the local exceptions pushed (cancelled occurrences → EXDATE). */
    exceptionsHash: text('exceptions_hash')
      .notNull()
      .default(sql`''`),
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.eventId] }),
    uniqueIndex('google_event_links_google_uq').on(t.connectionId, t.googleEventId),
    tenantPolicy('google_event_links'),
  ],
).enableRLS();
