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
  YearMonth,
} from '../core.js';
import { Visibility } from './calendar.js';
import { AccountType } from './finance.js';
import { Currency, HexColor } from './households.js';

const tags = ['finance'];
const base = '/v1/households/:householdId/finance';
const PositiveAmount = MinorAmount.refine((v) => v > 0, 'Must be positive');

// ---------------------------------------------------------------- contracts

export const FinContractInterval = z.enum([
  'weekly',
  'monthly',
  'quarterly',
  'halfyearly',
  'yearly',
]);
export const FinContractType = z.enum(['subscription', 'insurance', 'utility', 'loan', 'other']);
export const FinContractStatus = z.enum(['active', 'cancelled', 'dismissed']);
export const FinPaymentDirection = z.enum(['in', 'out']);

export const FinContract = z.object({
  id: Id,
  name: z.string(),
  contractType: FinContractType,
  status: FinContractStatus,
  counterpartyName: z.string().nullable(),
  direction: FinPaymentDirection,
  /** Positive amount per interval. */
  amountMinor: MinorAmount,
  currency: Currency,
  interval: FinContractInterval,
  monthlyMinor: MinorAmount,
  yearlyMinor: MinorAmount,
  categoryId: Id.nullable(),
  accountId: Id.nullable(),
  startDate: LocalDate.nullable(),
  nextDueDate: LocalDate.nullable(),
  minimumTermEnd: LocalDate.nullable(),
  noticePeriodDays: z.number().int().nullable(),
  /** Last day to give notice (computed from term end / next due date and notice period). */
  cancellationDeadline: LocalDate.nullable(),
  endDate: LocalDate.nullable(),
  providerName: z.string().nullable(),
  providerContact: z.string().nullable(),
  contractNumber: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.enum(['manual', 'detected']),
  confidence: z.number().nullable(),
  createdAt: IsoDateTime,
});
export type FinContract = z.infer<typeof FinContract>;

const contractFields = {
  name: z.string().trim().min(1).max(120),
  contractType: FinContractType,
  direction: FinPaymentDirection,
  amountMinor: PositiveAmount,
  interval: FinContractInterval,
  categoryId: Id.nullable(),
  accountId: Id.nullable(),
  startDate: LocalDate.nullable(),
  nextDueDate: LocalDate.nullable(),
  minimumTermEnd: LocalDate.nullable(),
  noticePeriodDays: z.number().int().min(0).max(3650).nullable(),
  endDate: LocalDate.nullable(),
  providerName: z.string().max(120).nullable(),
  providerContact: z.string().max(300).nullable(),
  contractNumber: z.string().max(100).nullable(),
  notes: z.string().max(2000).nullable(),
  /** Counterparty used to match future transactions. */
  counterpartyName: z.string().max(200).nullable(),
};

export const CreateFinContractBody = z.object({
  ...contractFields,
  contractType: FinContractType.default('other'),
  direction: FinPaymentDirection.default('out'),
  currency: Currency.optional(),
  categoryId: Id.nullable().optional(),
  accountId: Id.nullable().optional(),
  startDate: LocalDate.nullable().optional(),
  nextDueDate: LocalDate.nullable().optional(),
  minimumTermEnd: LocalDate.nullable().optional(),
  noticePeriodDays: contractFields.noticePeriodDays.optional(),
  endDate: LocalDate.nullable().optional(),
  providerName: contractFields.providerName.optional(),
  providerContact: contractFields.providerContact.optional(),
  contractNumber: contractFields.contractNumber.optional(),
  notes: contractFields.notes.optional(),
  counterpartyName: contractFields.counterpartyName.optional(),
});
export const UpdateFinContractBody = z
  .object({ ...contractFields, status: z.enum(['active', 'cancelled']) })
  .partial();

export const FinContractSuggestion = z.object({
  /** Pass back to confirm/dismiss. */
  key: z.string(),
  name: z.string(),
  counterpartyName: z.string().nullable(),
  direction: FinPaymentDirection,
  interval: FinContractInterval,
  averageAmountMinor: MinorAmount,
  lastAmountMinor: MinorAmount,
  currency: Currency,
  occurrences: z.number().int(),
  firstDate: LocalDate,
  lastDate: LocalDate,
  nextExpectedDate: LocalDate,
  confidence: z.number(),
  suggestedType: FinContractType,
  categoryId: Id.nullable(),
  accountId: Id.nullable(),
  transactionIds: z.array(Id),
});

export const ConfirmFinContractSuggestionBody = z.object({
  key: z.string().min(1).max(500),
  name: contractFields.name.optional(),
  contractType: FinContractType.optional(),
  noticePeriodDays: contractFields.noticePeriodDays.optional(),
  minimumTermEnd: LocalDate.nullable().optional(),
  providerName: contractFields.providerName.optional(),
  contractNumber: contractFields.contractNumber.optional(),
  notes: contractFields.notes.optional(),
});

export const FinContractTypeTotals = z.object({
  contractType: FinContractType,
  count: z.number().int(),
  monthlyMinor: MinorAmount,
  yearlyMinor: MinorAmount,
});
export const FinContractSummary = z.object({
  currency: Currency,
  activeCount: z.number().int(),
  monthlyMinor: MinorAmount,
  yearlyMinor: MinorAmount,
  monthlyIncomeMinor: MinorAmount,
  byType: z.array(FinContractTypeTotals),
  upcomingDeadlines: z.array(
    z.object({
      contractId: Id,
      name: z.string(),
      cancellationDeadline: LocalDate,
      daysLeft: z.number().int(),
    }),
  ),
  /** Detected but not yet confirmed or dismissed. */
  suggestionCount: z.number().int(),
});
export const InsuranceOverview = z.object({
  currency: Currency,
  monthlyMinor: MinorAmount,
  yearlyMinor: MinorAmount,
  contracts: z.array(FinContract),
});

// ---------------------------------------------------------------- goals

export const GoalContribution = z.object({
  id: Id,
  goalId: Id,
  amountMinor: MinorAmount,
  date: LocalDate,
  memberId: Id.nullable(),
  note: z.string().nullable(),
  createdAt: IsoDateTime,
});

export const SavingsGoal = z.object({
  id: Id,
  name: z.string(),
  targetMinor: MinorAmount,
  currency: Currency,
  deadline: LocalDate.nullable(),
  accountId: Id.nullable(),
  color: HexColor.nullable(),
  icon: z.string().nullable(),
  archived: z.boolean(),
  /** `account`: progress is the linked account's balance; otherwise the sum of contributions. */
  progressSource: z.enum(['account', 'contributions']),
  savedMinor: MinorAmount,
  remainingMinor: MinorAmount,
  ratio: z.number(),
  reached: z.boolean(),
  reachedAt: IsoDateTime.nullable(),
  monthsLeft: z.number().int().nullable(),
  requiredMonthlyMinor: MinorAmount.nullable(),
  createdAt: IsoDateTime,
});

export const CreateSavingsGoalBody = z.object({
  name: z.string().trim().min(1).max(80),
  targetMinor: PositiveAmount,
  currency: Currency.optional(),
  deadline: LocalDate.nullable().optional(),
  accountId: Id.nullable().optional(),
  color: HexColor.nullable().optional(),
  icon: z.string().max(32).nullable().optional(),
});
export const UpdateSavingsGoalBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetMinor: PositiveAmount,
    deadline: LocalDate.nullable(),
    accountId: Id.nullable(),
    color: HexColor.nullable(),
    icon: z.string().max(32).nullable(),
    archived: z.boolean(),
  })
  .partial();
export const CreateGoalContributionBody = z.object({
  amountMinor: MinorAmount.refine((v) => v !== 0, 'Must not be zero'),
  date: LocalDate.optional(),
  memberId: Id.nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

// ---------------------------------------------------------------- shared expenses

export const SharedSplitMethod = z.enum(['equal', 'exact', 'percent', 'shares']);

export const ExpenseParty = z.object({
  id: Id,
  name: z.string(),
  /** Set for household members; null for external people. */
  memberId: Id.nullable(),
  archived: z.boolean(),
});
export const CreateExpensePartyBody = z.object({ name: z.string().trim().min(1).max(80) });
export const UpdateExpensePartyBody = z
  .object({ name: z.string().trim().min(1).max(80), archived: z.boolean() })
  .partial();

export const ExpenseShare = z.object({
  partyId: Id,
  /** Percent, weight or exact amount depending on the split method; null for equal. */
  value: z.number().nullable(),
  amountMinor: MinorAmount,
});
export const SharedExpense = z.object({
  id: Id,
  title: z.string(),
  amountMinor: MinorAmount,
  currency: Currency,
  date: LocalDate,
  paidByPartyId: Id,
  splitMethod: SharedSplitMethod,
  shares: z.array(ExpenseShare),
  transactionId: Id.nullable(),
  notes: z.string().nullable(),
  createdByMemberId: Id.nullable(),
  createdAt: IsoDateTime,
});
const ShareInputBody = z.object({ partyId: Id, value: z.number().min(0).nullable().optional() });
export const CreateSharedExpenseBody = z.object({
  title: z.string().trim().min(1).max(120),
  amountMinor: PositiveAmount,
  currency: Currency.optional(),
  date: LocalDate,
  paidByPartyId: Id,
  splitMethod: SharedSplitMethod.default('equal'),
  shares: z.array(ShareInputBody).min(1).max(50),
  transactionId: Id.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const UpdateSharedExpenseBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    amountMinor: PositiveAmount,
    date: LocalDate,
    paidByPartyId: Id,
    splitMethod: SharedSplitMethod,
    shares: z.array(ShareInputBody).min(1).max(50),
    transactionId: Id.nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .partial();

export const PartyBalances = z.object({
  currency: Currency,
  balances: z.array(
    z.object({
      partyId: Id,
      name: z.string(),
      /** Positive: gets money back; negative: owes money. */
      balanceMinor: MinorAmount,
    }),
  ),
});
export const SettleUpSuggestion = z.object({
  currency: Currency,
  fromPartyId: Id,
  toPartyId: Id,
  amountMinor: MinorAmount,
});
export const ExpenseSettlement = z.object({
  id: Id,
  fromPartyId: Id,
  toPartyId: Id,
  amountMinor: MinorAmount,
  currency: Currency,
  date: LocalDate,
  note: z.string().nullable(),
  createdAt: IsoDateTime,
});
export const CreateExpenseSettlementBody = z.object({
  fromPartyId: Id,
  toPartyId: Id,
  amountMinor: PositiveAmount,
  currency: Currency.optional(),
  date: LocalDate.optional(),
  note: z.string().max(200).nullable().optional(),
});

// ---------------------------------------------------------------- advanced reports

export const NetWorthPointDto = z.object({
  month: YearMonth,
  netWorthMinor: MinorAmount,
  accounts: z.array(z.object({ accountId: Id, balanceMinor: MinorAmount })),
});
export const NetWorthReport = z.object({ currency: Currency, points: z.array(NetWorthPointDto) });
export const CategoryTrendsReport = z.object({
  months: z.array(YearMonth),
  categories: z.array(
    z.object({
      categoryId: Id.nullable(),
      expenseMinor: z.array(MinorAmount),
      incomeMinor: z.array(MinorAmount),
      totalExpenseMinor: MinorAmount,
      averageExpenseMinor: MinorAmount,
    }),
  ),
});
export const YearOverYearReport = z.object({
  year: z.number().int(),
  months: z.array(
    z.object({
      month: z.number().int(),
      incomeMinor: MinorAmount,
      expenseMinor: MinorAmount,
      previousIncomeMinor: MinorAmount,
      previousExpenseMinor: MinorAmount,
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: Id.nullable(),
      expenseMinor: MinorAmount,
      previousExpenseMinor: MinorAmount,
      change: z.number().nullable(),
    }),
  ),
  totals: z.object({
    incomeMinor: MinorAmount,
    expenseMinor: MinorAmount,
    previousIncomeMinor: MinorAmount,
    previousExpenseMinor: MinorAmount,
  }),
});
export const FinanceCsvExport = z.object({ fileName: z.string(), content: z.string() });

// ---------------------------------------------------------------- bank sync

export const SyncBank = z.object({
  id: z.string(),
  name: z.string(),
  bic: z.string().nullable(),
  city: z.string().nullable(),
  logoUrl: z.string().nullable(),
});
export const BankAccountLink = z.object({
  id: Id,
  name: z.string(),
  ibanLast4: z.string().nullable(),
  currency: Currency,
  type: AccountType,
  /** Linked `fin_accounts` id; null until the user links it. */
  accountId: Id.nullable(),
  lastSyncedAt: IsoDateTime.nullable(),
});
export const BankConnection = z.object({
  id: Id,
  provider: z.enum(['mock', 'finapi']),
  bankId: z.string(),
  bankName: z.string(),
  status: z.enum(['pending', 'active', 'error', 'expired']),
  lastSyncedAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  consentExpiresAt: IsoDateTime.nullable(),
  accounts: z.array(BankAccountLink),
  createdAt: IsoDateTime,
});
export const StartBankConnectionResult = z.object({
  connectionId: Id,
  /** Open in a browser / in-app browser; the aggregator handles bank login and SCA. */
  redirectUrl: z.string(),
});
export const BankCallbackResult = z.object({
  connectionId: Id,
  householdId: Id,
  status: BankConnection.shape.status,
  /** Where the web/mobile app continues. */
  redirectTo: z.string(),
});
export const LinkBankAccountBody = z.object({
  /** Existing account to sync into; omit/null to create a new account. */
  accountId: Id.nullable().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  visibility: Visibility.default('household'),
});
export const BankSyncResult = z.object({
  connectionId: Id,
  status: BankConnection.shape.status,
  imported: z.number().int(),
  duplicates: z.number().int(),
});

// ---------------------------------------------------------------- endpoints

const ContractParams = withHousehold({ contractId: Id });
const GoalParams = withHousehold({ goalId: Id });
const PartyParams = withHousehold({ partyId: Id });
const ExpenseParams = withHousehold({ expenseId: Id });
const ConnectionParams = withHousehold({ connectionId: Id });

export const financePlusContract = {
  // contracts
  listContracts: defineEndpoint({
    method: 'GET',
    path: `${base}/contracts`,
    summary: 'Contracts and subscriptions',
    tags,
    params: HouseholdParams,
    query: z.object({
      status: z.enum(['active', 'cancelled', 'all']).default('all'),
      type: FinContractType.optional(),
    }),
    response: z.array(FinContract),
  }),
  contractSuggestions: defineEndpoint({
    method: 'GET',
    path: `${base}/contracts/suggestions`,
    summary: 'Recurring payments detected in transactions',
    tags,
    params: HouseholdParams,
    response: z.array(FinContractSuggestion),
  }),
  confirmSuggestion: defineEndpoint({
    method: 'POST',
    path: `${base}/contracts/suggestions/confirm`,
    summary: 'Turn a detected recurring payment into a contract',
    tags,
    params: HouseholdParams,
    body: ConfirmFinContractSuggestionBody,
    response: FinContract,
  }),
  dismissSuggestion: defineEndpoint({
    method: 'POST',
    path: `${base}/contracts/suggestions/dismiss`,
    summary: 'Hide a detected recurring payment',
    tags,
    params: HouseholdParams,
    body: z.object({ key: z.string().min(1).max(500) }),
    response: Ok,
    status: 200,
  }),
  contractSummary: defineEndpoint({
    method: 'GET',
    path: `${base}/contracts/summary`,
    summary: 'Monthly/yearly contract costs per type and upcoming notice deadlines',
    tags,
    params: HouseholdParams,
    response: FinContractSummary,
  }),
  insuranceOverview: defineEndpoint({
    method: 'GET',
    path: `${base}/contracts/insurance`,
    summary: 'Insurance policies with yearly cost',
    tags,
    params: HouseholdParams,
    response: InsuranceOverview,
  }),
  createContract: defineEndpoint({
    method: 'POST',
    path: `${base}/contracts`,
    summary: 'Create contract',
    tags,
    params: HouseholdParams,
    body: CreateFinContractBody,
    response: FinContract,
  }),
  updateContract: defineEndpoint({
    method: 'PATCH',
    path: `${base}/contracts/:contractId`,
    summary: 'Update / cancel contract',
    tags,
    params: ContractParams,
    body: UpdateFinContractBody,
    response: FinContract,
  }),
  deleteContract: defineEndpoint({
    method: 'DELETE',
    path: `${base}/contracts/:contractId`,
    summary: 'Delete contract',
    tags,
    params: ContractParams,
    response: Ok,
  }),

  // goals
  listGoals: defineEndpoint({
    method: 'GET',
    path: `${base}/goals`,
    summary: 'Savings goals with progress',
    tags,
    params: HouseholdParams,
    query: z.object({ includeArchived: z.stringbool().default(false) }),
    response: z.array(SavingsGoal),
  }),
  createGoal: defineEndpoint({
    method: 'POST',
    path: `${base}/goals`,
    summary: 'Create savings goal',
    tags,
    params: HouseholdParams,
    body: CreateSavingsGoalBody,
    response: SavingsGoal,
  }),
  updateGoal: defineEndpoint({
    method: 'PATCH',
    path: `${base}/goals/:goalId`,
    summary: 'Update savings goal',
    tags,
    params: GoalParams,
    body: UpdateSavingsGoalBody,
    response: SavingsGoal,
  }),
  deleteGoal: defineEndpoint({
    method: 'DELETE',
    path: `${base}/goals/:goalId`,
    summary: 'Delete savings goal',
    tags,
    params: GoalParams,
    response: Ok,
  }),
  listContributions: defineEndpoint({
    method: 'GET',
    path: `${base}/goals/:goalId/contributions`,
    summary: 'Contributions to a goal (newest first)',
    tags,
    params: GoalParams,
    response: z.array(GoalContribution),
  }),
  addContribution: defineEndpoint({
    method: 'POST',
    path: `${base}/goals/:goalId/contributions`,
    summary: 'Add contribution (negative = withdrawal)',
    tags,
    params: GoalParams,
    body: CreateGoalContributionBody,
    response: SavingsGoal,
  }),
  removeContribution: defineEndpoint({
    method: 'DELETE',
    path: `${base}/goals/:goalId/contributions/:contributionId`,
    summary: 'Remove contribution',
    tags,
    params: withHousehold({ goalId: Id, contributionId: Id }),
    response: SavingsGoal,
  }),

  // shared expenses
  listParties: defineEndpoint({
    method: 'GET',
    path: `${base}/shared/parties`,
    summary: 'People taking part in shared expenses (members + external)',
    tags,
    params: HouseholdParams,
    response: z.array(ExpenseParty),
  }),
  createParty: defineEndpoint({
    method: 'POST',
    path: `${base}/shared/parties`,
    summary: 'Add external person',
    tags,
    params: HouseholdParams,
    body: CreateExpensePartyBody,
    response: ExpenseParty,
  }),
  updateParty: defineEndpoint({
    method: 'PATCH',
    path: `${base}/shared/parties/:partyId`,
    summary: 'Rename / archive person',
    tags,
    params: PartyParams,
    body: UpdateExpensePartyBody,
    response: ExpenseParty,
  }),
  deleteParty: defineEndpoint({
    method: 'DELETE',
    path: `${base}/shared/parties/:partyId`,
    summary: 'Delete external person (archived when still referenced)',
    tags,
    params: PartyParams,
    response: Ok,
  }),
  listSharedExpenses: defineEndpoint({
    method: 'GET',
    path: `${base}/shared/expenses`,
    summary: 'Shared expenses (newest first)',
    tags,
    params: HouseholdParams,
    query: CursorQuery.extend({ partyId: Id.optional() }),
    response: page(SharedExpense),
  }),
  createSharedExpense: defineEndpoint({
    method: 'POST',
    path: `${base}/shared/expenses`,
    summary: 'Add shared expense',
    tags,
    params: HouseholdParams,
    body: CreateSharedExpenseBody,
    response: SharedExpense,
  }),
  updateSharedExpense: defineEndpoint({
    method: 'PATCH',
    path: `${base}/shared/expenses/:expenseId`,
    summary: 'Update shared expense',
    tags,
    params: ExpenseParams,
    body: UpdateSharedExpenseBody,
    response: SharedExpense,
  }),
  deleteSharedExpense: defineEndpoint({
    method: 'DELETE',
    path: `${base}/shared/expenses/:expenseId`,
    summary: 'Delete shared expense',
    tags,
    params: ExpenseParams,
    response: Ok,
  }),
  sharedBalances: defineEndpoint({
    method: 'GET',
    path: `${base}/shared/balances`,
    summary: 'Who owes whom, per currency',
    tags,
    params: HouseholdParams,
    response: z.array(PartyBalances),
  }),
  settleUpSuggestions: defineEndpoint({
    method: 'GET',
    path: `${base}/shared/settle-up`,
    summary: 'Fewest transfers to settle all balances',
    tags,
    params: HouseholdParams,
    response: z.array(SettleUpSuggestion),
  }),
  listSettlements: defineEndpoint({
    method: 'GET',
    path: `${base}/shared/settlements`,
    summary: 'Recorded settlements',
    tags,
    params: HouseholdParams,
    response: z.array(ExpenseSettlement),
  }),
  createSettlement: defineEndpoint({
    method: 'POST',
    path: `${base}/shared/settlements`,
    summary: 'Record a settlement payment',
    tags,
    params: HouseholdParams,
    body: CreateExpenseSettlementBody,
    response: ExpenseSettlement,
  }),
  deleteSettlement: defineEndpoint({
    method: 'DELETE',
    path: `${base}/shared/settlements/:settlementId`,
    summary: 'Delete settlement',
    tags,
    params: withHousehold({ settlementId: Id }),
    response: Ok,
  }),

  // advanced reports
  netWorth: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/net-worth`,
    summary: 'Net worth at each month end',
    tags,
    params: HouseholdParams,
    query: z.object({ from: YearMonth, to: YearMonth }),
    response: NetWorthReport,
  }),
  categoryTrends: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/category-trends`,
    summary: 'Spending per category and month',
    tags,
    params: HouseholdParams,
    query: z.object({ from: YearMonth, to: YearMonth }),
    response: CategoryTrendsReport,
  }),
  yearOverYear: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/year-over-year`,
    summary: 'Year compared with the previous year',
    tags,
    params: HouseholdParams,
    query: z.object({ year: z.coerce.number().int().min(2000).max(2100) }),
    response: YearOverYearReport,
  }),
  exportTransactions: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/export`,
    summary: 'Transactions as CSV (e.g. for the tax return)',
    tags,
    params: HouseholdParams,
    query: z.object({ from: LocalDate, to: LocalDate, accountId: Id.optional() }),
    response: FinanceCsvExport,
  }),

  // bank sync
  listBanks: defineEndpoint({
    method: 'GET',
    path: `${base}/bank-sync/banks`,
    summary: 'Search banks supported by the aggregator',
    tags,
    params: HouseholdParams,
    query: z.object({ q: z.string().max(100).default('') }),
    response: z.array(SyncBank),
  }),
  listConnections: defineEndpoint({
    method: 'GET',
    path: `${base}/bank-sync/connections`,
    summary: 'Bank connections with their accounts',
    tags,
    params: HouseholdParams,
    response: z.array(BankConnection),
  }),
  startConnection: defineEndpoint({
    method: 'POST',
    path: `${base}/bank-sync/connections`,
    summary: 'Start bank login (returns the aggregator web form URL)',
    tags,
    params: HouseholdParams,
    body: z.object({ bankId: z.string().min(1).max(100) }),
    response: StartBankConnectionResult,
  }),
  completeConnection: defineEndpoint({
    method: 'POST',
    path: `${base}/bank-sync/connections/:connectionId/complete`,
    summary: 'Finish a pending connection (in-app flows)',
    tags,
    params: ConnectionParams,
    response: BankConnection,
    status: 200,
  }),
  bankCallback: defineEndpoint({
    method: 'GET',
    path: '/v1/bank-sync/callback',
    summary: 'Aggregator redirect after bank login',
    tags,
    auth: 'public',
    query: z.object({ state: z.string().min(16).max(200) }),
    response: BankCallbackResult,
  }),
  linkBankAccount: defineEndpoint({
    method: 'POST',
    path: `${base}/bank-sync/connections/:connectionId/accounts/:bankAccountId/link`,
    summary: 'Sync a bank account into a new or existing account',
    tags,
    params: withHousehold({ connectionId: Id, bankAccountId: Id }),
    body: LinkBankAccountBody,
    response: BankConnection,
    status: 200,
  }),
  syncConnection: defineEndpoint({
    method: 'POST',
    path: `${base}/bank-sync/connections/:connectionId/sync`,
    summary: 'Fetch new transactions now',
    tags,
    params: ConnectionParams,
    response: BankSyncResult,
    status: 200,
  }),
  deleteConnection: defineEndpoint({
    method: 'DELETE',
    path: `${base}/bank-sync/connections/:connectionId`,
    summary: 'Remove connection (accounts and transactions are kept)',
    tags,
    params: ConnectionParams,
    response: Ok,
  }),
} as const;
