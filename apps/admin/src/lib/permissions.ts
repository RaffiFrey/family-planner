import type { StaffRole } from '@fp/contracts';

/**
 * UI-side mirror of the admin RBAC. The API enforces the same rules; this only hides
 * or disables controls the staff member could not use anyway.
 */
export const PERMISSIONS = {
  // Read access per area (mirrors the API's StaffGuard role map; used for navigation).
  'users.view': ['support'],
  'households.view': ['support', 'billing'],
  'gdpr.view': ['support'],
  'flags.view': ['ops'],
  'announcements.view': ['ops'],
  'finance.view': ['ops'],
  'system.view': ['ops'],
  'staff.view': [],
  // Actions.
  'users.ban': ['support'],
  'gdpr.retry': ['support'],
  'households.comp': ['billing'],
  'households.refund': ['billing'],
  /** Extended support view; additionally requires the customer's active support-access grant. */
  'households.supportView': ['support'],
  'flags.write': ['ops'],
  'announcements.write': ['ops'],
  'rules.write': ['ops'],
  'staff.create': [],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  if (roles.includes('superadmin')) return true;
  const allowed: readonly StaffRole[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  support: 'Support',
  billing: 'Billing',
  ops: 'Ops',
  superadmin: 'Superadmin',
};
