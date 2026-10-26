import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  MinorAmount,
  withHousehold,
} from '../core.js';
import { RRuleString } from './calendar.js';
import { TaskRecurrence } from './tasks.js';

/** Household opt-in. Nothing is sent to the model before it is enabled. */
export const AssistantSettings = z.object({
  enabled: z.boolean(),
  /** False when the plan doesn't include the assistant or the server has no model configured. */
  available: z.boolean(),
  consentedAt: IsoDateTime.nullable(),
  consentedByMemberId: Id.nullable(),
  dailyLimit: z.number().int(),
  usedToday: z.number().int(),
});
export type AssistantSettings = z.infer<typeof AssistantSettings>;

export const EnableAssistantBody = z.object({
  /** Explicit acknowledgement that inputs are processed by the AI provider. */
  consent: z.literal(true),
});

// ---------------------------------------------------------------- actions

export const AssistantCreateEventAction = z.object({
  type: z.literal('create_event'),
  calendarId: Id,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable(),
  location: z.string().max(300).nullable(),
  start: IsoDateTime,
  end: IsoDateTime,
  allDay: z.boolean(),
  timezone: z.string(),
  rrule: RRuleString.nullable(),
  attendeeMemberIds: z.array(Id),
  reminders: z.array(z.number().int().min(0).max(40320)).max(5),
});

export const AssistantCreateTaskAction = z.object({
  type: z.literal('create_task'),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).nullable(),
  dueAt: IsoDateTime.nullable(),
  assigneeMemberId: Id.nullable(),
  recurrence: TaskRecurrence.nullable(),
  rotationMemberIds: z.array(Id).max(20),
  points: z.number().int().min(0).max(1000),
});

export const AssistantAddListItemsAction = z.object({
  type: z.literal('add_list_items'),
  listId: Id,
  items: z
    .array(z.object({ text: z.string().min(1).max(200), quantity: z.string().max(50).nullable() }))
    .min(1)
    .max(50),
});

export const AssistantCreateTransactionAction = z.object({
  type: z.literal('create_transaction'),
  /** Null when the assistant couldn't tell; pass `accountId` when applying. */
  accountId: Id.nullable(),
  bookingDate: LocalDate,
  /** Signed minor units: negative = expense. */
  amountMinor: MinorAmount,
  currency: z.string().length(3),
  counterpartyName: z.string().max(200).nullable(),
  categoryId: Id.nullable(),
  purpose: z.string().max(500),
});

export const AssistantAction = z.discriminatedUnion('type', [
  AssistantCreateEventAction,
  AssistantCreateTaskAction,
  AssistantAddListItemsAction,
  AssistantCreateTransactionAction,
]);
export type AssistantAction = z.infer<typeof AssistantAction>;

export const AssistantIssue = z.object({
  index: z.number().int(),
  tool: z.string(),
  code: z.string(),
  message: z.string(),
});

export const AssistantProposal = z.object({
  id: Id,
  kind: z.enum(['capture', 'receipt']),
  status: z.enum(['pending', 'applied', 'discarded']),
  /** Short explanation or follow-up question from the assistant. */
  message: z.string().nullable(),
  actions: z.array(AssistantAction),
  /** Parts of the input that could not be turned into actions (e.g. unknown names). */
  issues: z.array(AssistantIssue),
  /** Created entities per applied action index. */
  results: z.array(z.object({ index: z.number().int(), type: z.string(), id: Id })),
  createdByMemberId: Id,
  createdAt: IsoDateTime,
  appliedAt: IsoDateTime.nullable(),
});
export type AssistantProposal = z.infer<typeof AssistantProposal>;

export const AssistantCaptureBody = z.object({
  text: z.string().trim().min(2).max(1000),
});

export const AssistantApplyBody = z.object({
  /** Subset of actions to apply (default: all not yet applied). */
  actionIndexes: z.array(z.number().int().min(0)).max(50).optional(),
  /** Account for transaction actions without one. */
  accountId: Id.optional(),
});

// ---------------------------------------------------------------- receipts

export const AssistantReceiptBody = z.object({ fileId: Id });

export const AssistantReceipt = z.object({
  merchant: z.string().nullable(),
  date: LocalDate,
  totalMinor: MinorAmount,
  currency: z.string().length(3),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      amountMinor: MinorAmount,
    }),
  ),
  suggestedCategoryKey: z.string().nullable(),
});

export const AssistantReceiptResult = z.object({
  receipt: AssistantReceipt,
  warnings: z.array(z.string()),
  /** Proposal with one `create_transaction` action. */
  proposal: AssistantProposal,
});

// ---------------------------------------------------------------- insights

export const AssistantInsightsBody = z.object({
  months: z.number().int().min(1).max(12).default(3),
});

export const AssistantHighlight = z.object({
  kind: z.enum(['top_category', 'increase', 'decrease', 'savings_rate', 'net_negative']),
  categoryName: z.string().optional(),
  amountMinor: MinorAmount.optional(),
  percent: z.number().optional(),
});

export const AssistantInsights = z.object({
  currency: z.string(),
  months: z.array(z.string()),
  totalIncomeMinor: MinorAmount,
  totalExpenseMinor: MinorAmount,
  avgMonthlyExpenseMinor: MinorAmount,
  savingsRatePercent: z.number().nullable(),
  topCategories: z.array(
    z.object({ name: z.string(), expenseMinor: MinorAmount, percent: z.number() }),
  ),
  highlights: z.array(AssistantHighlight),
  /** Short summary in the caller's language. */
  text: z.string(),
  tips: z.array(z.string()),
});

// ---------------------------------------------------------------- meals

export const AssistantMealsBody = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  servings: z.number().int().min(1).max(20).default(4),
  /** Free-text preferences, e.g. "vegetarisch, kinderfreundlich". */
  preferences: z.string().max(200).optional(),
});

export const AssistantMealIdea = z.object({
  title: z.string(),
  description: z.string(),
  prepMinutes: z.number().int().nullable(),
  ingredients: z.array(
    z.object({ name: z.string(), quantity: z.string().nullable(), inPantry: z.boolean() }),
  ),
  /** Ingredients not in the pantry (computed server-side). */
  missing: z.array(z.string()),
  steps: z.array(z.string()),
});

export const AssistantMealSuggestions = z.object({ ideas: z.array(AssistantMealIdea) });

const tags = ['assistant'];
const base = '/v1/households/:householdId/assistant';
const ProposalParams = withHousehold({ proposalId: Id });

export const assistantContract = {
  settings: defineEndpoint({
    method: 'GET',
    path: `${base}/settings`,
    summary: 'Assistant opt-in status and daily usage',
    tags,
    params: HouseholdParams,
    response: AssistantSettings,
  }),
  enable: defineEndpoint({
    method: 'POST',
    path: `${base}/enable`,
    summary: 'Opt in to the AI assistant (owner/admin, records consent)',
    tags,
    params: HouseholdParams,
    body: EnableAssistantBody,
    response: AssistantSettings,
  }),
  disable: defineEndpoint({
    method: 'POST',
    path: `${base}/disable`,
    summary: 'Opt out of the AI assistant',
    tags,
    params: HouseholdParams,
    response: AssistantSettings,
  }),
  capture: defineEndpoint({
    method: 'POST',
    path: `${base}/capture`,
    summary: 'Turn natural language into proposed events, tasks, list items or transactions',
    tags,
    params: HouseholdParams,
    body: AssistantCaptureBody,
    response: AssistantProposal,
  }),
  receipt: defineEndpoint({
    method: 'POST',
    path: `${base}/receipts`,
    summary: 'Extract a receipt image and propose a transaction',
    tags,
    params: HouseholdParams,
    body: AssistantReceiptBody,
    response: AssistantReceiptResult,
  }),
  insights: defineEndpoint({
    method: 'POST',
    path: `${base}/insights`,
    summary: 'Spending summary of the last months (aggregates only)',
    tags,
    params: HouseholdParams,
    body: AssistantInsightsBody,
    response: AssistantInsights,
  }),
  meals: defineEndpoint({
    method: 'POST',
    path: `${base}/meals`,
    summary: 'Three recipe ideas from pantry ingredients',
    tags,
    params: HouseholdParams,
    body: AssistantMealsBody,
    response: AssistantMealSuggestions,
  }),
  getProposal: defineEndpoint({
    method: 'GET',
    path: `${base}/proposals/:proposalId`,
    summary: 'Proposal',
    tags,
    params: ProposalParams,
    response: AssistantProposal,
  }),
  apply: defineEndpoint({
    method: 'POST',
    path: `${base}/proposals/:proposalId/apply`,
    summary: 'Execute (a subset of) the proposed actions with the caller permissions',
    tags,
    params: ProposalParams,
    body: AssistantApplyBody,
    response: AssistantProposal,
  }),
  discard: defineEndpoint({
    method: 'POST',
    path: `${base}/proposals/:proposalId/discard`,
    summary: 'Discard a proposal',
    tags,
    params: ProposalParams,
    response: AssistantProposal,
  }),
} as const;
