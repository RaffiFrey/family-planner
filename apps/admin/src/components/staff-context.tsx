'use client';

import * as React from 'react';
import type { StaffRole } from '@fp/contracts';
import { can, type Permission } from '@/lib/permissions';

export interface StaffInfo {
  id: string;
  email: string;
  name: string;
  roles: StaffRole[];
}

const StaffContext = React.createContext<StaffInfo | null>(null);

export function StaffProvider({
  staff,
  children,
}: {
  staff: StaffInfo;
  children: React.ReactNode;
}) {
  return <StaffContext.Provider value={staff}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffInfo {
  const s = React.use(StaffContext);
  if (!s) throw new Error('useStaff must be used inside <StaffProvider>');
  return s;
}

export function useCan(permission: Permission): boolean {
  return can(useStaff().roles, permission);
}
