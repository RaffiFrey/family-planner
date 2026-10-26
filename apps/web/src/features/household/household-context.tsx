'use client';

import type { Household, Me, Member } from '@fp/contracts';
import { type Action, can as canDo } from '@fp/domain/permissions';
import * as React from 'react';

export interface HouseholdContextValue {
  me: Me;
  householdId: string;
  household: Household;
  /** The current user's membership in this household. */
  member: Member;
  members: Member[];
  memberById: (id: string | null | undefined) => Member | undefined;
  can: (action: Action) => boolean;
  switchHousehold: (id: string) => void;
}

const HouseholdContext = React.createContext<HouseholdContextValue | null>(null);

export function HouseholdContextProvider({
  value,
  children,
}: {
  value: Omit<HouseholdContextValue, 'memberById' | 'can'>;
  children: React.ReactNode;
}) {
  const { members, member } = value;
  const full = React.useMemo<HouseholdContextValue>(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    return {
      ...value,
      memberById: (id) => (id ? byId.get(id) : undefined),
      can: (action) =>
        canDo(
          {
            memberId: member.id,
            role: member.role,
            grantedModules: member.grantedModules,
            accessUntil: member.accessUntil ? new Date(member.accessUntil) : null,
          },
          action,
        ),
    };
  }, [value, members, member]);
  return <HouseholdContext.Provider value={full}>{children}</HouseholdContext.Provider>;
}

/** Current household, members and permissions. Only available inside the app shell. */
export function useHousehold(): HouseholdContextValue {
  const ctx = React.useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used inside the app shell');
  return ctx;
}
