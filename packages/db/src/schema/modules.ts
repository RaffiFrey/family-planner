import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  id,
  tenantOrGlobalPolicies,
  tenantPolicy,
  ts,
  updatedAt,
} from './_helpers.js';
import { households } from './core.js';

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
const visibility = () =>
  text('visibility', { enum: ['household', 'private', 'members'] })
    .notNull()
    .default('household');
const sharedWith = () => uuid('shared_with').array();

// ---------------------------------------------------------------- calendar

export const calendars = pgTable(
  'calendars',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    visibility: visibility(),
    sharedWith: sharedWith(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    /** Capability token for the ICS subscription feed. */
    icsToken: text('ics_token').unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('calendars_household_idx').on(t.householdId), tenantPolicy('calendars')],
).enableRLS();

export const events = pgTable(
  'events',
  {
    id: id(),
    householdId: householdId(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    startAt: ts('start_at').notNull(),
    endAt: ts('end_at').notNull(),
    allDay: boolean('all_day').notNull().default(false),
    timezone: text('timezone').notNull(),
    rrule: text('rrule'),
    /** Upper bound of the series for range queries; null = open-ended. */
    seriesEndAt: ts('series_end_at'),
    attendeeMemberIds: uuid('attendee_member_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    reminders: integer('reminders')
      .array()
      .notNull()
      .default(sql`'{}'::int[]`),
    color: text('color'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('events_household_range_idx').on(t.householdId, t.startAt, t.seriesEndAt),
    tenantPolicy('events'),
  ],
).enableRLS();

export const eventExceptions = pgTable(
  'event_exceptions',
  {
    id: id(),
    householdId: householdId(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    originalStart: ts('original_start').notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    startAt: ts('start_at'),
    endAt: ts('end_at'),
    /** Per-occurrence overrides of title/description/location. */
    overrides: jsonb('overrides').$type<{
      title?: string;
      description?: string | null;
      location?: string | null;
    }>(),
  },
  (t) => [
    unique('event_exceptions_uq').on(t.eventId, t.originalStart),
    tenantPolicy('event_exceptions'),
  ],
).enableRLS();

/** Reminder/notification bookkeeping so each occurrence reminder fires once. */
export const sentReminders = pgTable(
  'sent_reminders',
  {
    householdId: householdId(),
    key: text('key').notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('sent_reminders_key_uq').on(t.householdId, t.key)],
);

// ---------------------------------------------------------------- tasks

export interface TaskRecurrenceJson {
  mode: 'fixed' | 'floating';
  rrule?: string;
  interval?: number;
  unit?: 'day' | 'week' | 'month' | 'year';
}

/** Each row is one instance; instances of a recurring chore share `series_id`. */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    householdId: householdId(),
    seriesId: uuid('series_id').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    assigneeMemberId: uuid('assignee_member_id'),
    dueAt: ts('due_at'),
    /** First due date of the series (DTSTART for fixed rules). */
    anchorAt: ts('anchor_at'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    recurrence: jsonb('recurrence').$type<TaskRecurrenceJson>(),
    rotationMemberIds: uuid('rotation_member_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    points: integer('points').notNull().default(0),
    checklist: jsonb('checklist')
      .$type<{ id: string; text: string; done: boolean }[]>()
      .notNull()
      .default([]),
    status: text('status', { enum: ['open', 'done', 'skipped'] })
      .notNull()
      .default('open'),
    completedAt: ts('completed_at'),
    completedByMemberId: uuid('completed_by_member_id'),
    visibility: visibility(),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('tasks_household_status_due_idx').on(t.householdId, t.status, t.dueAt),
    index('tasks_series_idx').on(t.seriesId),
    // At most one open instance per series.
    uniqueIndex('tasks_series_open_uq')
      .on(t.seriesId)
      .where(sql`status = 'open' and deleted_at is null`),
    tenantPolicy('tasks'),
  ],
).enableRLS();

// ---------------------------------------------------------------- lists

export const lists = pgTable(
  'lists',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['shopping', 'todo', 'packing', 'wishlist', 'other'] }).notNull(),
    icon: text('icon'),
    visibility: visibility(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('lists_household_idx').on(t.householdId), tenantPolicy('lists')],
).enableRLS();

export const listItems = pgTable(
  'list_items',
  {
    id: id(),
    householdId: householdId(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    quantity: text('quantity'),
    category: text('category').notNull().default('other'),
    checked: boolean('checked').notNull().default(false),
    checkedByMemberId: uuid('checked_by_member_id'),
    checkedAt: ts('checked_at'),
    position: doublePrecision('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('list_items_list_idx').on(t.listId, t.position), tenantPolicy('list_items')],
).enableRLS();

/** Quick-add history for shopping suggestions and category guessing. */
export const itemHistory = pgTable(
  'item_history',
  {
    householdId: householdId(),
    normalized: text('normalized').notNull(),
    text: text('text').notNull(),
    category: text('category').notNull(),
    uses: integer('uses').notNull().default(1),
    lastUsedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('item_history_uq').on(t.householdId, t.normalized),
    tenantPolicy('item_history'),
  ],
).enableRLS();

// ---------------------------------------------------------------- finance

const minor = (name: string) => bigint(name, { mode: 'number' });

export const finAccounts = pgTable(
  'fin_accounts',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['checking', 'savings', 'cash', 'credit_card', 'depot', 'loan', 'other'],
    }).notNull(),
    currency: text('currency').notNull(),
    institution: text('institution'),
    /** AES-GCM encrypted (field-level encryption, ADR-0007). */
    ibanEncrypted: text('iban_encrypted'),
    ibanLast4: text('iban_last4'),
    openingBalanceMinor: minor('opening_balance_minor').notNull().default(0),
    color: text('color'),
    visibility: visibility(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    source: text('source', { enum: ['manual', 'sync'] })
      .notNull()
      .default('manual'),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('fin_accounts_household_idx').on(t.householdId), tenantPolicy('fin_accounts')],
).enableRLS();

/** household_id NULL = global default category managed in the admin app. */
export const finCategories = pgTable(
  'fin_categories',
  {
    id: id(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    icon: text('icon'),
    color: text('color'),
    /** Stable key for global categories (seed + rules), e.g. `groceries`. */
    key: text('key').unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index('fin_categories_household_idx').on(t.householdId),
    ...tenantOrGlobalPolicies('fin_categories'),
  ],
).enableRLS();

export const finCategoryPrefs = pgTable(
  'fin_category_prefs',
  {
    householdId: householdId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => finCategories.id, { onDelete: 'cascade' }),
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [
    uniqueIndex('fin_category_prefs_uq').on(t.householdId, t.categoryId),
    tenantPolicy('fin_category_prefs'),
  ],
).enableRLS();

export const finImports = pgTable(
  'fin_imports',
  {
    id: id(),
    householdId: householdId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    format: text('format').notNull(),
    fileName: text('file_name'),
    imported: integer('imported').notNull(),
    duplicates: integer('duplicates').notNull(),
    issues: jsonb('issues').$type<{ line: number; message: string }[]>().notNull().default([]),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
  },
  () => [tenantPolicy('fin_imports')],
).enableRLS();

export const finRules = pgTable(
  'fin_rules',
  {
    id: id(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => finCategories.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(100),
    conditions: jsonb('conditions')
      .$type<
        {
          field: 'counterparty' | 'purpose' | 'iban' | 'bookingText' | 'any';
          op: 'contains' | 'equals' | 'startsWith' | 'regex';
          value: string;
        }[]
      >()
      .notNull(),
    direction: text('direction', { enum: ['in', 'out'] }),
    amountMinMinor: minor('amount_min_minor'),
    amountMaxMinor: minor('amount_max_minor'),
    createdAt: createdAt(),
  },
  (t) => [
    index('fin_rules_household_idx').on(t.householdId),
    ...tenantOrGlobalPolicies('fin_rules'),
  ],
).enableRLS();

export const finTransactions = pgTable(
  'fin_transactions',
  {
    id: id(),
    householdId: householdId(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    bookingDate: date('booking_date', { mode: 'string' }).notNull(),
    valueDate: date('value_date', { mode: 'string' }),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    counterpartyName: text('counterparty_name'),
    counterpartyIban: text('counterparty_iban'),
    purpose: text('purpose').notNull().default(''),
    bookingText: text('booking_text'),
    categoryId: uuid('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
    ruleId: uuid('rule_id').references(() => finRules.id, { onDelete: 'set null' }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text('notes'),
    status: text('status', { enum: ['booked', 'pending'] })
      .notNull()
      .default('booked'),
    source: text('source', { enum: ['manual', 'csv', 'camt', 'mt940', 'sync'] }).notNull(),
    importId: uuid('import_id').references(() => finImports.id, { onDelete: 'set null' }),
    importHash: text('import_hash'),
    bankReference: text('bank_reference'),
    transferAccountId: uuid('transfer_account_id'),
    transferPeerId: uuid('transfer_peer_id'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('fin_tx_household_date_idx').on(t.householdId, t.bookingDate, t.id),
    index('fin_tx_account_date_idx').on(t.accountId, t.bookingDate),
    index('fin_tx_category_idx').on(t.householdId, t.categoryId),
    uniqueIndex('fin_tx_import_hash_uq')
      .on(t.accountId, t.importHash)
      .where(sql`import_hash is not null`),
    tenantPolicy('fin_transactions'),
  ],
).enableRLS();

export const finSplits = pgTable(
  'fin_splits',
  {
    id: id(),
    householdId: householdId(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => finTransactions.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
    amountMinor: minor('amount_minor').notNull(),
    memberId: uuid('member_id'),
    note: text('note'),
  },
  (t) => [index('fin_splits_tx_idx').on(t.transactionId), tenantPolicy('fin_splits')],
).enableRLS();

export const finBudgets = pgTable(
  'fin_budgets',
  {
    id: id(),
    householdId: householdId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => finCategories.id, { onDelete: 'cascade' }),
    period: text('period', { enum: ['monthly', 'yearly'] }).notNull(),
    limitMinor: minor('limit_minor').notNull(),
    rollover: boolean('rollover').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fin_budgets_category_period_uq').on(t.householdId, t.categoryId, t.period),
    tenantPolicy('fin_budgets'),
  ],
).enableRLS();

/** Ensures each budget threshold alert fires once per period. */
export const finBudgetAlerts = pgTable(
  'fin_budget_alerts',
  {
    householdId: householdId(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => finBudgets.id, { onDelete: 'cascade' }),
    periodStart: ts('period_start').notNull(),
    level: text('level', { enum: ['warning', 'exceeded'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('fin_budget_alerts_uq').on(t.budgetId, t.periodStart, t.level),
    tenantPolicy('fin_budget_alerts'),
  ],
).enableRLS();

// ---------------------------------------------------------------- storage

export const folders = pgTable(
  'folders',
  {
    id: id(),
    householdId: householdId(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    visibility: visibility(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('folders_parent_idx').on(t.householdId, t.parentId), tenantPolicy('folders')],
).enableRLS();

export const files = pgTable(
  'files',
  {
    id: id(),
    householdId: householdId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    thumbnailKey: text('thumbnail_key'),
    status: text('status', { enum: ['pending_upload', 'scanning', 'ready', 'infected', 'failed'] })
      .notNull()
      .default('pending_upload'),
    visibility: visibility(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('files_folder_idx').on(t.householdId, t.folderId), tenantPolicy('files')],
).enableRLS();

// ---------------------------------------------------------------- notifications (user-scoped)

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id').notNull(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey(),
  prefs: jsonb('prefs').$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
});

export const pushDevices = pgTable(
  'push_devices',
  {
    id: id(),
    userId: text('user_id').notNull(),
    token: text('token').notNull().unique(),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    deviceName: text('device_name'),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
  },
  (t) => [index('push_devices_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------- staff (admin realm)

export const staffUsers = pgTable('staff_users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  roles: text('roles').array().notNull(),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  disabled: boolean('disabled').notNull().default(false),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
});

export const staffSessions = pgTable('staff_sessions', {
  id: id(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
});

export const staffAuditLog = pgTable(
  'staff_audit_log',
  {
    id: id(),
    staffId: uuid('staff_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    reason: text('reason'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('staff_audit_created_idx').on(t.createdAt)],
);
