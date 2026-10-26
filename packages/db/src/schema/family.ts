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
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tenantPolicy, ts, updatedAt } from './_helpers.js';
import { households } from './core.js';
import { files, finAccounts, finCategories, lists } from './modules.js';

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
const uuids = (name: string) =>
  uuid(name)
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`);
const minor = (name: string) => bigint(name, { mode: 'number' });

// ---------------------------------------------------------------- meals & recipes

export interface RecipeIngredientJson {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  /** Shopping aisle category (see ITEM_CATEGORIES). */
  category: string;
}

export const recipes = pgTable(
  'recipes',
  {
    id: id(),
    householdId: householdId(),
    title: text('title').notNull(),
    description: text('description'),
    servings: integer('servings'),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    ingredients: jsonb('ingredients').$type<RecipeIngredientJson[]>().notNull().default([]),
    steps: jsonb('steps').$type<string[]>().notNull().default([]),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceUrl: text('source_url'),
    imageFileId: uuid('image_file_id').references(() => files.id, { onDelete: 'set null' }),
    /** Remote image found during URL import (not fetched by the server). */
    imageUrl: text('image_url'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('recipes_household_idx').on(t.householdId, t.title), tenantPolicy('recipes')],
).enableRLS();

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: id(),
    householdId: householdId(),
    date: date('date', { mode: 'string' }).notNull(),
    slot: text('slot', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }).notNull(),
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    /** Free text, or a snapshot of the recipe title. */
    title: text('title').notNull(),
    servings: integer('servings'),
    cookMemberId: uuid('cook_member_id'),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('meal_plan_entries_slot_uq').on(t.householdId, t.date, t.slot),
    tenantPolicy('meal_plan_entries'),
  ],
).enableRLS();

// ---------------------------------------------------------------- rewards & pocket money

export const rewards = pgTable(
  'rewards',
  {
    id: id(),
    householdId: householdId(),
    title: text('title').notNull(),
    description: text('description'),
    costPoints: integer('cost_points').notNull(),
    icon: text('icon'),
    active: boolean('active').notNull().default(true),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('rewards_household_idx').on(t.householdId), tenantPolicy('rewards')],
).enableRLS();

export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: id(),
    householdId: householdId(),
    rewardId: uuid('reward_id').references(() => rewards.id, { onDelete: 'set null' }),
    /** Snapshot so history survives catalogue changes. */
    rewardTitle: text('reward_title').notNull(),
    costPoints: integer('cost_points').notNull(),
    memberId: uuid('member_id').notNull(),
    status: text('status', { enum: ['requested', 'approved', 'rejected', 'cancelled'] })
      .notNull()
      .default('requested'),
    note: text('note'),
    decidedByMemberId: uuid('decided_by_member_id'),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reward_redemptions_household_idx').on(t.householdId, t.status, t.createdAt),
    tenantPolicy('reward_redemptions'),
  ],
).enableRLS();

/** Points ledger; the balance is the sum of `delta` per member. */
export const rewardPoints = pgTable(
  'reward_points',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    taskId: uuid('task_id'),
    rewardId: uuid('reward_id'),
    redemptionId: uuid('redemption_id').references(() => rewardRedemptions.id, {
      onDelete: 'set null',
    }),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reward_points_member_idx').on(t.householdId, t.memberId, t.createdAt),
    // Points for a completed task are awarded once, even if the event is delivered twice.
    uniqueIndex('reward_points_task_uq')
      .on(t.taskId)
      .where(sql`task_id is not null`),
    tenantPolicy('reward_points'),
  ],
).enableRLS();

export const allowanceRules = pgTable(
  'allowance_rules',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    interval: text('interval', { enum: ['weekly', 'monthly'] }).notNull(),
    /** ISO weekday 1–7 (weekly). */
    weekday: smallint('weekday'),
    /** 1–31, clamped to month end (monthly). */
    dayOfMonth: smallint('day_of_month'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    active: boolean('active').notNull().default(true),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('allowance_rules_household_idx').on(t.householdId),
    tenantPolicy('allowance_rules'),
  ],
).enableRLS();

export const allowanceLedger = pgTable(
  'allowance_ledger',
  {
    id: id(),
    householdId: householdId(),
    memberId: uuid('member_id').notNull(),
    /** Signed: payouts/bonuses positive, expenses negative. */
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    kind: text('kind', { enum: ['payout', 'bonus', 'expense', 'correction'] }).notNull(),
    note: text('note'),
    date: date('date', { mode: 'string' }).notNull(),
    ruleId: uuid('rule_id').references(() => allowanceRules.id, { onDelete: 'set null' }),
    /** Scheduled payouts: one per rule and period (ISO week / month). */
    periodKey: text('period_key'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('allowance_ledger_member_idx').on(t.householdId, t.memberId, t.date),
    uniqueIndex('allowance_ledger_period_uq')
      .on(t.ruleId, t.periodKey)
      .where(sql`rule_id is not null and period_key is not null`),
    tenantPolicy('allowance_ledger'),
  ],
).enableRLS();

// ---------------------------------------------------------------- pinboard & polls

export const boardPosts = pgTable(
  'board_posts',
  {
    id: id(),
    householdId: householdId(),
    text: text('text').notNull(),
    color: text('color'),
    pinned: boolean('pinned').notNull().default(false),
    expiresAt: ts('expires_at'),
    attachmentFileIds: uuids('attachment_file_ids'),
    authorMemberId: uuid('author_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('board_posts_feed_idx').on(t.householdId, t.pinned, t.createdAt),
    tenantPolicy('board_posts'),
  ],
).enableRLS();

export const boardReactions = pgTable(
  'board_reactions',
  {
    householdId: householdId(),
    postId: uuid('post_id')
      .notNull()
      .references(() => boardPosts.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('board_reactions_uq').on(t.postId, t.memberId, t.emoji),
    tenantPolicy('board_reactions'),
  ],
).enableRLS();

export const polls = pgTable(
  'polls',
  {
    id: id(),
    householdId: householdId(),
    question: text('question').notNull(),
    options: jsonb('options').$type<string[]>().notNull(),
    multiple: boolean('multiple').notNull().default(false),
    anonymous: boolean('anonymous').notNull().default(false),
    closesAt: ts('closes_at'),
    closedAt: ts('closed_at'),
    authorMemberId: uuid('author_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('polls_household_idx').on(t.householdId, t.createdAt), tenantPolicy('polls')],
).enableRLS();

export const pollVotes = pgTable(
  'poll_votes',
  {
    householdId: householdId(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    optionIndex: smallint('option_index').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('poll_votes_uq').on(t.pollId, t.memberId, t.optionIndex),
    tenantPolicy('poll_votes'),
  ],
).enableRLS();

// ---------------------------------------------------------------- travel

export const trips = pgTable(
  'trips',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    destination: text('destination'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    budgetMinor: minor('budget_minor'),
    currency: text('currency').notNull(),
    financeCategoryId: uuid('finance_category_id').references(() => finCategories.id, {
      onDelete: 'set null',
    }),
    financeAccountId: uuid('finance_account_id').references(() => finAccounts.id, {
      onDelete: 'set null',
    }),
    memberIds: uuids('member_ids'),
    packingListId: uuid('packing_list_id').references(() => lists.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('trips_household_idx').on(t.householdId, t.startDate), tenantPolicy('trips')],
).enableRLS();

export const tripItems = pgTable(
  'trip_items',
  {
    id: id(),
    householdId: householdId(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['flight', 'train', 'car', 'hotel', 'activity', 'note'],
    }).notNull(),
    title: text('title').notNull(),
    startAt: ts('start_at'),
    endAt: ts('end_at'),
    location: text('location'),
    /** Booking reference, AES-GCM encrypted (field-level encryption, ADR-0007). */
    confirmationCodeEncrypted: text('confirmation_code_encrypted'),
    notes: text('notes'),
    attachmentFileIds: uuids('attachment_file_ids'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('trip_items_trip_idx').on(t.tripId, t.startAt), tenantPolicy('trip_items')],
).enableRLS();

// ---------------------------------------------------------------- photos

export const albums = pgTable(
  'albums',
  {
    id: id(),
    householdId: householdId(),
    title: text('title').notNull(),
    description: text('description'),
    coverFileId: uuid('cover_file_id').references(() => files.id, { onDelete: 'set null' }),
    visibility: text('visibility', { enum: ['household', 'private', 'members'] })
      .notNull()
      .default('household'),
    sharedWith: uuid('shared_with').array(),
    ownerMemberId: uuid('owner_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('albums_household_idx').on(t.householdId), tenantPolicy('albums')],
).enableRLS();

export const albumItems = pgTable(
  'album_items',
  {
    id: id(),
    householdId: householdId(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    takenAt: ts('taken_at'),
    position: doublePrecision('position').notNull(),
    addedByMemberId: uuid('added_by_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('album_items_file_uq').on(t.albumId, t.fileId),
    index('album_items_album_idx').on(t.albumId, t.position),
    index('album_items_taken_idx').on(t.householdId, t.takenAt),
    tenantPolicy('album_items'),
  ],
).enableRLS();
