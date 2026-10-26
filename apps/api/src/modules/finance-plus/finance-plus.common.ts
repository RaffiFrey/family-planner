import type { Entitlements } from '@fp/contracts';
import { type Database, finAccounts, householdMembers, sentReminders } from '@fp/db';
import { type CurrencyCode, isCurrencyCode } from '@fp/domain/money';
import { toLocalDate } from '@fp/domain/time';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { planLimit } from '../../common/errors.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { visibleTo } from '../../common/visibility.js';
import { entitlementsFor } from '../billing/entitlements.js';

export type Feature = Entitlements['features'][number];

/** Throws 402 unless the household's plan includes `feature`. */
export function requireFeature(ctx: HouseholdContext, feature: Feature): void {
  if (!hasFeature(ctx.household.plan, feature))
    throw planLimit(`This feature requires a plan with "${feature}"`);
}

export function hasFeature(plan: string, feature: Feature): boolean {
  return entitlementsFor(plan).features.includes(feature);
}

/** Accounts the caller may see (household-wide, own, shared). */
export function visibleAccounts(ctx: HouseholdContext) {
  return visibleTo(ctx.member.id, {
    visibility: finAccounts.visibility,
    owner: finAccounts.ownerMemberId,
  });
}

export function todayIn(ctx: HouseholdContext, now = new Date()): string {
  return toLocalDate(now, ctx.household.timezone);
}

export function householdCurrency(ctx: HouseholdContext): CurrencyCode {
  return isCurrencyCode(ctx.household.currency) ? ctx.household.currency : 'EUR';
}

export function asCurrency(code: string): CurrencyCode {
  return isCurrencyCode(code) ? code : 'EUR';
}

/** Owners, admins and adults of a household (recipients of finance notifications). */
export async function adultMemberIds(db: Database, householdId: string): Promise<string[]> {
  const rows = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        isNull(householdMembers.removedAt),
        inArray(householdMembers.role, ['owner', 'admin', 'adult']),
      ),
    );
  return rows.map((r) => r.id);
}

/** Records a one-time send (system connection); false when it was already sent. */
export async function once(db: Database, householdId: string, key: string): Promise<boolean> {
  const rows = await db
    .insert(sentReminders)
    .values({ householdId, key })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}
