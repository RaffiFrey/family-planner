import type { Entitlements } from '@fp/contracts';

const GB = 1024 * 1024 * 1024;

/** What each plan unlocks (plan section 1.3). Enforced server-side. */
export const PLAN_ENTITLEMENTS: Record<'free' | 'plus' | 'pro', Entitlements> = {
  free: {
    plan: 'free',
    maxMembers: 6,
    maxAccounts: 2,
    storageQuotaBytes: 2 * GB,
    historyMonths: 12,
    features: [],
  },
  plus: {
    plan: 'plus',
    maxMembers: 12,
    maxAccounts: null,
    storageQuotaBytes: 100 * GB,
    historyMonths: null,
    features: ['contracts', 'ocr', 'vault', 'advanced_reports', 'rewards'],
  },
  pro: {
    plan: 'pro',
    maxMembers: 20,
    maxAccounts: null,
    storageQuotaBytes: 200 * GB,
    historyMonths: null,
    features: [
      'contracts',
      'ocr',
      'vault',
      'advanced_reports',
      'rewards',
      'bank_sync',
      'ai_assistant',
    ],
  },
};

export function entitlementsFor(plan: string): Entitlements {
  return PLAN_ENTITLEMENTS[plan === 'plus' || plan === 'pro' ? plan : 'free'];
}
