import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything that can run queries: the pool-backed db or a transaction. */
export type Executor = Database | Transaction;

// Return BIGINT/NUMERIC counts as JS numbers; amounts are validated as safe integers.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(
  connectionString: string,
  options: { max?: number; applicationName?: string } = {},
): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'family-planer',
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}

/**
 * Runs `fn` in a transaction scoped to one household. With the `fp_app` role, Postgres RLS
 * guarantees queries only see that household's rows even if a WHERE clause is forgotten.
 */
export async function withTenant<T>(
  db: Database,
  householdId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.household_id', ${householdId}, true)`);
    return fn(tx);
  });
}
