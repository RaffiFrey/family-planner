export const ALLOWANCE_KINDS = ['payout', 'bonus', 'expense', 'correction'] as const;
export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];
