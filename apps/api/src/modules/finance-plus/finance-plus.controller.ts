import { Controller, Req, Res } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { BankSyncService } from './bank-sync/bank-sync.service.js';
import { ContractsService } from './contracts.service.js';
import { GoalsService } from './goals.service.js';
import { FinanceReportsService } from './reports.service.js';
import { SharedExpensesService } from './shared-expenses.service.js';

const C = apiContract.financePlus;
const R = { action: 'finance.read' } as const;
const W = { action: 'finance.write' } as const;

@Controller()
export class FinancePlusController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly goals: GoalsService,
    private readonly shared: SharedExpensesService,
    private readonly reports: FinanceReportsService,
    private readonly bank: BankSyncService,
  ) {}

  // ------------------------------------------------------------ contracts

  @Endpoint(C.listContracts, R)
  listContracts(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listContracts>) {
    return this.contracts.list(ctx, i);
  }

  @Endpoint(C.contractSuggestions, R)
  contractSuggestions(@Household() ctx: HouseholdContext) {
    return this.contracts.suggestions(ctx);
  }

  @Endpoint(C.confirmSuggestion, W)
  confirmSuggestion(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.confirmSuggestion>,
  ) {
    return this.contracts.confirmSuggestion(ctx, i);
  }

  @Endpoint(C.dismissSuggestion, W)
  dismissSuggestion(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.dismissSuggestion>,
  ) {
    return this.contracts.dismissSuggestion(ctx, i);
  }

  @Endpoint(C.contractSummary, R)
  contractSummary(@Household() ctx: HouseholdContext) {
    return this.contracts.summary(ctx);
  }

  @Endpoint(C.insuranceOverview, R)
  insuranceOverview(@Household() ctx: HouseholdContext) {
    return this.contracts.insurance(ctx);
  }

  @Endpoint(C.createContract, W)
  createContract(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createContract>) {
    return this.contracts.create(ctx, i);
  }

  @Endpoint(C.updateContract, W)
  updateContract(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateContract>) {
    return this.contracts.update(ctx, i);
  }

  @Endpoint(C.deleteContract, W)
  deleteContract(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteContract>) {
    return this.contracts.remove(ctx, i);
  }

  // ------------------------------------------------------------ goals

  @Endpoint(C.listGoals, R)
  listGoals(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listGoals>) {
    return this.goals.list(ctx, i);
  }

  @Endpoint(C.createGoal, W)
  createGoal(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createGoal>) {
    return this.goals.create(ctx, i);
  }

  @Endpoint(C.updateGoal, W)
  updateGoal(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateGoal>) {
    return this.goals.update(ctx, i);
  }

  @Endpoint(C.deleteGoal, W)
  deleteGoal(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteGoal>) {
    return this.goals.remove(ctx, i);
  }

  @Endpoint(C.listContributions, R)
  listContributions(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.listContributions>,
  ) {
    return this.goals.listContributions(ctx, i);
  }

  @Endpoint(C.addContribution, W)
  addContribution(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.addContribution>) {
    return this.goals.addContribution(ctx, i);
  }

  @Endpoint(C.removeContribution, W)
  removeContribution(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.removeContribution>,
  ) {
    return this.goals.removeContribution(ctx, i);
  }

  // ------------------------------------------------------------ shared expenses

  @Endpoint(C.listParties, R)
  listParties(@Household() ctx: HouseholdContext) {
    return this.shared.listParties(ctx);
  }

  @Endpoint(C.createParty, W)
  createParty(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createParty>) {
    return this.shared.createParty(ctx, i);
  }

  @Endpoint(C.updateParty, W)
  updateParty(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.updateParty>) {
    return this.shared.updateParty(ctx, i);
  }

  @Endpoint(C.deleteParty, W)
  deleteParty(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteParty>) {
    return this.shared.deleteParty(ctx, i);
  }

  @Endpoint(C.listSharedExpenses, R)
  listSharedExpenses(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.listSharedExpenses>,
  ) {
    return this.shared.listExpenses(ctx, i);
  }

  @Endpoint(C.createSharedExpense, W)
  createSharedExpense(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.createSharedExpense>,
  ) {
    return this.shared.createExpense(ctx, i);
  }

  @Endpoint(C.updateSharedExpense, W)
  updateSharedExpense(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.updateSharedExpense>,
  ) {
    return this.shared.updateExpense(ctx, i);
  }

  @Endpoint(C.deleteSharedExpense, W)
  deleteSharedExpense(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.deleteSharedExpense>,
  ) {
    return this.shared.deleteExpense(ctx, i);
  }

  @Endpoint(C.sharedBalances, R)
  sharedBalances(@Household() ctx: HouseholdContext) {
    return this.shared.balances(ctx);
  }

  @Endpoint(C.settleUpSuggestions, R)
  settleUpSuggestions(@Household() ctx: HouseholdContext) {
    return this.shared.settleUp(ctx);
  }

  @Endpoint(C.listSettlements, R)
  listSettlements(@Household() ctx: HouseholdContext) {
    return this.shared.listSettlements(ctx);
  }

  @Endpoint(C.createSettlement, W)
  createSettlement(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.createSettlement>) {
    return this.shared.createSettlement(ctx, i);
  }

  @Endpoint(C.deleteSettlement, W)
  deleteSettlement(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteSettlement>) {
    return this.shared.deleteSettlement(ctx, i);
  }

  // ------------------------------------------------------------ reports

  @Endpoint(C.netWorth, R)
  netWorth(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.netWorth>) {
    return this.reports.netWorth(ctx, i);
  }

  @Endpoint(C.categoryTrends, R)
  categoryTrends(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.categoryTrends>) {
    return this.reports.categoryTrends(ctx, i);
  }

  @Endpoint(C.yearOverYear, R)
  yearOverYear(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.yearOverYear>) {
    return this.reports.yearOverYear(ctx, i);
  }

  @Endpoint(C.exportTransactions, R)
  exportTransactions(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.exportTransactions>,
  ) {
    return this.reports.exportCsv(ctx, i);
  }

  // ------------------------------------------------------------ bank sync

  @Endpoint(C.listBanks, R)
  listBanks(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.listBanks>) {
    return this.bank.listBanks(ctx, i);
  }

  @Endpoint(C.listConnections, R)
  listConnections(@Household() ctx: HouseholdContext) {
    return this.bank.listConnections(ctx);
  }

  @Endpoint(C.startConnection, W)
  startConnection(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.startConnection>) {
    return this.bank.start(ctx, i);
  }

  @Endpoint(C.completeConnection, W)
  completeConnection(
    @Household() ctx: HouseholdContext,
    @Input() i: In<typeof C.completeConnection>,
  ) {
    return this.bank.complete(ctx, i);
  }

  /** Browsers returning from the bank are redirected to the web app; API clients get JSON. */
  @Endpoint(C.bankCallback)
  async bankCallback(
    @Input() i: In<typeof C.bankCallback>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.bank.callback(i);
    if (req.headers.accept?.includes('text/html')) {
      void reply.status(302).header('location', result.redirectTo);
    }
    return result;
  }

  @Endpoint(C.linkBankAccount, W)
  linkBankAccount(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.linkBankAccount>) {
    return this.bank.link(ctx, i);
  }

  @Endpoint(C.syncConnection, W)
  syncConnection(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.syncConnection>) {
    return this.bank.syncNow(ctx, i);
  }

  @Endpoint(C.deleteConnection, W)
  deleteConnection(@Household() ctx: HouseholdContext, @Input() i: In<typeof C.deleteConnection>) {
    return this.bank.remove(ctx, i);
  }
}
