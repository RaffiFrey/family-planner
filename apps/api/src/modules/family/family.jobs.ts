import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { Queues } from '../events/queues.js';
import { PinboardService } from './pinboard/pinboard.service.js';
import { RewardsService } from './rewards/rewards.service.js';
import { TravelService } from './travel/travel.service.js';

const MINUTE = 60_000;

interface Base {
  householdId: string;
  actorMemberId: string | null;
}

/** Domain event handlers and scheduled jobs of the family-life modules. */
@Injectable()
export class FamilyJobs implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly queues: Queues,
    private readonly rewards: RewardsService,
    private readonly pinboard: PinboardService,
    private readonly travel: TravelService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('events', 'task.completed', async (job) => {
      const d = job.data as Base & { taskId: string; points?: number; memberId: string };
      await this.rewards.awardTaskPoints(d);
    });
    this.queues.on('events', 'rewards.redemption_requested', async (job) => {
      await this.rewards.notifyRedemption(
        job.data as Base & { memberId: string; rewardTitle: string },
      );
    });
    this.queues.on('events', 'rewards.redemption_decided', async (job) => {
      await this.rewards.notifyRedemption(
        job.data as Base & { memberId: string; rewardTitle: string; status: string },
      );
    });
    this.queues.on('events', 'pinboard.post_created', async (job) => {
      await this.pinboard.notifyPost(job.data as Base & { postId: string; text: string });
    });
    this.queues.on('events', 'pinboard.poll_created', async (job) => {
      await this.pinboard.notifyPoll(job.data as Base & { pollId: string; question: string });
    });
    this.queues.on('maintenance', 'allowance-payout', () => this.rewards.payAllowances());
    this.queues.on('maintenance', 'travel-upcoming', () => this.travel.notifyUpcoming());
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.RUN_WORKERS) return;
    await this.queues.schedule('allowance-payout', 30 * MINUTE);
    await this.queues.schedule('travel-upcoming', 60 * MINUTE);
  }
}
