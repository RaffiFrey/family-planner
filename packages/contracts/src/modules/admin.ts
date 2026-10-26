import { z } from 'zod';
import { CursorQuery, defineEndpoint, Id, IsoDateTime, Ok, page } from '../core.js';
import { Household, Member, Plan } from './households.js';

export const StaffRole = z.enum(['support', 'billing', 'ops', 'superadmin']);
export type StaffRole = z.infer<typeof StaffRole>;

export const StaffUser = z.object({
  id: Id,
  email: z.email(),
  name: z.string(),
  roles: z.array(StaffRole),
  totpEnabled: z.boolean(),
  lastLoginAt: IsoDateTime.nullable(),
});

export const StaffLoginBody = z.object({
  email: z.email(),
  password: z.string().min(8),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export const StaffSession = z.object({
  staff: StaffUser,
  token: z.string(),
  expiresAt: IsoDateTime,
  totpSetupRequired: z.boolean(),
});

export const AdminUserRow = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  createdAt: IsoDateTime,
  households: z.number().int(),
  deletionScheduledAt: IsoDateTime.nullable(),
  banned: z.boolean(),
});
export const AdminHouseholdRow = Household.extend({
  memberCount: z.number().int(),
  storageBytes: z.number().int(),
});
/** Support view: deliberately no finance or document content (ADR-0008). */
export const AdminHouseholdDetail = z.object({
  household: AdminHouseholdRow,
  members: z.array(
    Member.pick({ id: true, displayName: true, role: true, isManaged: true, joinedAt: true }),
  ),
  counts: z.object({
    events: z.number().int(),
    tasks: z.number().int(),
    lists: z.number().int(),
    accounts: z.number().int(),
    transactions: z.number().int(),
    files: z.number().int(),
  }),
  subscription: z.object({
    plan: Plan,
    status: z.string(),
    provider: z.string().nullable(),
    compUntil: IsoDateTime.nullable(),
  }),
  /** Set while the household has granted support access. */
  supportAccessUntil: IsoDateTime.nullable(),
});

/** Extended view, only available while the customer has granted support access. */
export const AdminSupportView = z.object({
  household: AdminHouseholdRow,
  accessUntil: IsoDateTime,
  members: z.array(
    Member.pick({
      id: true,
      displayName: true,
      role: true,
      isManaged: true,
      color: true,
      joinedAt: true,
      accessUntil: true,
    }).extend({
      hasLogin: z.boolean(),
      pushDevices: z.number().int(),
    }),
  ),
  /** Recent actions without payloads. */
  recentActivity: z.array(
    z.object({ action: z.string(), entityType: z.string(), createdAt: IsoDateTime }),
  ),
  pendingInvitations: z.number().int(),
  failedUploads: z.number().int(),
});

export const SystemStatus = z.object({
  version: z.string(),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
  queues: z.array(
    z.object({
      name: z.string(),
      waiting: z.number().int(),
      active: z.number().int(),
      delayed: z.number().int(),
      failed: z.number().int(),
    }),
  ),
  outboxBacklog: z.number().int(),
  links: z.record(z.string(), z.url()),
});

export const RefundBody = z.object({
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9_]+$/),
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().min(5).max(500),
});

export const FeatureFlag = z.object({
  key: z.string().regex(/^[a-z0-9_.-]+$/),
  description: z.string(),
  enabled: z.boolean(),
  /** 0-100, stable per household. */
  rolloutPercent: z.number().int().min(0).max(100),
  householdAllowlist: z.array(Id),
  updatedAt: IsoDateTime,
});
export const UpsertFeatureFlagBody = FeatureFlag.omit({ updatedAt: true, key: true })
  .partial()
  .extend({ description: z.string().max(300).optional() });

export const Announcement = z.object({
  id: Id,
  title: z.string(),
  body: z.string(),
  level: z.enum(['info', 'warning', 'maintenance']),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export const CreateAnnouncementBody = Announcement.omit({ id: true, createdAt: true });

export const GdprRequest = z.object({
  id: Id,
  userId: z.string(),
  userEmail: z.string().nullable(),
  type: z.enum(['export', 'deletion']),
  status: z.enum(['pending', 'processing', 'done', 'failed']),
  requestedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});

export const Kpis = z.object({
  users: z.number().int(),
  households: z.number().int(),
  activeHouseholds30d: z.number().int(),
  signups7d: z.number().int(),
  paying: z.record(z.string(), z.number().int()),
  storageBytes: z.number().int(),
});

export const StaffAuditEntry = z.object({
  id: Id,
  staffId: Id,
  staffEmail: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: IsoDateTime,
});

export const GlobalCategory = z.object({
  id: Id,
  parentId: Id.nullable(),
  key: z.string().nullable(),
  name: z.string(),
  kind: z.enum(['income', 'expense', 'transfer']),
  icon: z.string().nullable(),
});
export const GlobalRule = z.object({
  id: Id,
  categoryId: Id,
  priority: z.number().int(),
  conditions: z
    .array(
      z.object({
        field: z.enum(['counterparty', 'purpose', 'iban', 'bookingText', 'any']),
        op: z.enum(['contains', 'equals', 'startsWith', 'regex']),
        value: z.string().min(1),
      }),
    )
    .min(1),
  direction: z.enum(['in', 'out']).nullable(),
});

const tags = ['admin'];
const auth = 'staff' as const;
const Search = CursorQuery.extend({ q: z.string().max(100).optional() });
/** Every mutating admin action needs a reason, stored in the staff audit log. */
const Reason = z.object({ reason: z.string().trim().min(5).max(500) });

export const adminContract = {
  login: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/auth/login',
    summary: 'Staff login (password + TOTP)',
    tags,
    auth: 'public',
    body: StaffLoginBody,
    response: StaffSession,
    status: 200,
  }),
  me: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/auth/me',
    summary: 'Current staff user',
    tags,
    auth,
    response: StaffUser,
  }),
  setupTotp: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/auth/totp',
    summary: 'Start TOTP enrolment',
    tags,
    auth,
    response: z.object({ otpauthUrl: z.string(), secret: z.string() }),
    status: 200,
  }),
  confirmTotp: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/auth/totp/confirm',
    summary: 'Confirm TOTP enrolment',
    tags,
    auth,
    body: z.object({ code: z.string().regex(/^\d{6}$/) }),
    response: Ok,
    status: 200,
  }),
  logout: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/auth/logout',
    summary: 'End staff session',
    tags,
    auth,
    response: Ok,
    status: 200,
  }),
  kpis: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/kpis',
    summary: 'Business KPIs',
    tags,
    auth,
    response: Kpis,
  }),
  users: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/users',
    summary: 'Search users',
    tags,
    auth,
    query: Search,
    response: page(AdminUserRow),
  }),
  banUser: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/users/:userId/ban',
    summary: 'Ban/unban user',
    tags,
    auth,
    params: z.object({ userId: z.string() }),
    body: Reason.extend({ banned: z.boolean() }),
    response: Ok,
    status: 200,
  }),
  households: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/households',
    summary: 'Search households',
    tags,
    auth,
    query: Search,
    response: page(AdminHouseholdRow),
  }),
  household: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/households/:householdId',
    summary: 'Household support view (no private content)',
    tags,
    auth,
    params: z.object({ householdId: Id }),
    response: AdminHouseholdDetail,
  }),
  compPlan: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/households/:householdId/comp',
    summary: 'Grant a complimentary plan',
    tags,
    auth,
    params: z.object({ householdId: Id }),
    body: Reason.extend({ plan: Plan, until: IsoDateTime.nullable() }),
    response: Ok,
    status: 200,
  }),
  flags: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/flags',
    summary: 'Feature flags',
    tags,
    auth,
    response: z.array(FeatureFlag),
  }),
  upsertFlag: defineEndpoint({
    method: 'PUT',
    path: '/admin/v1/flags/:key',
    summary: 'Create/update feature flag',
    tags,
    auth,
    params: z.object({ key: z.string().regex(/^[a-z0-9_.-]+$/) }),
    body: UpsertFeatureFlagBody,
    response: FeatureFlag,
  }),
  announcements: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/announcements',
    summary: 'Announcements',
    tags,
    auth,
    response: z.array(Announcement),
  }),
  createAnnouncement: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/announcements',
    summary: 'Create in-app announcement',
    tags,
    auth,
    body: CreateAnnouncementBody,
    response: Announcement,
  }),
  deleteAnnouncement: defineEndpoint({
    method: 'DELETE',
    path: '/admin/v1/announcements/:id',
    summary: 'Delete announcement',
    tags,
    auth,
    params: z.object({ id: Id }),
    response: Ok,
  }),
  gdprRequests: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/gdpr',
    summary: 'GDPR request queue',
    tags,
    auth,
    query: CursorQuery.extend({
      status: z.enum(['pending', 'processing', 'done', 'failed']).optional(),
    }),
    response: page(GdprRequest),
  }),
  retryGdpr: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/gdpr/:id/retry',
    summary: 'Retry failed GDPR request',
    tags,
    auth,
    params: z.object({ id: Id }),
    body: Reason,
    response: Ok,
    status: 200,
  }),
  globalCategories: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/finance/categories',
    summary: 'Global default categories',
    tags,
    auth,
    response: z.array(GlobalCategory),
  }),
  globalRules: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/finance/rules',
    summary: 'Global categorisation rules',
    tags,
    auth,
    response: z.array(GlobalRule),
  }),
  createGlobalRule: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/finance/rules',
    summary: 'Create global rule',
    tags,
    auth,
    body: GlobalRule.omit({ id: true }),
    response: GlobalRule,
  }),
  deleteGlobalRule: defineEndpoint({
    method: 'DELETE',
    path: '/admin/v1/finance/rules/:id',
    summary: 'Delete global rule',
    tags,
    auth,
    params: z.object({ id: Id }),
    response: Ok,
  }),
  audit: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/audit',
    summary: 'Staff audit log',
    tags,
    auth,
    query: CursorQuery,
    response: page(StaffAuditEntry),
  }),
  staff: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/staff',
    summary: 'Staff users',
    tags,
    auth,
    response: z.array(StaffUser),
  }),
  createStaff: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/staff',
    summary: 'Create staff user (superadmin)',
    tags,
    auth,
    body: z.object({
      email: z.email(),
      name: z.string().min(1),
      roles: z.array(StaffRole).min(1),
      password: z.string().min(12),
    }),
    response: StaffUser,
  }),
  supportView: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/households/:householdId/support',
    summary: 'Extended support view (requires an active customer grant)',
    tags,
    auth,
    params: z.object({ householdId: Id }),
    response: AdminSupportView,
  }),
  refund: defineEndpoint({
    method: 'POST',
    path: '/admin/v1/households/:householdId/refund',
    summary: 'Refund a Stripe payment (full or partial)',
    tags,
    auth,
    params: z.object({ householdId: Id }),
    body: RefundBody,
    response: z.object({ refundId: z.string(), status: z.string(), amountMinor: z.number().int() }),
    status: 200,
  }),
  system: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/system',
    summary: 'System health, queues and monitoring links',
    tags,
    auth,
    response: SystemStatus,
  }),
  csvPresets: defineEndpoint({
    method: 'GET',
    path: '/admin/v1/finance/csv-presets',
    summary: 'Bank CSV import presets (defined in @fp/domain)',
    tags,
    auth,
    response: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        delimiter: z.string(),
        detect: z.array(z.string()),
      }),
    ),
  }),
} as const;
