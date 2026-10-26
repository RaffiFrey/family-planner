import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tenantPolicy, ts, updatedAt } from './_helpers.js';
import { households } from './core.js';

// Documents vault, contacts & emergency cards, health, kids & school, home & vehicles, location.

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
const visibility = () =>
  text('visibility', { enum: ['household', 'private', 'members'] })
    .notNull()
    .default('household');
const uuids = (name: string) =>
  uuid(name)
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`);
const texts = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);
const day = (name: string) => date(name, { mode: 'string' });

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

// ---------------------------------------------------------------- documents vault

export const VAULT_DOCUMENT_TYPES = [
  'id_card',
  'passport',
  'driver_license',
  'insurance_policy',
  'birth_certificate',
  'certificate',
  'contract',
  'medical',
  'tax',
  'other',
] as const;

export const OCR_STATUSES = [
  'none',
  'pending',
  'done',
  'unsupported',
  'failed',
  'disabled',
] as const;

export interface OcrSuggestionsJson {
  expiresAt: { value: string; source: string; confidence: number }[];
  issuedAt: { value: string; source: string; confidence: number }[];
  documentNumber: { value: string; source: string; confidence: number }[];
  holderName: string | null;
}

export const vaultDocuments = pgTable(
  'vault_documents',
  {
    id: id(),
    householdId: householdId(),
    type: text('type', { enum: VAULT_DOCUMENT_TYPES }).notNull(),
    title: text('title').notNull(),
    holderMemberId: uuid('holder_member_id'),
    issuer: text('issuer'),
    /** AES-GCM ciphertext (CryptoService); never returned to clients without decryption. */
    numberEncrypted: text('number_encrypted'),
    numberLast4: text('number_last4'),
    issuedOn: day('issued_on'),
    expiresOn: day('expires_on'),
    notes: text('notes'),
    fileIds: uuids('file_ids'),
    tags: texts('tags'),
    /** Reminder lead days before expiry; null = defaults (183/30/7). */
    reminderLeadDays: integer('reminder_lead_days').array(),
    visibility: visibility(),
    sharedWith: uuid('shared_with').array(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    ocrStatus: text('ocr_status', { enum: OCR_STATUSES }).notNull().default('none'),
    ocrText: text('ocr_text'),
    ocrSuggestions: jsonb('ocr_suggestions').$type<OcrSuggestionsJson>(),
    ocrAt: ts('ocr_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('german'::regconfig, coalesce(title, '') || ' ' || coalesce(issuer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(ocr_text, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('vault_documents_household_idx').on(t.householdId, t.type),
    index('vault_documents_expiry_idx').on(t.expiresOn),
    index('vault_documents_search_idx').using('gin', t.search),
    tenantPolicy('vault_documents'),
  ],
).enableRLS();

// ---------------------------------------------------------------- contacts & emergency cards

export const CONTACT_CATEGORIES = [
  'doctor',
  'school',
  'kita',
  'babysitter',
  'family',
  'emergency',
  'craftsman',
  'other',
] as const;

export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    category: text('category', { enum: CONTACT_CATEGORIES }).notNull().default('other'),
    organization: text('organization'),
    phones: jsonb('phones')
      .$type<{ label: string | null; number: string }[]>()
      .notNull()
      .default([]),
    email: text('email'),
    address: text('address'),
    notes: text('notes'),
    memberIds: uuids('member_ids'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('contacts_household_idx').on(t.householdId, t.category), tenantPolicy('contacts')],
).enableRLS();

export const emergencyCards = pgTable(
  'emergency_cards',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    bloodType: text('blood_type'),
    allergies: texts('allergies'),
    conditions: texts('conditions'),
    medications: text('medications'),
    insuranceProvider: text('insurance_provider'),
    insuranceNumberEncrypted: text('insurance_number_encrypted'),
    insuranceNumberLast4: text('insurance_number_last4'),
    emergencyContactIds: uuids('emergency_contact_ids'),
    doctorContactId: uuid('doctor_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('emergency_cards_member_uq').on(t.householdId, t.memberId),
    tenantPolicy('emergency_cards'),
  ],
).enableRLS();

// ---------------------------------------------------------------- health

export const vaccinations = pgTable(
  'vaccinations',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    vaccine: text('vaccine').notNull(),
    givenOn: day('given_on').notNull(),
    dose: text('dose'),
    nextDueOn: day('next_due_on'),
    doctorContactId: uuid('doctor_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    batch: text('batch'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('vaccinations_member_idx').on(t.householdId, t.memberId),
    tenantPolicy('vaccinations'),
  ],
).enableRLS();

export const medications = pgTable(
  'medications',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    name: text('name').notNull(),
    dose: text('dose'),
    /** Intake times "HH:MM" in `timezone`, repeated by `rrule`. */
    times: texts('times'),
    rrule: text('rrule').notNull().default('FREQ=DAILY'),
    timezone: text('timezone').notNull(),
    startOn: day('start_on').notNull(),
    endOn: day('end_on'),
    reminders: boolean('reminders').notNull().default(true),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('medications_member_idx').on(t.householdId, t.memberId),
    tenantPolicy('medications'),
  ],
).enableRLS();

/** Completed pediatric check-ups (U1–U9, J1, J2); windows are computed in the domain. */
export const checkupRecords = pgTable(
  'checkup_records',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    code: text('code').notNull(),
    doneOn: day('done_on').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('checkup_records_uq').on(t.householdId, t.memberId, t.code),
    tenantPolicy('checkup_records'),
  ],
).enableRLS();

// ---------------------------------------------------------------- kids & school

export const timetableEntries = pgTable(
  'timetable_entries',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    /** ISO weekday 1 (Mon) … 7 (Sun). */
    weekday: integer('weekday').notNull(),
    period: integer('period').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    subject: text('subject').notNull(),
    room: text('room'),
    teacher: text('teacher'),
    validFrom: day('valid_from'),
    validTo: day('valid_to'),
    week: text('week', { enum: ['A', 'B'] }),
    createdAt: createdAt(),
  },
  (t) => [
    index('timetable_member_idx').on(t.householdId, t.memberId, t.weekday),
    tenantPolicy('timetable_entries'),
  ],
).enableRLS();

export const schoolSettings = pgTable(
  'school_settings',
  {
    householdId: uuid('household_id')
      .primaryKey()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Bundesland code, e.g. "BY". */
    state: text('state'),
    /** A Monday of an "A" week for A/B timetables. */
    abWeekAnchor: day('ab_week_anchor'),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy('school_settings')],
).enableRLS();

/** Global cache of public school holidays per state and year (not tenant data). */
export const schoolHolidayCache = pgTable(
  'school_holiday_cache',
  {
    state: text('state').notNull(),
    year: integer('year').notNull(),
    holidays: jsonb('holidays').$type<{ name: string; start: string; end: string }[]>().notNull(),
    source: text('source').notNull(),
    fetchedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.state, t.year] })],
);

// ---------------------------------------------------------------- home & vehicles

export const assets = pgTable(
  'assets',
  {
    id: id(),
    householdId: householdId(),
    kind: text('kind', { enum: ['home', 'vehicle', 'appliance', 'other'] }).notNull(),
    name: text('name').notNull(),
    details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
    purchaseDate: day('purchase_date'),
    warrantyUntil: day('warranty_until'),
    receiptFileIds: uuids('receipt_file_ids'),
    /** Purchase transaction in finance (by id; modules don't share tables). */
    transactionId: uuid('transaction_id'),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('assets_household_idx').on(t.householdId, t.kind), tenantPolicy('assets')],
).enableRLS();

export interface MaintenanceRecurrenceJson {
  mode: 'interval' | 'rrule';
  months?: number;
  rrule?: string;
}

export const maintenancePlans = pgTable(
  'maintenance_plans',
  {
    id: id(),
    householdId: householdId(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    templateKey: text('template_key'),
    recurrence: jsonb('recurrence').$type<MaintenanceRecurrenceJson>().notNull(),
    /** First due date; anchors rule-based schedules. */
    anchorOn: day('anchor_on').notNull(),
    nextDueOn: day('next_due_on'),
    leadDays: integer('lead_days').notNull().default(14),
    lastDoneOn: day('last_done_on'),
    assigneeMemberId: uuid('assignee_member_id'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('maintenance_plans_asset_idx').on(t.householdId, t.assetId),
    index('maintenance_plans_due_idx').on(t.nextDueOn),
    tenantPolicy('maintenance_plans'),
  ],
).enableRLS();

export const maintenanceLogs = pgTable(
  'maintenance_logs',
  {
    id: id(),
    householdId: householdId(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: 'cascade' }),
    doneOn: day('done_on').notNull(),
    dueOn: day('due_on'),
    costMinor: bigint('cost_minor', { mode: 'number' }),
    notes: text('notes'),
    memberId: uuid('member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('maintenance_logs_plan_idx').on(t.householdId, t.planId),
    tenantPolicy('maintenance_logs'),
  ],
).enableRLS();

export const meterReadings = pgTable(
  'meter_readings',
  {
    id: id(),
    householdId: householdId(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    meterType: text('meter_type', {
      enum: ['electricity', 'gas', 'water', 'heating', 'mileage', 'other'],
    }).notNull(),
    value: numeric('value', { precision: 15, scale: 3 }).notNull(),
    unit: text('unit').notNull(),
    readAt: ts('read_at').notNull(),
    note: text('note'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('meter_readings_asset_idx').on(t.householdId, t.assetId, t.meterType, t.readAt),
    tenantPolicy('meter_readings'),
  ],
).enableRLS();

// ---------------------------------------------------------------- location sharing (opt-in)

export const locationShares = pgTable(
  'location_shares',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    /** null = all household members with location access; otherwise these members only. */
    sharedWith: uuid('shared_with').array(),
    startedAt: ts('started_at').notNull().defaultNow(),
    until: ts('until').notNull(),
    active: boolean('active').notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('location_shares_member_uq').on(t.householdId, t.memberId),
    tenantPolicy('location_shares'),
  ],
).enableRLS();

/** Latest fix plus at most 24 h of history (retention job deletes older rows). */
export const locationPings = pgTable(
  'location_pings',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    accuracyM: doublePrecision('accuracy_m').notNull(),
    at: ts('at').notNull(),
  },
  (t) => [
    index('location_pings_member_idx').on(t.householdId, t.memberId, t.at),
    index('location_pings_at_idx').on(t.at),
    tenantPolicy('location_pings'),
  ],
).enableRLS();

export const places = pgTable(
  'places',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    radiusM: integer('radius_m').notNull().default(100),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('places_household_idx').on(t.householdId), tenantPolicy('places')],
).enableRLS();

/** Subscriber gets arrived/left notifications for `targetMemberId` (null = anyone sharing). */
export const placeSubscriptions = pgTable(
  'place_subscriptions',
  {
    id: id(),
    householdId: householdId(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    subscriberMemberId: uuid('subscriber_member_id').notNull(),
    targetMemberId: uuid('target_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('place_subscriptions_uq')
      .on(t.placeId, t.subscriberMemberId, t.targetMemberId)
      .nullsNotDistinct(),
    tenantPolicy('place_subscriptions'),
  ],
).enableRLS();

/** Last known geofence state per member and place (for hysteresis). */
export const placePresence = pgTable(
  'place_presence',
  {
    householdId: householdId(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    state: text('state', { enum: ['inside', 'outside'] }).notNull(),
    changedAt: ts('changed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.memberId] }), tenantPolicy('place_presence')],
).enableRLS();
