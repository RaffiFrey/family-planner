import { z } from 'zod';
import { CursorQuery, defineEndpoint, Id, IsoDateTime, Ok, page } from '../core.js';

export const NOTIFICATION_TYPES = [
  'event.reminder',
  'task.assigned',
  'task.due',
  'list.item_added',
  'budget.warning',
  'budget.exceeded',
  'household.member_joined',
  'storage.file_infected',
  'digest.daily',
  'system.announcement',
  'finance.contract_notice',
  'finance.goal_reached',
  'finance.expense_added',
  'finance.bank_sync_failed',
  'vault.document_expiring',
  'home.maintenance_due',
  'health.medication',
  'health.vaccination_due',
  'health.checkup_due',
  'rewards.points_earned',
  'rewards.redeemed',
  'pinboard.post',
  'pinboard.poll',
  'location.arrived',
  'location.left',
  'travel.upcoming',
  'calendar.sync_failed',
] as const;
export const NotificationType = z.enum(NOTIFICATION_TYPES);
export const Channel = z.enum(['push', 'email', 'in_app']);

export const Notification = z.object({
  id: Id,
  householdId: Id.nullable(),
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  /** Deep link target, e.g. `/tasks/<id>`. */
  link: z.string().nullable(),
  readAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Notification = z.infer<typeof Notification>;

export const Preferences = z.object({
  /** Per type: which channels are enabled. Missing types use defaults. */
  channels: z.record(z.string(), z.array(Channel)),
  digest: z.enum(['off', 'daily', 'weekly']),
  digestHour: z.number().int().min(0).max(23),
  quietHours: z
    .object({ from: z.number().int().min(0).max(23), to: z.number().int().min(0).max(23) })
    .nullable(),
});
export type Preferences = z.infer<typeof Preferences>;

export const RegisterDeviceBody = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(100).optional(),
});

const tags = ['notifications'];

export const notificationsContract = {
  list: defineEndpoint({
    method: 'GET',
    path: '/v1/notifications',
    summary: 'In-app notifications',
    tags,
    query: CursorQuery.extend({ unreadOnly: z.stringbool().default(false) }),
    response: page(Notification).extend({ unreadCount: z.number().int() }),
  }),
  markRead: defineEndpoint({
    method: 'POST',
    path: '/v1/notifications/read',
    summary: 'Mark notifications read (all when ids omitted)',
    tags,
    body: z.object({ ids: z.array(Id).optional() }),
    response: Ok,
    status: 200,
  }),
  getPreferences: defineEndpoint({
    method: 'GET',
    path: '/v1/notifications/preferences',
    summary: 'Notification preferences',
    tags,
    response: Preferences,
  }),
  updatePreferences: defineEndpoint({
    method: 'PUT',
    path: '/v1/notifications/preferences',
    summary: 'Update notification preferences',
    tags,
    body: Preferences,
    response: Preferences,
  }),
  registerDevice: defineEndpoint({
    method: 'POST',
    path: '/v1/notifications/devices',
    summary: 'Register push token',
    tags,
    body: RegisterDeviceBody,
    response: Ok,
  }),
  unregisterDevice: defineEndpoint({
    method: 'DELETE',
    path: '/v1/notifications/devices/:token',
    summary: 'Remove push token',
    tags,
    params: z.object({ token: z.string() }),
    response: Ok,
  }),
} as const;
