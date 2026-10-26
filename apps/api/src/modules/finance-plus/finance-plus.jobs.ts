import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { Queues } from '../events/queues.js';
import { BankSyncService } from './bank-sync/bank-sync.service.js';
import { ContractsService } from './contracts.service.js';

const HOUR = 3_600_000;

/** Scheduled finance work: contract notice reminders (daily) and PSD2 bank sync (every 6 h). */
@Injectable()
export class FinancePlusJobs implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly queues: Queues,
    private readonly contracts: ContractsService,
    private readonly bankSync: BankSyncService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('maintenance', 'contract-notices', () => this.contracts.noticeReminders());
    this.queues.on('maintenance', 'bank-sync', () => this.bankSync.syncAll());
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.RUN_WORKERS) return;
    await this.queues.schedule('contract-notices', 24 * HOUR);
    if (this.env.BANK_SYNC_PROVIDER !== 'none') await this.queues.schedule('bank-sync', 6 * HOUR);
  }
}
