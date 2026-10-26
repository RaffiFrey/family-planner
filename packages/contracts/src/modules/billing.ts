import { z } from 'zod';
import { defineEndpoint, HouseholdParams, IsoDateTime } from '../core.js';
import { Plan } from './households.js';

/** What a plan unlocks. Enforced server-side; clients use it to show upgrade prompts. */
export const Entitlements = z.object({
  plan: Plan,
  maxMembers: z.number().int(),
  maxAccounts: z.number().int().nullable(),
  storageQuotaBytes: z.number().int(),
  historyMonths: z.number().int().nullable(),
  features: z.array(
    z.enum([
      'contracts',
      'ocr',
      'vault',
      'advanced_reports',
      'rewards',
      'bank_sync',
      'ai_assistant',
    ]),
  ),
});
export type Entitlements = z.infer<typeof Entitlements>;

export const Subscription = z.object({
  plan: Plan,
  status: z.enum(['none', 'trialing', 'active', 'past_due', 'canceled']),
  provider: z.enum(['stripe', 'app_store', 'play_store', 'comp']).nullable(),
  currentPeriodEnd: IsoDateTime.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  entitlements: Entitlements,
});

const tags = ['billing'];

export const billingContract = {
  subscription: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/billing',
    summary: 'Subscription and entitlements',
    tags,
    params: HouseholdParams,
    response: Subscription,
  }),
  checkout: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/billing/checkout',
    summary: 'Stripe Checkout session for web',
    tags,
    params: HouseholdParams,
    body: z.object({ plan: z.enum(['plus', 'pro']), interval: z.enum(['month', 'year']) }),
    response: z.object({ url: z.url() }),
  }),
  portal: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/billing/portal',
    summary: 'Stripe customer portal',
    tags,
    params: HouseholdParams,
    response: z.object({ url: z.url() }),
  }),
} as const;
