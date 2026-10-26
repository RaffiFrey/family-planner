import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { Queues } from '../events/queues.js';
import { HealthService } from './health/health.service.js';
import { HomeService } from './home/home.service.js';
import { LocationService } from './location/location.service.js';
import { VaultService } from './vault/vault.service.js';

const MINUTE = 60_000;

/** Repeatable jobs of the care modules (reminders, OCR sweep, location retention). */
@Injectable()
export class CareJobs implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly queues: Queues,
    private readonly vault: VaultService,
    private readonly health: HealthService,
    private readonly home: HomeService,
    private readonly location: LocationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Job name → [handler, interval]. Daily reminders run hourly; once-keys prevent repeats. */
  private readonly jobs: Record<string, [() => Promise<unknown>, number]> = {
    'care-vault-expiry': [() => this.vault.expiryReminders(), 60 * MINUTE],
    'care-vault-ocr-sweep': [() => this.vault.ocrSweep(), 15 * MINUTE],
    'care-medication': [() => this.health.medicationReminders(), MINUTE],
    'care-health-daily': [() => this.health.healthReminders(), 60 * MINUTE],
    'care-home-maintenance': [() => this.home.maintenanceReminders(), 60 * MINUTE],
    'care-location-retention': [() => this.location.retention(), 10 * MINUTE],
  };

  onModuleInit(): void {
    for (const [name, [fn]] of Object.entries(this.jobs)) this.queues.on('maintenance', name, fn);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.RUN_WORKERS) return;
    for (const [name, [, every]] of Object.entries(this.jobs)) {
      await this.queues.schedule(name, every);
    }
  }
}
