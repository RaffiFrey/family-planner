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
import { Currency, HexColor } from './households.js';

export const AccountType = z.enum([
  'checking',
  'savings',
  'cash',
  'credit_card',
  'depot',
  'loan',
  'other',
]);

export const Account = z.object({
  id: Id,
  name: z.string(),
  type: AccountType,
  currency: Currency,
  institution: z.string().nullable(),
  /** Only the last 4 characters are returned to clients. */
  ibanLast4: z.string().nullable(),
  openingBalanceMinor: MinorAmount,
  balanceMinor: MinorAmount,
  color: HexColor.nullable(),
  visibility: Visibility,
  ownerMemberId: Id,
  source: z.enum(['manual', 'sync']),
  archived: z.boolean(),
  createdAt: IsoDateTime,
});
export type Account = z.infer<typeof Account>;

export const CreateAccountBody = z.object({
  name: z.string().trim().min(1).max(80),
  type: AccountType,
  currency: Currency.default('EUR'),
  institution: z.string().max(80).nullable().optional(),
  iban: z.string().max(34).nullable().optional(),
  openingBalanceMinor: MinorAmount.default(0),
  color: HexColor.nullable().optional(),
  visibility: Visibility.default('household'),
});
export const UpdateAccountBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: AccountType,
    institution: z.string().max(80).nullable(),
    openingBalanceMinor: MinorAmount,
    color: HexColor.nullable(),
    visibility: Visibility,
    archived: z.boolean(),
  })
  .partial();

export const CategoryKind = z.enum(['income', 'expense', 'transfer']);
export const Category = z.object({
  id: Id,
  parentId: Id.nullable(),
  name: z.string(),
  kind: CategoryKind,
  icon: z.string().nullable(),
  color: HexColor.nullable(),
  /** Stable key of global categories, used by clients for translation. */
  key: z.string().nullable(),
  /** Global default categories can be hidden but not edited. */
  isSystem: z.boolean(),
  hidden: z.boolean(),
});
export type Category = z.infer<typeof Category>;

export const CreateCategoryBody = z.object({
  parentId: Id.nullable().optional(),
  name: z.string().trim().min(1).max(60),
  kind: CategoryKind,
  icon: z.string().max(32).nullable().optional(),
  color: HexColor.nullable().optional(),
});
export const UpdateCategoryBody = z
  .object({
    parentId: Id.nullable(),
    name: z.string().trim().min(1).max(60),
    icon: z.string().max(32).nullable(),
    color: HexColor.nullable(),
    hidden: z.boolean(),
  })
  .partial();

export const Split = z.object({
  categoryId: Id.nullable(),
  amountMinor: MinorAmount,
  memberId: Id.nullable(),
  note: z.string().nullable(),
});

export const Transaction = z.object({
  id: Id,
  accountId: Id,
  bookingDate: LocalDate,
  valueDate: LocalDate.nullable(),
  amountMinor: MinorAmount,
  currency: Currency,
  counterpartyName: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  purpose: z.string(),
  categoryId: Id.nullable(),
  /** Set when the category was applied by a rule (and not changed by a person). */
  ruleId: Id.nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  status: z.enum(['booked', 'pending']),
  source: z.enum(['manual', 'csv', 'camt', 'mt940', 'sync']),
  transferAccountId: Id.nullable(),
  splits: z.array(Split),
  createdAt: IsoDateTime,
});
export type Transaction = z.infer<typeof Transaction>;

export const CreateTransactionBody = z.object({
  accountId: Id,
  bookingDate: LocalDate,
  amountMinor: MinorAmount,
  counterpartyName: z.string().max(200).nullable().optional(),
  purpose: z.string().max(500).default(''),
  categoryId: Id.nullable().optional(),
  tags: z.array(z.string().max(64)).max(10).default([]),
  notes: z.string().max(2000).nullable().optional(),
  /** Creates the mirrored transaction on the target account. */
  transferAccountId: Id.nullable().optional(),
  splits: z
    .array(
      z.object({
        categoryId: Id.nullable(),
        amountMinor: MinorAmount,
        memberId: Id.nullable().default(null),
        note: z.string().max(200).nullable().default(null),
      }),
    )
    .max(20)
    .default([]),
});
export const UpdateTransactionBody = z
  .object({
    bookingDate: LocalDate,
    amountMinor: MinorAmount,
    counterpartyName: z.string().max(200).nullable(),
    purpose: z.string().max(500),
    categoryId: Id.nullable(),
    tags: z.array(z.string().max(64)).max(10),
    notes: z.string().max(2000).nullable(),
    splits: CreateTransactionBody.shape.splits.unwrap(),
    /** Also create a rule so future transactions from this counterparty get this category. */
    createRule: z.boolean(),
  })
  .partial();

export const TransactionQuery = CursorQuery.extend({
  accountId: Id.optional(),
  categoryId: Id.optional(),
  uncategorized: z.stringbool().optional(),
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  q: z.string().max(100).optional(),
});

export const RuleCondition = z.object({
  field: z.enum(['counterparty', 'purpose', 'iban', 'bookingText', 'any']),
  op: z.enum(['contains', 'equals', 'startsWith', 'regex']),
  value: z.string().min(1).max(200),
});
export const Rule = z.object({
  id: Id,
  categoryId: Id,
  priority: z.number().int(),
  conditions: z.array(RuleCondition).min(1),
  direction: z.enum(['in', 'out']).nullable(),
  amountMinMinor: MinorAmount.nullable(),
  amountMaxMinor: MinorAmount.nullable(),
});
export const CreateRuleBody = Rule.omit({ id: true }).extend({
  priority: z.number().int().default(100),
  direction: z.enum(['in', 'out']).nullable().default(null),
  amountMinMinor: MinorAmount.nullable().default(null),
  amountMaxMinor: MinorAmount.nullable().default(null),
  /** Re-categorise existing uncategorised transactions. */
  applyToExisting: z.boolean().default(true),
});

export const Budget = z.object({
  id: Id,
  categoryId: Id,
  period: z.enum(['monthly', 'yearly']),
  limitMinor: MinorAmount,
  rollover: z.boolean(),
});
export const CreateBudgetBody = Budget.omit({ id: true }).extend({
  rollover: z.boolean().default(false),
});
export const UpdateBudgetBody = Budget.omit({ id: true, categoryId: true }).partial();
export const BudgetStatus = z.object({
  budget: Budget,
  periodStart: IsoDateTime,
  periodEnd: IsoDateTime,
  spentMinor: MinorAmount,
  rolloverMinor: MinorAmount,
  availableMinor: MinorAmount,
  remainingMinor: MinorAmount,
  ratio: z.number(),
  level: z.enum(['ok', 'warning', 'exceeded']),
});

export const ImportBody = z.object({
  /** File content (CSV, CAMT.053 XML or MT940). Max ~5 MB. */
  content: z.string().min(1).max(5_000_000),
  fileName: z.string().max(200).optional(),
  presetId: z.string().optional(),
});
export const ImportPreviewRow = z.object({
  bookingDate: LocalDate,
  amountMinor: MinorAmount,
  counterpartyName: z.string().nullable(),
  purpose: z.string(),
  status: z.enum(['booked', 'pending']),
  duplicate: z.boolean(),
  suggestedCategoryId: Id.nullable(),
});
export const ImportPreview = z.object({
  format: z.string(),
  rows: z.array(ImportPreviewRow),
  issues: z.array(z.object({ line: z.number().int(), message: z.string() })),
});
export const ImportResult = z.object({
  importId: Id,
  format: z.string(),
  imported: z.number().int(),
  duplicates: z.number().int(),
  issues: z.array(z.object({ line: z.number().int(), message: z.string() })),
});
export const CsvPresetInfo = z.object({ id: z.string(), name: z.string() });

export const CashflowRow = z.object({
  month: YearMonth,
  incomeMinor: MinorAmount,
  expenseMinor: MinorAmount,
  netMinor: MinorAmount,
});
export const CategoryReportRow = z.object({
  categoryId: Id.nullable(),
  incomeMinor: MinorAmount,
  expenseMinor: MinorAmount,
  count: z.number().int(),
});
export const Overview = z.object({
  currency: Currency,
  netWorthMinor: MinorAmount,
  month: YearMonth,
  incomeMinor: MinorAmount,
  expenseMinor: MinorAmount,
  budgets: z.array(BudgetStatus),
  uncategorizedCount: z.number().int(),
});

const tags = ['finance'];
const AccountParams = withHousehold({ accountId: Id });
const TxParams = withHousehold({ transactionId: Id });
const base = '/v1/households/:householdId/finance';

export const financeContract = {
  overview: defineEndpoint({
    method: 'GET',
    path: `${base}/overview`,
    summary: 'Dashboard numbers for the current month',
    tags,
    params: HouseholdParams,
    response: Overview,
  }),
  listAccounts: defineEndpoint({
    method: 'GET',
    path: `${base}/accounts`,
    summary: 'Accounts with balances',
    tags,
    params: HouseholdParams,
    query: z.object({ includeArchived: z.stringbool().default(false) }),
    response: z.array(Account),
  }),
  createAccount: defineEndpoint({
    method: 'POST',
    path: `${base}/accounts`,
    summary: 'Create manual account',
    tags,
    params: HouseholdParams,
    body: CreateAccountBody,
    response: Account,
  }),
  updateAccount: defineEndpoint({
    method: 'PATCH',
    path: `${base}/accounts/:accountId`,
    summary: 'Update account',
    tags,
    params: AccountParams,
    body: UpdateAccountBody,
    response: Account,
  }),
  deleteAccount: defineEndpoint({
    method: 'DELETE',
    path: `${base}/accounts/:accountId`,
    summary: 'Delete account and its transactions',
    tags,
    params: AccountParams,
    response: Ok,
  }),
  listCategories: defineEndpoint({
    method: 'GET',
    path: `${base}/categories`,
    summary: 'Categories (system + household)',
    tags,
    params: HouseholdParams,
    response: z.array(Category),
  }),
  createCategory: defineEndpoint({
    method: 'POST',
    path: `${base}/categories`,
    summary: 'Create category',
    tags,
    params: HouseholdParams,
    body: CreateCategoryBody,
    response: Category,
  }),
  updateCategory: defineEndpoint({
    method: 'PATCH',
    path: `${base}/categories/:categoryId`,
    summary: 'Update/hide category',
    tags,
    params: withHousehold({ categoryId: Id }),
    body: UpdateCategoryBody,
    response: Category,
  }),
  listTransactions: defineEndpoint({
    method: 'GET',
    path: `${base}/transactions`,
    summary: 'Transactions (newest first)',
    tags,
    params: HouseholdParams,
    query: TransactionQuery,
    response: page(Transaction),
  }),
  createTransaction: defineEndpoint({
    method: 'POST',
    path: `${base}/transactions`,
    summary: 'Create transaction or transfer',
    tags,
    params: HouseholdParams,
    body: CreateTransactionBody,
    response: Transaction,
  }),
  updateTransaction: defineEndpoint({
    method: 'PATCH',
    path: `${base}/transactions/:transactionId`,
    summary: 'Update transaction',
    tags,
    params: TxParams,
    body: UpdateTransactionBody,
    response: Transaction,
  }),
  deleteTransaction: defineEndpoint({
    method: 'DELETE',
    path: `${base}/transactions/:transactionId`,
    summary: 'Delete transaction',
    tags,
    params: TxParams,
    response: Ok,
  }),
  listRules: defineEndpoint({
    method: 'GET',
    path: `${base}/rules`,
    summary: 'Categorisation rules',
    tags,
    params: HouseholdParams,
    response: z.array(Rule),
  }),
  createRule: defineEndpoint({
    method: 'POST',
    path: `${base}/rules`,
    summary: 'Create rule',
    tags,
    params: HouseholdParams,
    body: CreateRuleBody,
    response: Rule,
  }),
  deleteRule: defineEndpoint({
    method: 'DELETE',
    path: `${base}/rules/:ruleId`,
    summary: 'Delete rule',
    tags,
    params: withHousehold({ ruleId: Id }),
    response: Ok,
  }),
  listBudgets: defineEndpoint({
    method: 'GET',
    path: `${base}/budgets`,
    summary: 'Budgets with current status',
    tags,
    params: HouseholdParams,
    query: z.object({ at: IsoDateTime.optional() }),
    response: z.array(BudgetStatus),
  }),
  createBudget: defineEndpoint({
    method: 'POST',
    path: `${base}/budgets`,
    summary: 'Create budget',
    tags,
    params: HouseholdParams,
    body: CreateBudgetBody,
    response: Budget,
  }),
  updateBudget: defineEndpoint({
    method: 'PATCH',
    path: `${base}/budgets/:budgetId`,
    summary: 'Update budget',
    tags,
    params: withHousehold({ budgetId: Id }),
    body: UpdateBudgetBody,
    response: Budget,
  }),
  deleteBudget: defineEndpoint({
    method: 'DELETE',
    path: `${base}/budgets/:budgetId`,
    summary: 'Delete budget',
    tags,
    params: withHousehold({ budgetId: Id }),
    response: Ok,
  }),
  csvPresets: defineEndpoint({
    method: 'GET',
    path: '/v1/finance/csv-presets',
    summary: 'Supported bank CSV formats',
    tags,
    response: z.array(CsvPresetInfo),
  }),
  previewImport: defineEndpoint({
    method: 'POST',
    path: `${base}/accounts/:accountId/imports/preview`,
    summary: 'Parse a statement without saving',
    tags,
    params: AccountParams,
    body: ImportBody,
    response: ImportPreview,
    status: 200,
  }),
  importStatement: defineEndpoint({
    method: 'POST',
    path: `${base}/accounts/:accountId/imports`,
    summary: 'Import CSV / CAMT.053 / MT940',
    tags,
    params: AccountParams,
    body: ImportBody,
    response: ImportResult,
  }),
  cashflow: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/cashflow`,
    summary: 'Monthly cash flow',
    tags,
    params: HouseholdParams,
    query: z.object({ from: YearMonth, to: YearMonth }),
    response: z.array(CashflowRow),
  }),
  byCategory: defineEndpoint({
    method: 'GET',
    path: `${base}/reports/categories`,
    summary: 'Totals by category',
    tags,
    params: HouseholdParams,
    query: z.object({ from: LocalDate, to: LocalDate }),
    response: z.array(CategoryReportRow),
  }),
} as const;
