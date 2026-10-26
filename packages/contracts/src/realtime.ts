import { z } from 'zod';

/** Entity types clients cache; a change event invalidates the matching queries. */
export const REALTIME_ENTITIES = [
  'household',
  'member',
  'calendar',
  'event',
  'task',
  'list',
  'list_item',
  'account',
  'transaction',
  'category',
  'budget',
  'rule',
  'folder',
  'file',
  'notification',
  'fin_contract',
  'goal',
  'shared_expense',
  'bank_connection',
  'recipe',
  'meal_plan',
  'reward',
  'points',
  'post',
  'poll',
  'trip',
  'album',
  'document',
  'contact',
  'emergency_card',
  'health_record',
  'medication',
  'timetable',
  'asset',
  'maintenance',
  'meter_reading',
  'location',
  'place',
  'assistant',
  'calendar_subscription',
] as const;
export const RealtimeEntity = z.enum(REALTIME_ENTITIES);
export type RealtimeEntity = z.infer<typeof RealtimeEntity>;

export const EntityChanged = z.object({
  householdId: z.string(),
  entity: RealtimeEntity,
  id: z.string().nullable(),
  /** Parent id where useful, e.g. the list of a list item. */
  parentId: z.string().nullable(),
  op: z.enum(['created', 'updated', 'deleted']),
  actorMemberId: z.string().nullable(),
  at: z.string(),
});
export type EntityChanged = z.infer<typeof EntityChanged>;

/** Socket.IO event names. Rooms are `household:<id>` and `user:<id>`. */
export const RealtimeEvents = {
  entityChanged: 'entity.changed',
  notification: 'notification',
  subscribe: 'household.subscribe',
} as const;
