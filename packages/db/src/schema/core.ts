import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CURRENT_HOUSEHOLD,
  createdAt,
  deletedAt,
  id,
  tenantPolicy,
  ts,
  updatedAt,
} from './_helpers.js';
import { user } from './auth.js';

export const households = pgTable(
  'households',
  {
    id: id(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('Europe/Berlin'),
    currency: text('currency').notNull().default('EUR'),
    locale: text('locale').notNull().default('de'),
    plan: text('plan', { enum: ['free', 'plus', 'pro'] })
      .notNull()
      .default('free'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  () => [
    pgPolicy('households_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'fp_app',
      using: sql`id = ${CURRENT_HOUSEHOLD}`,
      withCheck: sql`id = ${CURRENT_HOUSEHOLD}`,
    }),
  ],
).enableRLS();

export const householdMembers = pgTable(
  'household_members',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    role: text('role', {
      enum: ['owner', 'admin', 'adult', 'teen', 'child', 'caregiver'],
    }).notNull(),
    color: text('color').notNull(),
    avatarUrl: text('avatar_url'),
    isManaged: boolean('is_managed').notNull().default(false),
    birthday: date('birthday', { mode: 'string' }),
    grantedModules: text('granted_modules').array(),
    accessUntil: ts('access_until'),
    joinedAt: createdAt(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    index('members_household_idx').on(t.householdId),
    index('members_user_idx').on(t.userId),
    uniqueIndex('members_household_user_uq')
      .on(t.householdId, t.userId)
      .where(sql`user_id is not null and removed_at is null`),
    tenantPolicy('household_members'),
  ],
).enableRLS();

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    role: text('role', { enum: ['admin', 'adult', 'teen', 'child', 'caregiver'] }).notNull(),
    email: text('email'),
    grantedModules: text('granted_modules').array(),
    accessUntil: ts('access_until'),
    invitedByMemberId: uuid('invited_by_member_id').notNull(),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_household_idx').on(t.householdId), tenantPolicy('invitations')],
).enableRLS();

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    actorMemberId: uuid('actor_member_id'),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_household_created_idx').on(t.householdId, t.createdAt),
    tenantPolicy('audit_log'),
  ],
).enableRLS();

/** Transactional outbox: written in the same transaction as the change, relayed to BullMQ. */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    processedAt: ts('processed_at'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('outbox_unprocessed_idx')
      .on(t.id)
      .where(sql`processed_at is null`),
    // The app role may only append events for its own household.
    pgPolicy('outbox_insert', {
      as: 'permissive',
      for: 'insert',
      to: 'fp_app',
      withCheck: sql`household_id is null or household_id = ${CURRENT_HOUSEHOLD}`,
    }),
  ],
).enableRLS();

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    response: jsonb('response'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index('idempotency_created_idx').on(t.createdAt),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    householdId: uuid('household_id')
      .primaryKey()
      .references(() => households.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: ['free', 'plus', 'pro'] })
      .notNull()
      .default('free'),
    status: text('status', { enum: ['none', 'trialing', 'active', 'past_due', 'canceled'] })
      .notNull()
      .default('none'),
    provider: text('provider', { enum: ['stripe', 'app_store', 'play_store', 'comp'] }),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id').unique(),
    currentPeriodEnd: ts('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    compUntil: ts('comp_until'),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy('subscriptions')],
).enableRLS();

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rollout_percent').notNull().default(0),
  householdAllowlist: uuid('household_allowlist')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  updatedAt: updatedAt(),
});

export const announcements = pgTable('announcements', {
  id: id(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  level: text('level', { enum: ['info', 'warning', 'maintenance'] }).notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  createdAt: createdAt(),
});

export const gdprRequests = pgTable(
  'gdpr_requests',
  {
    id: id(),
    userId: text('user_id').notNull(),
    type: text('type', { enum: ['export', 'deletion'] }).notNull(),
    status: text('status', { enum: ['pending', 'processing', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    requestedAt: createdAt(),
    completedAt: ts('completed_at'),
    resultKey: text('result_key'),
    error: text('error'),
  },
  (t) => [index('gdpr_status_idx').on(t.status)],
);

/**
 * Customer-granted, time-boxed support access (ADR-0008). Staff can only see the extended
 * support view while a grant is active; every view is written to the staff audit log.
 */
export const supportAccessGrants = pgTable(
  'support_access_grants',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    grantedByMemberId: uuid('granted_by_member_id').notNull(),
    reason: text('reason'),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('support_access_household_idx').on(t.householdId, t.expiresAt),
    tenantPolicy('support_access_grants'),
  ],
).enableRLS();
