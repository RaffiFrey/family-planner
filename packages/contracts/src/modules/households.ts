import { MEMBER_ROLES, MODULES } from '@fp/domain/permissions';
import { SUPPORTED_CURRENCIES } from '@fp/domain/money';
import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  Ok,
  page,
  CursorQuery,
  withHousehold,
} from '../core.js';

export const MemberRole = z.enum(MEMBER_ROLES);
export const ModuleName = z.enum(MODULES);
export const Locale = z.enum(['de', 'en']);
export const Currency = z.enum(SUPPORTED_CURRENCIES);
export const Plan = z.enum(['free', 'plus', 'pro']);
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const TimeZone = z.string().min(1).max(64);

export const User = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  locale: Locale,
  image: z.string().nullable(),
});
export type User = z.infer<typeof User>;

export const Household = z.object({
  id: Id,
  name: z.string(),
  timezone: TimeZone,
  currency: Currency,
  locale: Locale,
  plan: Plan,
  createdAt: IsoDateTime,
});
export type Household = z.infer<typeof Household>;

export const Member = z.object({
  id: Id,
  householdId: Id,
  userId: z.string().nullable(),
  displayName: z.string(),
  role: MemberRole,
  color: HexColor,
  avatarUrl: z.string().nullable(),
  isManaged: z.boolean(),
  birthday: z.iso.date().nullable(),
  grantedModules: z.array(ModuleName).nullable(),
  accessUntil: IsoDateTime.nullable(),
  joinedAt: IsoDateTime,
});
export type Member = z.infer<typeof Member>;

export const Membership = z.object({ household: Household, member: Member });

export const Me = z.object({ user: User, memberships: z.array(Membership) });
export type Me = z.infer<typeof Me>;

export const UpdateMeBody = z.object({
  name: z.string().min(1).max(100).optional(),
  locale: Locale.optional(),
});

export const CreateHouseholdBody = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: TimeZone.default('Europe/Berlin'),
  currency: Currency.default('EUR'),
  locale: Locale.default('de'),
  displayName: z.string().trim().min(1).max(60),
  color: HexColor.optional(),
});

export const UpdateHouseholdBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: TimeZone.optional(),
  currency: Currency.optional(),
  locale: Locale.optional(),
});

export const HouseholdDetail = z.object({
  household: Household,
  members: z.array(Member),
  me: Member,
});

export const UpdateMemberBody = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  role: MemberRole.optional(),
  color: HexColor.optional(),
  birthday: z.iso.date().nullable().optional(),
  grantedModules: z.array(ModuleName).nullable().optional(),
  accessUntil: IsoDateTime.nullable().optional(),
});

/** Managed profiles are for children without an email address (GDPR Art. 8). */
export const CreateManagedMemberBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(['child', 'teen']),
  color: HexColor.optional(),
  birthday: z.iso.date().nullable().optional(),
});

export const Invitation = z.object({
  id: Id,
  householdId: Id,
  role: MemberRole,
  email: z.email().nullable(),
  token: z.string(),
  expiresAt: IsoDateTime,
  createdAt: IsoDateTime,
  acceptedAt: IsoDateTime.nullable(),
});

export const CreateInvitationBody = z.object({
  role: MemberRole.exclude(['owner']),
  email: z.email().optional(),
  grantedModules: z.array(ModuleName).optional(),
  accessUntil: IsoDateTime.optional(),
});

export const InvitationPreview = z.object({
  householdName: z.string(),
  invitedBy: z.string(),
  role: MemberRole,
  expiresAt: IsoDateTime,
});

export const AcceptInvitationBody = z.object({
  displayName: z.string().trim().min(1).max(60),
});

export const AuditEntry = z.object({
  id: Id,
  actorMemberId: Id.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  createdAt: IsoDateTime,
});

const tags = ['households'];
const MemberParams = withHousehold({ memberId: Id });

/** Customer-granted, time-boxed access for the support team (ADR-0008). */
export const SupportAccess = z.object({
  active: z.boolean(),
  expiresAt: IsoDateTime.nullable(),
  grantedByMemberId: Id.nullable(),
  reason: z.string().nullable(),
});
export const GrantSupportAccessBody = z.object({
  hours: z.number().int().min(1).max(72),
  reason: z.string().trim().max(300).optional(),
});

export const householdsContract = {
  me: defineEndpoint({
    method: 'GET',
    path: '/v1/me',
    summary: 'Current user and memberships',
    tags,
    response: Me,
  }),
  updateMe: defineEndpoint({
    method: 'PATCH',
    path: '/v1/me',
    summary: 'Update profile',
    tags,
    body: UpdateMeBody,
    response: User,
  }),
  exportMyData: defineEndpoint({
    method: 'POST',
    path: '/v1/me/export',
    summary: 'Request a GDPR data export (delivered by email)',
    tags,
    response: Ok,
    status: 202,
  }),
  deleteMe: defineEndpoint({
    method: 'DELETE',
    path: '/v1/me',
    summary: 'Schedule account deletion (30-day grace period)',
    tags,
    response: z.object({ deletionScheduledAt: IsoDateTime }),
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/v1/households',
    summary: 'Create household',
    tags,
    body: CreateHouseholdBody,
    response: HouseholdDetail,
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId',
    summary: 'Household with members',
    tags,
    params: HouseholdParams,
    response: HouseholdDetail,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId',
    summary: 'Update household',
    tags,
    params: HouseholdParams,
    body: UpdateHouseholdBody,
    response: Household,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId',
    summary: 'Delete household (owner only)',
    tags,
    params: HouseholdParams,
    response: Ok,
  }),
  updateMember: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/members/:memberId',
    summary: 'Update member',
    tags,
    params: MemberParams,
    body: UpdateMemberBody,
    response: Member,
  }),
  removeMember: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/members/:memberId',
    summary: 'Remove member or leave',
    tags,
    params: MemberParams,
    response: Ok,
  }),
  createManagedMember: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/members',
    summary: 'Add a managed child profile',
    tags,
    params: HouseholdParams,
    body: CreateManagedMemberBody,
    response: Member,
  }),
  listInvitations: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/invitations',
    summary: 'Open invitations',
    tags,
    params: HouseholdParams,
    response: z.array(Invitation),
  }),
  createInvitation: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/invitations',
    summary: 'Invite by link/QR/email',
    tags,
    params: HouseholdParams,
    body: CreateInvitationBody,
    response: Invitation,
  }),
  revokeInvitation: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/invitations/:invitationId',
    summary: 'Revoke invitation',
    tags,
    params: withHousehold({ invitationId: Id }),
    response: Ok,
  }),
  previewInvitation: defineEndpoint({
    method: 'GET',
    path: '/v1/invitations/:token',
    summary: 'Invitation preview',
    tags,
    auth: 'public',
    params: z.object({ token: z.string().min(16) }),
    response: InvitationPreview,
  }),
  acceptInvitation: defineEndpoint({
    method: 'POST',
    path: '/v1/invitations/:token/accept',
    summary: 'Join household',
    tags,
    params: z.object({ token: z.string().min(16) }),
    body: AcceptInvitationBody,
    response: HouseholdDetail,
  }),
  audit: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/audit',
    summary: 'Household audit log',
    tags,
    params: HouseholdParams,
    query: CursorQuery,
    response: page(AuditEntry),
  }),
  getSupportAccess: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/support-access',
    summary: 'Current support access grant',
    tags,
    params: HouseholdParams,
    response: SupportAccess,
  }),
  grantSupportAccess: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/support-access',
    summary: 'Allow the support team to inspect this household for a limited time',
    tags,
    params: HouseholdParams,
    body: GrantSupportAccessBody,
    response: SupportAccess,
    status: 200,
  }),
  revokeSupportAccess: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/support-access',
    summary: 'Revoke support access immediately',
    tags,
    params: HouseholdParams,
    response: SupportAccess,
  }),
} as const;
