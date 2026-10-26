import { apiQuery } from '@fp/api-client';
import type { Household, Me, Member } from '@fp/contracts';
import { type Action, can } from '@fp/domain/permissions';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useMemo } from 'react';
import { useSettings } from '@/features/settings/settings-store';
import { api } from '@/lib/api';

export function meQuery() {
  return apiQuery(api, 'households', 'me');
}

export function useMe(enabled = true) {
  return useQuery({ ...meQuery(), enabled });
}

interface HouseholdContextValue {
  householdId: string;
  household: Household;
  me: Member;
  memberships: Me['memberships'];
  can: (action: Action) => boolean;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

/** Picks the active household (persisted choice, else the first membership). */
export function pickMembership(
  me: Me,
  activeId: string | null,
): Me['memberships'][number] | undefined {
  return me.memberships.find((m) => m.household.id === activeId) ?? me.memberships[0];
}

export function HouseholdProvider({ me, children }: { me: Me; children: ReactNode }) {
  const activeId = useSettings((s) => s.activeHouseholdId);
  const membership = pickMembership(me, activeId);
  const value = useMemo<HouseholdContextValue | null>(() => {
    if (!membership) return null;
    const member = membership.member;
    return {
      householdId: membership.household.id,
      household: membership.household,
      me: member,
      memberships: me.memberships,
      can: (action) =>
        can(
          {
            memberId: member.id,
            role: member.role,
            grantedModules: member.grantedModules,
            accessUntil: member.accessUntil ? new Date(member.accessUntil) : null,
          },
          action,
        ),
    };
  }, [membership, me.memberships]);
  if (!value) return null;
  return <HouseholdContext value={value}>{children}</HouseholdContext>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = use(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used inside HouseholdProvider');
  return ctx;
}

/** Household detail incl. all members (for assignees, attendees, member colors). */
export function useHouseholdDetail() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'households', 'get', { params: { householdId } }));
}

export function useMembers(): Member[] {
  const { data } = useHouseholdDetail();
  const { me } = useHousehold();
  return data?.members ?? [me];
}

export function useMemberMap(): Map<string, Member> {
  const members = useMembers();
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
}
