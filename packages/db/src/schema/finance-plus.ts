import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tenantPolicy, ts, updatedAt } from './_helpers.js';
import { households } from './core.js';
import { finAccounts, finCategories, finTransactions } from './modules.js';

const householdId = () =>
  uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
const minor = (name: string) => bigint(name, { mode: 'number' });

const INTERVALS = ['weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'] as const;

// ---------------------------------------------------------------- contracts

/**
 * Contracts and subscriptions ("Verträge"). Suggestions detected from transactions are not
 * stored until confirmed; dismissed suggestions are kept with status `dismissed` so they stay
 * hidden.
 */
export const finContracts = pgTable(
  'fin_contracts',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    contractType: text('contract_type', {
      enum: ['subscription', 'insurance', 'utility', 'loan', 'other'],
    }).notNull(),
    status: text('status', { enum: ['active', 'cancelled', 'dismissed'] })
      .notNull()
      .default('active'),
    /** Normalised counterparty (`iban:…` / `name:…`) used to match transactions. */
    counterpartyKey: text('counterparty_key'),
    counterpartyName: text('counterparty_name'),
    direction: text('direction', { enum: ['in', 'out'] })
      .notNull()
      .default('out'),
    /** Positive amount per interval. */
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    interval: text('interval', { enum: INTERVALS }).notNull(),
    categoryId: uuid('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
    startDate: date('start_date', { mode: 'string' }),
    nextDueDate: date('next_due_date', { mode: 'string' }),
    minimumTermEnd: date('minimum_term_end', { mode: 'string' }),
    noticePeriodDays: integer('notice_period_days'),
    /** Date the cancellation takes effect. */
    endDate: date('end_date', { mode: 'string' }),
    providerName: text('provider_name'),
    providerContact: text('provider_contact'),
    /** Contract / policy / customer number, AES-GCM encrypted. */
    contractNumberEncrypted: text('contract_number_encrypted'),
    notes: text('notes'),
    source: text('source', { enum: ['manual', 'detected'] })
      .notNull()
      .default('manual'),
    confidence: doublePrecision('confidence'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('fin_contracts_household_idx').on(t.householdId, t.status),
    tenantPolicy('fin_contracts'),
  ],
).enableRLS();

// ---------------------------------------------------------------- goals

export const finGoals = pgTable(
  'fin_goals',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    targetMinor: minor('target_minor').notNull(),
    currency: text('currency').notNull(),
    deadline: date('deadline', { mode: 'string' }),
    /** When set, progress is the balance of this (savings) account. */
    accountId: uuid('account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
    color: text('color'),
    icon: text('icon'),
    archived: boolean('archived').notNull().default(false),
    /** Set once when the target is reached (notification fires once). */
    reachedAt: ts('reached_at'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('fin_goals_household_idx').on(t.householdId), tenantPolicy('fin_goals')],
).enableRLS();

export const finGoalContributions = pgTable(
  'fin_goal_contributions',
  {
    id: id(),
    householdId: householdId(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => finGoals.id, { onDelete: 'cascade' }),
    /** Negative for withdrawals. */
    amountMinor: minor('amount_minor').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    memberId: uuid('member_id'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('fin_goal_contributions_goal_idx').on(t.goalId),
    tenantPolicy('fin_goal_contributions'),
  ],
).enableRLS();

// ---------------------------------------------------------------- shared expenses

/** Who takes part in shared expenses: household members (one row each) or external people. */
export const finExpenseParties = pgTable(
  'fin_expense_parties',
  {
    id: id(),
    householdId: householdId(),
    name: text('name').notNull(),
    memberId: uuid('member_id'),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('fin_expense_parties_member_uq').on(t.householdId, t.memberId),
    tenantPolicy('fin_expense_parties'),
  ],
).enableRLS();

export const finSharedExpenses = pgTable(
  'fin_shared_expenses',
  {
    id: id(),
    householdId: householdId(),
    title: text('title').notNull(),
    /** Positive total. */
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    paidByPartyId: uuid('paid_by_party_id')
      .notNull()
      .references(() => finExpenseParties.id, { onDelete: 'restrict' }),
    splitMethod: text('split_method', { enum: ['equal', 'exact', 'percent', 'shares'] }).notNull(),
    transactionId: uuid('transaction_id').references(() => finTransactions.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('fin_shared_expenses_household_idx').on(t.householdId, t.date),
    tenantPolicy('fin_shared_expenses'),
  ],
).enableRLS();

export const finExpenseShares = pgTable(
  'fin_expense_shares',
  {
    id: id(),
    householdId: householdId(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => finSharedExpenses.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => finExpenseParties.id, { onDelete: 'restrict' }),
    /** Input value of the split (percent, weight or exact amount); null for equal splits. */
    value: doublePrecision('value'),
    amountMinor: minor('amount_minor').notNull(),
  },
  (t) => [
    uniqueIndex('fin_expense_shares_uq').on(t.expenseId, t.partyId),
    tenantPolicy('fin_expense_shares'),
  ],
).enableRLS();

export const finSettlements = pgTable(
  'fin_settlements',
  {
    id: id(),
    householdId: householdId(),
    fromPartyId: uuid('from_party_id')
      .notNull()
      .references(() => finExpenseParties.id, { onDelete: 'restrict' }),
    toPartyId: uuid('to_party_id')
      .notNull()
      .references(() => finExpenseParties.id, { onDelete: 'restrict' }),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('fin_settlements_household_idx').on(t.householdId),
    tenantPolicy('fin_settlements'),
  ],
).enableRLS();

// ---------------------------------------------------------------- bank sync (PSD2)

/**
 * A consent at a licensed aggregator (finAPI …) for one bank login. Provider identifiers and
 * credentials are encrypted (ADR-0007); `state_hash` identifies the pending web-form callback.
 */
export const bankConnections = pgTable(
  'bank_connections',
  {
    id: id(),
    householdId: householdId(),
    provider: text('provider', { enum: ['mock', 'finapi'] }).notNull(),
    bankId: text('bank_id').notNull(),
    bankName: text('bank_name').notNull(),
    status: text('status', { enum: ['pending', 'active', 'error', 'expired'] })
      .notNull()
      .default('pending'),
    externalIdEncrypted: text('external_id_encrypted'),
    externalUserEncrypted: text('external_user_encrypted'),
    /** Provider-specific secret (e.g. finAPI user password), encrypted. */
    secretEncrypted: text('secret_encrypted'),
    /** Provider id of the pending bank-login flow (web form), encrypted; cleared on completion. */
    pendingRefEncrypted: text('pending_ref_encrypted'),
    /** SHA-256 of the callback `state` token while the bank login is pending. */
    stateHash: text('state_hash'),
    lastSyncedAt: ts('last_synced_at'),
    lastError: text('last_error'),
    consentExpiresAt: ts('consent_expires_at'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('bank_connections_household_idx').on(t.householdId),
    uniqueIndex('bank_connections_state_uq').on(t.stateHash),
    tenantPolicy('bank_connections'),
  ],
).enableRLS();

/** Accounts reported by the provider and their mapping to `fin_accounts` (source `sync`). */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: id(),
    householdId: householdId(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    externalIdEncrypted: text('external_id_encrypted').notNull(),
    /** SHA-256 of the provider account id, for upserts without decrypting. */
    externalKey: text('external_key').notNull(),
    name: text('name').notNull(),
    ibanEncrypted: text('iban_encrypted'),
    ibanLast4: text('iban_last4'),
    currency: text('currency').notNull(),
    type: text('type', {
      enum: ['checking', 'savings', 'cash', 'credit_card', 'depot', 'loan', 'other'],
    }).notNull(),
    accountId: uuid('account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
    lastSyncedAt: ts('last_synced_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('bank_accounts_external_uq').on(t.connectionId, t.externalKey),
    tenantPolicy('bank_accounts'),
  ],
).enableRLS();
