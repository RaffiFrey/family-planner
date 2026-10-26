import { Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { BANK_SYNC_PROVIDER, type BankSyncProvider } from './bank-sync/bank-provider.js';
import { BankSyncService } from './bank-sync/bank-sync.service.js';
import { FinApiBankProvider } from './bank-sync/finapi.provider.js';
import { MockBankProvider } from './bank-sync/mock.provider.js';
import { ContractsService } from './contracts.service.js';
import { FinancePlusController } from './finance-plus.controller.js';
import { FinancePlusJobs } from './finance-plus.jobs.js';
import { GoalsService } from './goals.service.js';
import { FinanceReportsService } from './reports.service.js';
import { SharedExpensesService } from './shared-expenses.service.js';

/** Selects the PSD2 aggregator from BANK_SYNC_PROVIDER (null = bank sync unavailable). */
export function bankSyncProvider(env: Env): BankSyncProvider | null {
  if (env.BANK_SYNC_PROVIDER === 'mock') return new MockBankProvider();
  if (env.BANK_SYNC_PROVIDER === 'finapi') {
    if (!env.FINAPI_CLIENT_ID || !env.FINAPI_CLIENT_SECRET) {
      new Logger('BankSync').warn('finAPI selected but FINAPI_CLIENT_ID/SECRET missing');
      return null;
    }
    return new FinApiBankProvider({
      baseUrl: env.FINAPI_BASE_URL,
      clientId: env.FINAPI_CLIENT_ID,
      clientSecret: env.FINAPI_CLIENT_SECRET,
    });
  }
  return null;
}

/** P2/P3 finance: contracts, savings goals, shared expenses, advanced reports, bank sync. */
@Module({
  controllers: [FinancePlusController],
  providers: [
    { provide: BANK_SYNC_PROVIDER, inject: [ENV], useFactory: bankSyncProvider },
    ContractsService,
    GoalsService,
    SharedExpensesService,
    FinanceReportsService,
    BankSyncService,
    FinancePlusJobs,
  ],
  exports: [ContractsService, GoalsService, SharedExpensesService, BankSyncService],
})
export class FinancePlusModule {}
