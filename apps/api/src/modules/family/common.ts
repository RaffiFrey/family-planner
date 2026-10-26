import { householdMembers, type Transaction } from '@fp/db';
import { and, inArray, isNull } from 'drizzle-orm';
import { badRequest, forbidden, planLimit } from '../../common/errors.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { entitlementsFor } from '../billing/entitlements.js';

const ADULT_ROLES = new Set(['owner', 'admin', 'adult']);

/** Owners, admins and adults manage rewards, approve redemptions and moderate shared content. */
export function isAdult(ctx: HouseholdContext): boolean {
  return ADULT_ROLES.has(ctx.member.role);
}

export function requireAdult(ctx: HouseholdContext): void {
  if (!isAdult(ctx)) throw forbidden('Only adults can do this');
}

export function hasRewards(plan: string): boolean {
  return entitlementsFor(plan).features.includes('rewards');
}

export function requireRewards(ctx: HouseholdContext): void {
  if (!hasRewards(ctx.household.plan))
    throw planLimit('Rewards and pocket money are part of Family Plus');
}

export function householdLocale(ctx: HouseholdContext): 'de' | 'en' {
  return ctx.household.locale === 'en' ? 'en' : 'de';
}

/** Throws 400 unless every id is an active member of the (RLS-scoped) household. */
export async function assertMembers(
  tx: Transaction,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return;
  const found = await tx
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(inArray(householdMembers.id, unique), isNull(householdMembers.removedAt)));
  if (found.length !== unique.length) throw badRequest('Unknown member', 'invalid_member');
}

export function excerpt(text: string, max = 80): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
