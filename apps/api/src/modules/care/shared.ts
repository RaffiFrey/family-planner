import type { Entitlements } from '@fp/contracts';
import { householdMembers, households, sentReminders, type Transaction } from '@fp/db';
import { type Action, can } from '@fp/domain/permissions';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { badRequest, notFound, planLimit } from '../../common/errors.js';
import { type HouseholdContext, memberCtx } from '../../common/request-context.js';
import type { Db } from '../../infra/database.js';
import { entitlementsFor } from '../billing/entitlements.js';

export type MemberRow = typeof householdMembers.$inferSelect;
type Feature = Entitlements['features'][number];

/** Plan gate for paid features ('vault', 'ocr'). */
export function requireFeature(ctx: HouseholdContext, feature: Feature, label: string): void {
  if (!entitlementsFor(ctx.household.plan).features.includes(feature)) {
    throw planLimit(`${label} requires Family Plus`);
  }
}

export function hasFeature(plan: string, feature: Feature): boolean {
  return entitlementsFor(plan).features.includes(feature);
}

/** Whether the caller may perform `action` (used for field-level decisions). */
export function allowed(ctx: HouseholdContext, action: Action): boolean {
  return can(memberCtx(ctx), action);
}

export function isAdultRole(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'adult';
}

/** Loads an active member of the current household or throws 404. */
export async function loadMember(tx: Transaction, memberId: string): Promise<MemberRow> {
  const [m] = await tx
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.id, memberId), isNull(householdMembers.removedAt)));
  if (!m) throw notFound('Member');
  return m;
}

/** Validates that all ids are active members of the current household. */
export async function assertMembers(tx: Transaction, ids: readonly (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  if (unique.length === 0) return;
  const rows = await tx
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(inArray(householdMembers.id, unique), isNull(householdMembers.removedAt)));
  if (rows.length !== unique.length) throw badRequest('Unknown member', 'unknown_member');
}

/** Records a one-time send for system jobs; false when it was already sent. */
export async function once(db: Db, householdId: string, key: string): Promise<boolean> {
  const rows = await db.system
    .insert(sentReminders)
    .values({ householdId, key })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}

/** Active, non-deleted households with their time zone and plan. */
export async function activeHouseholds(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, { timezone: string; plan: string }>> {
  const result = new Map<string, { timezone: string; plan: string }>();
  if (ids.length === 0) return result;
  const rows = await db.system
    .select({ id: households.id, timezone: households.timezone, plan: households.plan })
    .from(households)
    .where(and(inArray(households.id, [...new Set(ids)]), isNull(households.deletedAt)));
  for (const r of rows) result.set(r.id, { timezone: r.timezone, plan: r.plan });
  return result;
}

/** Member names by id (system connection, for notifications). */
export async function memberNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const rows = await db.system
    .select({ id: householdMembers.id, name: householdMembers.displayName })
    .from(householdMembers)
    .where(inArray(householdMembers.id, [...new Set(ids)]));
  for (const r of rows) result.set(r.id, r.name);
  return result;
}

/** Adults (owner/admin/adult) of a household, the default recipients of household reminders. */
export async function adultMemberIds(db: Db, householdId: string): Promise<string[]> {
  const rows = await db.system
    .select({ id: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), isNull(householdMembers.removedAt)));
  return rows.filter((r) => isAdultRole(r.role)).map((r) => r.id);
}
