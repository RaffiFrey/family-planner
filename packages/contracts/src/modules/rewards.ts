import { z } from 'zod';
import {
  CursorQuery,
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  MinorAmount,
  Ok,
  page,
  withHousehold,
} from '../core.js';

export const PointsAccount = z.object({
  memberId: Id,
  points: z.number().int(),
  /** Held by open redemption requests. */
  reserved: z.number().int(),
  available: z.number().int(),
});

export const PointsEntry = z.object({
  id: Id,
  memberId: Id,
  delta: z.number().int(),
  reason: z.string(),
  taskId: Id.nullable(),
  rewardId: Id.nullable(),
  createdByMemberId: Id.nullable(),
  createdAt: IsoDateTime,
});

export const PointsQuery = CursorQuery.extend({ memberId: Id.optional() });

export const AdjustPointsBody = z.object({
  memberId: Id,
  delta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((n) => n !== 0, 'Must not be zero'),
  reason: z.string().trim().min(1).max(200),
});

export const LeaderboardQuery = z.object({
  period: z.enum(['week', 'month']).default('week'),
  /** Any day inside the wanted week/month; defaults to today (household time zone). */
  at: LocalDate.optional(),
});
export const Leaderboard = z.object({
  period: z.enum(['week', 'month']),
  from: LocalDate,
  to: LocalDate,
  rows: z.array(z.object({ memberId: Id, points: z.number().int(), rank: z.number().int() })),
});

export const Reward = z.object({
  id: Id,
  title: z.string(),
  description: z.string().nullable(),
  costPoints: z.number().int(),
  icon: z.string().nullable(),
  active: z.boolean(),
  createdAt: IsoDateTime,
});
export type Reward = z.infer<typeof Reward>;

const RewardBase = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable(),
  costPoints: z.number().int().min(1).max(100_000),
  icon: z.string().max(40).nullable(),
  active: z.boolean(),
});
export const CreateRewardBody = RewardBase.extend({
  description: RewardBase.shape.description.default(null),
  icon: RewardBase.shape.icon.default(null),
  active: RewardBase.shape.active.default(true),
});
export const UpdateRewardBody = RewardBase.partial();

export const RedemptionStatus = z.enum(['requested', 'approved', 'rejected', 'cancelled']);
export const Redemption = z.object({
  id: Id,
  rewardId: Id.nullable(),
  rewardTitle: z.string(),
  costPoints: z.number().int(),
  memberId: Id,
  status: RedemptionStatus,
  note: z.string().nullable(),
  decidedByMemberId: Id.nullable(),
  decidedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Redemption = z.infer<typeof Redemption>;

export const RedemptionsQuery = z.object({
  status: RedemptionStatus.optional(),
  memberId: Id.optional(),
});
export const RedeemBody = z.object({
  /** Adults may redeem on behalf of a member; defaults to the caller. */
  memberId: Id.optional(),
  note: z.string().max(500).optional(),
});
export const DecideRedemptionBody = z.object({ note: z.string().max(500).optional() });

// ---------- pocket money

export const AllowanceInterval = z.enum(['weekly', 'monthly']);
export const AllowanceRule = z.object({
  id: Id,
  memberId: Id,
  amountMinor: MinorAmount,
  currency: z.string().length(3),
  interval: AllowanceInterval,
  weekday: z.number().int().nullable(),
  dayOfMonth: z.number().int().nullable(),
  startsOn: LocalDate,
  active: z.boolean(),
  nextPayday: LocalDate.nullable(),
});

const AllowanceRuleBase = z.object({
  memberId: Id,
  amountMinor: MinorAmount.refine((n) => n > 0 && n <= 1_000_000, 'Out of range'),
  currency: z.string().length(3).toUpperCase(),
  interval: AllowanceInterval,
  /** ISO weekday 1 (Mon) – 7 (Sun), weekly rules. */
  weekday: z.number().int().min(1).max(7).nullable(),
  /** 1–31, clamped to the month's last day, monthly rules. */
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startsOn: LocalDate,
  active: z.boolean(),
});
export const CreateAllowanceRuleBody = AllowanceRuleBase.extend({
  /** Defaults to the household currency. */
  currency: AllowanceRuleBase.shape.currency.optional(),
  weekday: AllowanceRuleBase.shape.weekday.default(null),
  dayOfMonth: AllowanceRuleBase.shape.dayOfMonth.default(null),
  /** Defaults to today. */
  startsOn: LocalDate.optional(),
  active: AllowanceRuleBase.shape.active.default(true),
}).refine((r) => (r.interval === 'weekly' ? r.weekday !== null : r.dayOfMonth !== null), {
  message: 'Weekly rules need a weekday, monthly rules a day of month',
  path: ['interval'],
});
export const UpdateAllowanceRuleBody = AllowanceRuleBase.omit({ memberId: true }).partial();

export const AllowanceKind = z.enum(['payout', 'bonus', 'expense', 'correction']);
export const AllowanceEntry = z.object({
  id: Id,
  memberId: Id,
  amountMinor: MinorAmount,
  currency: z.string(),
  kind: AllowanceKind,
  note: z.string().nullable(),
  date: LocalDate,
  ruleId: Id.nullable(),
  createdByMemberId: Id.nullable(),
  createdAt: IsoDateTime,
});
export const AllowanceLedgerQuery = CursorQuery.extend({ memberId: Id.optional() });
export const CreateAllowanceEntryBody = z.object({
  memberId: Id,
  /** Positive amount for payout/bonus/expense (sign is applied by kind); corrections are signed. */
  amountMinor: MinorAmount.refine((n) => n !== 0 && Math.abs(n) <= 1_000_000, 'Out of range'),
  kind: AllowanceKind,
  note: z.string().max(500).nullable().default(null),
  /** Defaults to today. */
  date: LocalDate.optional(),
});
export const AllowanceBalance = z.object({
  memberId: Id,
  currency: z.string(),
  balanceMinor: MinorAmount,
});

const tags = ['rewards'];
const RewardParams = withHousehold({ rewardId: Id });
const RedemptionParams = withHousehold({ redemptionId: Id });
const RuleParams = withHousehold({ ruleId: Id });

export const rewardsContract = {
  balances: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/balances',
    summary: 'Points per member (children see only their own)',
    tags,
    params: HouseholdParams,
    response: z.array(PointsAccount),
  }),
  points: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/points',
    summary: 'Points ledger',
    tags,
    params: HouseholdParams,
    query: PointsQuery,
    response: page(PointsEntry),
  }),
  adjustPoints: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/points',
    summary: 'Award or deduct points manually (adults)',
    tags,
    params: HouseholdParams,
    body: AdjustPointsBody,
    response: PointsEntry,
  }),
  leaderboard: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/leaderboard',
    summary: 'Points earned this week or month',
    tags,
    params: HouseholdParams,
    query: LeaderboardQuery,
    response: Leaderboard,
  }),
  catalog: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/catalog',
    summary: 'Reward catalogue',
    tags,
    params: HouseholdParams,
    response: z.array(Reward),
  }),
  createReward: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/catalog',
    summary: 'Add a reward (adults)',
    tags,
    params: HouseholdParams,
    body: CreateRewardBody,
    response: Reward,
  }),
  updateReward: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/rewards/catalog/:rewardId',
    summary: 'Update a reward (adults)',
    tags,
    params: RewardParams,
    body: UpdateRewardBody,
    response: Reward,
  }),
  removeReward: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/rewards/catalog/:rewardId',
    summary: 'Delete a reward (adults)',
    tags,
    params: RewardParams,
    response: Ok,
  }),
  redeem: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/catalog/:rewardId/redeem',
    summary: 'Request a reward; points are reserved until an adult decides',
    tags,
    params: RewardParams,
    body: RedeemBody,
    response: Redemption,
  }),
  redemptions: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/redemptions',
    summary: 'Redemption requests (children see only their own)',
    tags,
    params: HouseholdParams,
    query: RedemptionsQuery,
    response: z.array(Redemption),
  }),
  approveRedemption: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/redemptions/:redemptionId/approve',
    summary: 'Approve and deduct points (adults)',
    tags,
    params: RedemptionParams,
    body: DecideRedemptionBody,
    response: Redemption,
    status: 200,
  }),
  rejectRedemption: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/redemptions/:redemptionId/reject',
    summary: 'Reject (adults)',
    tags,
    params: RedemptionParams,
    body: DecideRedemptionBody,
    response: Redemption,
    status: 200,
  }),
  cancelRedemption: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/redemptions/:redemptionId/cancel',
    summary: 'Withdraw an own open request',
    tags,
    params: RedemptionParams,
    response: Redemption,
    status: 200,
  }),
  allowanceRules: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/allowance/rules',
    summary: 'Pocket money rules',
    tags,
    params: HouseholdParams,
    response: z.array(AllowanceRule),
  }),
  createAllowanceRule: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/allowance/rules',
    summary: 'Create a pocket money rule (adults)',
    tags,
    params: HouseholdParams,
    body: CreateAllowanceRuleBody,
    response: AllowanceRule,
  }),
  updateAllowanceRule: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/rewards/allowance/rules/:ruleId',
    summary: 'Update a pocket money rule (adults)',
    tags,
    params: RuleParams,
    body: UpdateAllowanceRuleBody,
    response: AllowanceRule,
  }),
  removeAllowanceRule: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/rewards/allowance/rules/:ruleId',
    summary: 'Delete a pocket money rule (adults)',
    tags,
    params: RuleParams,
    response: Ok,
  }),
  allowanceBalances: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/allowance/balances',
    summary: 'Pocket money balances',
    tags,
    params: HouseholdParams,
    response: z.array(AllowanceBalance),
  }),
  allowanceLedger: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/rewards/allowance/ledger',
    summary: 'Pocket money ledger',
    tags,
    params: HouseholdParams,
    query: AllowanceLedgerQuery,
    response: page(AllowanceEntry),
  }),
  addAllowanceEntry: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/rewards/allowance/ledger',
    summary: 'Book a payout, bonus, expense or correction (adults)',
    tags,
    params: HouseholdParams,
    body: CreateAllowanceEntryBody,
    response: AllowanceEntry,
  }),
} as const;
