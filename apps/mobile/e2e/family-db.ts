import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Test-only DB access for plan upgrades (there is no API to change the plan without Stripe).
 *
 * Uses node-postgres from the workspace (`packages/db/node_modules/pg`, mobile does not depend on
 * it) and the owner connection `DATABASE_MIGRATION_URL` from the repo-root `.env` (the API's own
 * role is RLS-restricted). Works against the local Docker stack; alternative without pg:
 *   docker exec <postgres-container> psql -U fp family_planer -c "update households set plan='pro' where name='...'"
 */
const repoRoot = join(__dirname, '..', '..', '..');

function databaseUrl(): string {
  if (process.env.DATABASE_MIGRATION_URL) return process.env.DATABASE_MIGRATION_URL;
  const env = readFileSync(join(repoRoot, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_MIGRATION_URL='));
  if (!line) throw new Error('DATABASE_MIGRATION_URL missing in .env');
  return line.slice('DATABASE_MIGRATION_URL='.length).trim();
}

interface PgClient {
  connect: () => Promise<void>;
  query: (sql: string, params: unknown[]) => Promise<{ rowCount: number | null }>;
  end: () => Promise<void>;
}

/** Sets the plan of the household with this (unique) name; entitlements follow the plan. */
export async function setHouseholdPlan(
  householdName: string,
  plan: 'free' | 'plus' | 'pro',
): Promise<void> {
  const requireFromDb = createRequire(join(repoRoot, 'packages', 'db', 'package.json'));
  const { Client } = requireFromDb('pg') as { Client: new (o: object) => PgClient };
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const res = await client.query('update households set plan = $1 where name = $2', [
      plan,
      householdName,
    ]);
    if (res.rowCount !== 1) throw new Error(`Household "${householdName}" not found`);
  } finally {
    await client.end();
  }
}
