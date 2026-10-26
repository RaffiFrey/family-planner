export const MEMBER_ROLES = ['owner', 'admin', 'adult', 'teen', 'child', 'caregiver'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Feature modules; caregivers are granted access per module. */
export const MODULES = [
  'calendar',
  'tasks',
  'lists',
  'finance',
  'storage',
  'household',
  'meals',
  'rewards',
  'pinboard',
  'travel',
  'photos',
  'vault',
  'contacts',
  'health',
  'school',
  'home',
  'location',
  'assistant',
] as const;
export type Module = (typeof MODULES)[number];

export type Action =
  | `${Module}.read`
  | `${Module}.write`
  | 'household.manage'
  | 'household.delete'
  | 'household.billing'
  | 'members.invite'
  | 'members.manage'
  | 'tasks.complete';

const rw = (...modules: Module[]): Action[] =>
  modules.flatMap((m) => [`${m}.read`, `${m}.write`] as Action[]);
const ro = (...modules: Module[]): Action[] => modules.map((m) => `${m}.read` as Action);

const CONTENT: readonly Module[] = MODULES.filter((m) => m !== 'household');
const FULL: readonly Action[] = [...rw(...CONTENT), 'household.read', 'tasks.complete'];

const MATRIX: Record<MemberRole, ReadonlySet<Action>> = {
  owner: new Set<Action>([
    ...FULL,
    'household.manage',
    'household.delete',
    'household.billing',
    'members.invite',
    'members.manage',
  ]),
  admin: new Set<Action>([...FULL, 'household.manage', 'members.invite', 'members.manage']),
  adult: new Set<Action>([...FULL, 'members.invite']),
  // Teens: read-only finance (pocket money is filtered by visibility), no document vault.
  teen: new Set<Action>([
    ...rw(
      'calendar',
      'tasks',
      'lists',
      'storage',
      'meals',
      'rewards',
      'pinboard',
      'travel',
      'photos',
    ),
    ...rw('contacts', 'school', 'location', 'assistant'),
    ...ro('finance', 'health', 'home', 'household'),
    'tasks.complete',
  ]),
  child: new Set<Action>([
    ...ro('calendar', 'tasks', 'meals', 'photos', 'school', 'contacts', 'household', 'travel'),
    ...rw('lists', 'rewards', 'pinboard', 'location'),
    'tasks.complete',
  ]),
  // Caregivers additionally need the module to be granted on their membership.
  caregiver: new Set<Action>([
    ...ro('calendar', 'tasks', 'contacts', 'health', 'school', 'meals'),
    ...rw('lists'),
    'tasks.complete',
  ]),
};

export interface MemberContext {
  memberId: string;
  role: MemberRole;
  /** Only for caregivers: modules they were granted. */
  grantedModules?: readonly Module[] | null;
  /** Only for caregivers: access ends at this instant. */
  accessUntil?: Date | null;
}

export function can(member: MemberContext, action: Action, now: Date = new Date()): boolean {
  if (!MATRIX[member.role].has(action)) return false;
  if (member.role === 'caregiver') {
    if (member.accessUntil && member.accessUntil <= now) return false;
    const module = action.split('.')[0] as Module;
    return member.grantedModules?.includes(module) ?? false;
  }
  return true;
}

export type Visibility = 'household' | 'private' | 'members';

export interface VisibleItem {
  visibility: Visibility;
  ownerMemberId: string;
  /** For `members` visibility. */
  sharedWith?: readonly string[] | null;
}

/** Item-level visibility on top of the role check. */
export function canSee(member: MemberContext, item: VisibleItem): boolean {
  if (item.ownerMemberId === member.memberId) return true;
  switch (item.visibility) {
    case 'household':
      return true;
    case 'private':
      return false;
    case 'members':
      return item.sharedWith?.includes(member.memberId) ?? false;
  }
}

/** Roles a member may assign when inviting or editing others (never above their own). */
export function assignableRoles(role: MemberRole): MemberRole[] {
  switch (role) {
    case 'owner':
      return ['admin', 'adult', 'teen', 'child', 'caregiver'];
    case 'admin':
      return ['adult', 'teen', 'child', 'caregiver'];
    case 'adult':
      return ['adult', 'teen', 'child', 'caregiver'];
    default:
      return [];
  }
}
