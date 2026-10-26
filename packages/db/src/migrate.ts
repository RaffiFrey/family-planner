import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, type Database } from './client.js';

/**
 * Runtime roles (ADR-0003):
 * - fp_app: used for request handling, subject to row-level security
 * - fp_system: workers, auth and admin; BYPASSRLS
 * The migration role owns the tables.
 */
export async function ensureRoles(
  db: Database,
  passwords: { app: string; system: string },
): Promise<void> {
  const create = async (role: string, password: string, bypass: boolean) => {
    const exists = await db.execute<{ n: number }>(
      sql`select 1 as n from pg_roles where rolname = ${role}`,
    );
    const pw = sql.raw(`'${password.replace(/'/g, "''")}'`);
    const attrs = sql.raw(bypass ? 'LOGIN BYPASSRLS' : 'LOGIN NOBYPASSRLS');
    if (exists.rows.length === 0) {
      await db.execute(sql`create role ${sql.identifier(role)} ${attrs} password ${pw}`);
    } else {
      await db.execute(sql`alter role ${sql.identifier(role)} ${attrs} password ${pw}`);
    }
  };
  await create('fp_app', passwords.app, false);
  await create('fp_system', passwords.system, true);
}

export async function grantRuntimeRoles(db: Database): Promise<void> {
  await db.execute(sql`grant usage on schema public to fp_app, fp_system`);
  await db.execute(
    sql`grant select, insert, update, delete on all tables in schema public to fp_app, fp_system`,
  );
  await db.execute(sql`grant usage, select on all sequences in schema public to fp_app, fp_system`);
  // The app role must not touch auth, staff or billing internals directly.
  await db.execute(
    sql`revoke all on table "user", "session", "account", "verification", "passkey", "two_factor", staff_users, staff_sessions, staff_audit_log, feature_flags, gdpr_requests from fp_app`,
  );
  await db.execute(sql`grant select on table "user", feature_flags, announcements to fp_app`);
}

export async function runMigrations(
  migrationUrl: string,
  passwords: { app: string; system: string },
  migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url)),
): Promise<void> {
  const handle = createDb(migrationUrl, { max: 1, applicationName: 'fp-migrate' });
  try {
    await ensureRoles(handle.db, passwords);
    await migrate(handle.db, { migrationsFolder });
    await grantRuntimeRoles(handle.db);
  } finally {
    await handle.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL is required');
  await runMigrations(url, {
    app: process.env.DB_APP_PASSWORD ?? 'fp_app',
    system: process.env.DB_SYSTEM_PASSWORD ?? 'fp_system',
  });
  console.log('Migrations applied');
}
