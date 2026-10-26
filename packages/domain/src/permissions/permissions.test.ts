import { describe, expect, it } from 'vitest';
import { assignableRoles, can, canSee } from './permissions.js';

describe('permissions', () => {
  it('applies the role matrix', () => {
    expect(can({ memberId: 'a', role: 'owner' }, 'household.delete')).toBe(true);
    expect(can({ memberId: 'a', role: 'admin' }, 'household.delete')).toBe(false);
    expect(can({ memberId: 'a', role: 'adult' }, 'finance.write')).toBe(true);
    expect(can({ memberId: 'a', role: 'teen' }, 'finance.write')).toBe(false);
    expect(can({ memberId: 'a', role: 'teen' }, 'finance.read')).toBe(true);
    expect(can({ memberId: 'a', role: 'child' }, 'finance.read')).toBe(false);
    expect(can({ memberId: 'a', role: 'child' }, 'tasks.complete')).toBe(true);
  });

  it('limits caregivers to granted modules and time', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const sitter = {
      memberId: 's',
      role: 'caregiver' as const,
      grantedModules: ['calendar' as const],
      accessUntil: new Date('2026-10-26T00:00:00Z'),
    };
    expect(can(sitter, 'calendar.read', now)).toBe(true);
    expect(can(sitter, 'lists.read', now)).toBe(false);
    expect(can(sitter, 'calendar.write', now)).toBe(false);
    expect(can(sitter, 'calendar.read', new Date('2026-10-27T00:00:00Z'))).toBe(false);
    expect(can({ memberId: 's', role: 'caregiver' }, 'calendar.read', now)).toBe(false);
  });

  it('checks item visibility', () => {
    const me = { memberId: 'me', role: 'adult' as const };
    expect(canSee(me, { visibility: 'private', ownerMemberId: 'me' })).toBe(true);
    expect(canSee(me, { visibility: 'private', ownerMemberId: 'other' })).toBe(false);
    expect(canSee(me, { visibility: 'household', ownerMemberId: 'other' })).toBe(true);
    expect(canSee(me, { visibility: 'members', ownerMemberId: 'other', sharedWith: ['me'] })).toBe(
      true,
    );
    expect(canSee(me, { visibility: 'members', ownerMemberId: 'other', sharedWith: null })).toBe(
      false,
    );
  });

  it('never lets members assign roles above their own', () => {
    expect(assignableRoles('owner')).not.toContain('owner');
    expect(assignableRoles('admin')).not.toContain('admin');
    expect(assignableRoles('adult')).not.toContain('admin');
    expect(assignableRoles('teen')).toEqual([]);
  });
});
