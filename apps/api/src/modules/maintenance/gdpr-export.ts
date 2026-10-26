import { schema } from '@fp/db';
import { type Action, can, type MemberRole, type Module } from '@fp/domain/permissions';
import { eq, getTableColumns, getTableName, is } from 'drizzle-orm';
import { type AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

/** Tables exported explicitly by the GDPR export (with their own filtering) or never exported. */
const SKIP = new Set([
  'households',
  'household_members',
  'events',
  'tasks',
  'lists',
  'list_items',
  'fin_accounts',
  'fin_transactions',
  'files',
  'outbox',
  'sent_reminders',
  'invitations',
  'subscriptions',
  'support_access_grants',
  'assistant_requests',
  'fin_budget_alerts',
  'place_presence',
  'location_pings',
  'school_holiday_cache',
  'idempotency_keys',
]);

/** Table-name prefix → module whose read permission governs the export. */
const MODULE_BY_PREFIX: [RegExp, Module][] = [
  [/^(fin_|bank_)/, 'finance'],
  [/^vault_/, 'vault'],
  [/^(recipes|meal_)/, 'meals'],
  [/^(reward|allowance)/, 'rewards'],
  [/^(board_|poll)/, 'pinboard'],
  [/^trip/, 'travel'],
  [/^album/, 'photos'],
  [/^(contacts|emergency_)/, 'contacts'],
  [/^(vaccinations|medications|checkup)/, 'health'],
  [/^(timetable|school_)/, 'school'],
  [/^(assets|maintenance_|meter_)/, 'home'],
  [/^(location_|places|place_)/, 'location'],
  [/^assistant_/, 'assistant'],
  [/^(calendar|google_|event_)/, 'calendar'],
  [/^item_history/, 'lists'],
  [/^folders/, 'storage'],
];

/** Encrypted values, tokens and hashes never leave the system, not even in exports. */
const SECRET_COLUMN = /(enc|encrypted|secret|token|hash|ciphertext)$/i;
const OWNER_KEYS = [
  'ownerMemberId',
  'createdByMemberId',
  'authorMemberId',
  'holderMemberId',
  'memberId',
];

export interface ExportMember {
  id: string;
  role: MemberRole;
  grantedModules: Module[] | null;
  accessUntil: Date | null;
}

type Row = Record<string, unknown>;

function moduleOf(table: string): Module {
  return MODULE_BY_PREFIX.find(([re]) => re.test(table))?.[1] ?? 'household';
}

/** Keeps rows the member may see: no private items of other members. */
export function visibleToMember(row: Row, memberId: string): boolean {
  if (row.visibility === 'private') return OWNER_KEYS.some((k) => row[k] === memberId);
  if (row.visibility === 'members') {
    const shared = row.sharedWith;
    return (
      OWNER_KEYS.some((k) => row[k] === memberId) ||
      (Array.isArray(shared) && shared.includes(memberId))
    );
  }
  return true;
}

export function stripSecrets(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET_COLUMN.test(k)));
}

/**
 * Every household-scoped table not exported explicitly, filtered by the member's module
 * permissions and item visibility. New modules are included automatically.
 */
export async function exportModuleTables(
  db: { select: () => { from: (t: PgTable) => { where: (w: unknown) => Promise<Row[]> } } },
  householdId: string,
  member: ExportMember,
): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const name = getTableName(table);
    const columns = getTableColumns(table) as Record<string, AnyPgColumn>;
    const householdCol = columns.householdId;
    if (!householdCol || SKIP.has(name)) continue;
    const action = `${moduleOf(name)}.read` as Action;
    if (
      !can(
        {
          memberId: member.id,
          role: member.role,
          grantedModules: member.grantedModules,
          accessUntil: member.accessUntil,
        },
        action,
      )
    ) {
      continue;
    }
    const rows = await db.select().from(table).where(eq(householdCol, householdId));
    const visible = rows.filter((r) => visibleToMember(r, member.id)).map(stripSecrets);
    if (visible.length > 0) out[name] = visible;
  }
  return out;
}
