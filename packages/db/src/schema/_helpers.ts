import { sql } from 'drizzle-orm';
import { pgPolicy, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** UUIDv7 primary key: sortable and safe to generate on clients for optimistic creates. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true, mode: 'date' });
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Current tenant as set per transaction by `withTenant` (empty → no rows). */
export const CURRENT_HOUSEHOLD = sql`nullif(current_setting('app.household_id', true), '')::uuid`;

/**
 * Row-level security: the runtime role `fp_app` only sees rows of the household set in
 * `app.household_id`. System jobs use `fp_system` (BYPASSRLS). See ADR-0003.
 */
export const tenantPolicy = (table: string, column = 'household_id') =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: 'permissive',
    for: 'all',
    to: 'fp_app',
    using: sql`${sql.identifier(column)} = ${CURRENT_HOUSEHOLD}`,
    withCheck: sql`${sql.identifier(column)} = ${CURRENT_HOUSEHOLD}`,
  });

/** Tables holding global (household_id IS NULL) defaults plus tenant rows; globals are read-only. */
export const tenantOrGlobalPolicies = (table: string) => [
  pgPolicy(`${table}_read`, {
    as: 'permissive',
    for: 'select',
    to: 'fp_app',
    using: sql`household_id is null or household_id = ${CURRENT_HOUSEHOLD}`,
  }),
  pgPolicy(`${table}_write`, {
    as: 'permissive',
    for: 'all',
    to: 'fp_app',
    using: sql`household_id = ${CURRENT_HOUSEHOLD}`,
    withCheck: sql`household_id = ${CURRENT_HOUSEHOLD}`,
  }),
];
