import type { Household, Member } from '@fp/contracts';
import type { householdMembers, households } from '@fp/db';
import { iso, isoOrNull } from '../../common/contract.js';

type HouseholdRow = typeof households.$inferSelect;
type MemberRow = typeof householdMembers.$inferSelect;

export const MEMBER_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function toHousehold(h: HouseholdRow): Household {
  return {
    id: h.id,
    name: h.name,
    timezone: h.timezone,
    currency: h.currency as Household['currency'],
    locale: h.locale === 'en' ? 'en' : 'de',
    plan: h.plan,
    createdAt: iso(h.createdAt),
  };
}

export function toMember(m: MemberRow): Member {
  return {
    id: m.id,
    householdId: m.householdId,
    userId: m.userId,
    displayName: m.displayName,
    role: m.role,
    color: m.color,
    avatarUrl: m.avatarUrl,
    isManaged: m.isManaged,
    birthday: m.birthday,
    grantedModules: (m.grantedModules as Member['grantedModules']) ?? null,
    accessUntil: isoOrNull(m.accessUntil),
    joinedAt: iso(m.joinedAt),
  };
}
