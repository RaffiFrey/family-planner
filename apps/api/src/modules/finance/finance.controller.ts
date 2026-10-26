import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { FinanceService } from './finance.service.js';

const C = apiContract.finance;

@Controller()
export class FinanceController {
  constructor(private readonly s: FinanceService) {}

  @Endpoint(C.overview, { action: 'finance.read' })
  overview(@Household() ctx: HouseholdContext) {
    return this.s.overview(ctx);
  }

  @Endpoint(C.listAccounts, { action: 'finance.read' })
  listAccounts(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listAccounts>) {
    return this.s.listAccounts(ctx, i);
  }

  @Endpoint(C.createAccount, { action: 'finance.write' })
  createAccount(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createAccount>) {
    return this.s.createAccount(ctx, i);
  }

  @Endpoint(C.updateAccount, { action: 'finance.write' })
  updateAccount(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateAccount>) {
    return this.s.updateAccount(ctx, i);
  }

  @Endpoint(C.deleteAccount, { action: 'finance.write' })
  deleteAccount(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteAccount>) {
    return this.s.deleteAccount(ctx, i);
  }

  @Endpoint(C.listCategories, { action: 'finance.read' })
  listCategories(@Household() ctx: HouseholdContext) {
    return this.s.listCategories(ctx);
  }

  @Endpoint(C.createCategory, { action: 'finance.write' })
  createCategory(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createCategory>) {
    return this.s.createCategory(ctx, i);
  }

  @Endpoint(C.updateCategory, { action: 'finance.write' })
  updateCategory(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateCategory>) {
    return this.s.updateCategory(ctx, i);
  }

  @Endpoint(C.listTransactions, { action: 'finance.read' })
  listTransactions(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listTransactions>) {
    return this.s.listTransactions(ctx, i);
  }

  @Endpoint(C.createTransaction, { action: 'finance.write' })
  createTransaction(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.createTransaction>,
  ) {
    return this.s.createTransaction(ctx, i);
  }

  @Endpoint(C.updateTransaction, { action: 'finance.write' })
  updateTransaction(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.updateTransaction>,
  ) {
    return this.s.updateTransaction(ctx, i);
  }

  @Endpoint(C.deleteTransaction, { action: 'finance.write' })
  deleteTransaction(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.deleteTransaction>,
  ) {
    return this.s.deleteTransaction(ctx, i);
  }

  @Endpoint(C.listRules, { action: 'finance.read' })
  listRules(@Household() ctx: HouseholdContext) {
    return this.s.listRules(ctx);
  }

  @Endpoint(C.createRule, { action: 'finance.write' })
  createRule(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createRule>) {
    return this.s.createRule(ctx, i);
  }

  @Endpoint(C.deleteRule, { action: 'finance.write' })
  deleteRule(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteRule>) {
    return this.s.deleteRule(ctx, i);
  }

  @Endpoint(C.listBudgets, { action: 'finance.read' })
  listBudgets(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listBudgets>) {
    return this.s.listBudgets(ctx, i);
  }

  @Endpoint(C.createBudget, { action: 'finance.write' })
  createBudget(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createBudget>) {
    return this.s.createBudget(ctx, i);
  }

  @Endpoint(C.updateBudget, { action: 'finance.write' })
  updateBudget(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateBudget>) {
    return this.s.updateBudget(ctx, i);
  }

  @Endpoint(C.deleteBudget, { action: 'finance.write' })
  deleteBudget(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteBudget>) {
    return this.s.deleteBudget(ctx, i);
  }

  @Endpoint(C.csvPresets)
  csvPresets() {
    return this.s.csvPresets();
  }

  @Endpoint(C.previewImport, { action: 'finance.write' })
  previewImport(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.previewImport>) {
    return this.s.previewImport(ctx, i);
  }

  @Endpoint(C.importStatement, { action: 'finance.write' })
  importStatement(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.importStatement>) {
    return this.s.importStatement(ctx, i);
  }

  @Endpoint(C.cashflow, { action: 'finance.read' })
  cashflow(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.cashflow>) {
    return this.s.cashflow(ctx, i);
  }

  @Endpoint(C.byCategory, { action: 'finance.read' })
  byCategory(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.byCategory>) {
    return this.s.byCategory(ctx, i);
  }
}
