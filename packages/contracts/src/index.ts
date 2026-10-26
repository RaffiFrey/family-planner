import { z } from 'zod';
import { defineContract, defineEndpoint } from './core.js';
import { adminContract } from './modules/admin.js';
import { billingContract } from './modules/billing.js';
import { calendarContract } from './modules/calendar.js';
import { financeContract } from './modules/finance.js';
import { householdsContract } from './modules/households.js';
import { listsContract } from './modules/lists.js';
import { notificationsContract } from './modules/notifications.js';
import { storageContract } from './modules/storage.js';
import { tasksContract } from './modules/tasks.js';
import { financePlusContract } from './modules/finance-plus.js';
import { mealsContract } from './modules/meals.js';
import { rewardsContract } from './modules/rewards.js';
import { pinboardContract } from './modules/pinboard.js';
import { travelContract } from './modules/travel.js';
import { photosContract } from './modules/photos.js';
import { vaultContract } from './modules/vault.js';
import { contactsContract } from './modules/contacts.js';
import { healthContract } from './modules/health.js';
import { schoolContract } from './modules/school.js';
import { homeContract } from './modules/home.js';
import { locationContract } from './modules/location.js';
import { assistantContract } from './modules/assistant.js';
import { calendarSyncContract } from './modules/calendar-sync.js';

export * from './core.js';
export * from './client.js';
export * from './openapi.js';
export * from './realtime.js';
export * from './modules/admin.js';
export * from './modules/billing.js';
export * from './modules/calendar.js';
export * from './modules/finance.js';
export * from './modules/households.js';
export * from './modules/lists.js';
export * from './modules/notifications.js';
export * from './modules/storage.js';
export * from './modules/tasks.js';
export * from './modules/finance-plus.js';
export * from './modules/meals.js';
export * from './modules/rewards.js';
export * from './modules/pinboard.js';
export * from './modules/travel.js';
export * from './modules/photos.js';
export * from './modules/vault.js';
export * from './modules/contacts.js';
export * from './modules/health.js';
export * from './modules/school.js';
export * from './modules/home.js';
export * from './modules/location.js';
export * from './modules/assistant.js';
export * from './modules/calendar-sync.js';

export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
});

/** Customer-facing API (web + mobile). */
export const apiContract = defineContract({
  system: {
    health: defineEndpoint({
      method: 'GET',
      path: '/v1/health',
      summary: 'Liveness/readiness',
      tags: ['system'],
      auth: 'public',
      response: Health,
    }),
  },
  households: householdsContract,
  calendar: calendarContract,
  tasks: tasksContract,
  lists: listsContract,
  finance: financeContract,
  storage: storageContract,
  notifications: notificationsContract,
  billing: billingContract,
  financePlus: financePlusContract,
  meals: mealsContract,
  rewards: rewardsContract,
  pinboard: pinboardContract,
  travel: travelContract,
  photos: photosContract,
  vault: vaultContract,
  contacts: contactsContract,
  health: healthContract,
  school: schoolContract,
  home: homeContract,
  location: locationContract,
  assistant: assistantContract,
  calendarSync: calendarSyncContract,
});
export type ApiContract = typeof apiContract;

/** Internal admin API, separate auth realm (ADR-0008). */
export const adminApiContract = defineContract({ admin: adminContract });
export type AdminApiContract = typeof adminApiContract;
