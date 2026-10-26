import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import { ENV, type Env } from '../../config/env.js';

export const QUEUE_NAMES = ['events', 'files', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export type JobHandler = (job: Job) => Promise<unknown>;

function connection(env: Env) {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    maxRetriesPerRequest: null,
  };
}

/**
 * BullMQ queues plus a handler registry. Modules register handlers by job name;
 * `startWorkers()` runs them (in the API process in dev, in `worker.ts` in production).
 */
@Injectable()
export class Queues implements OnApplicationShutdown {
  private readonly logger = new Logger(Queues.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly handlers = new Map<string, JobHandler[]>();
  private readonly workers: Worker[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    for (const name of QUEUE_NAMES) {
      this.queues.set(
        name,
        new Queue(name, {
          connection: connection(env),
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        }),
      );
    }
  }

  get(name: QueueName): Queue {
    return this.queues.get(name) as Queue;
  }

  async add(
    name: QueueName,
    job: string,
    data: Record<string, unknown>,
    opts: { jobId?: string; delay?: number } = {},
  ) {
    return this.get(name).add(job, data, opts);
  }

  /** Registers a handler for `queue:job`. Multiple handlers per job are allowed (event fan-out). */
  on(queue: QueueName, job: string, handler: JobHandler): void {
    const key = `${queue}:${job}`;
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), handler]);
  }

  async schedule(job: string, everyMs: number): Promise<void> {
    await this.get('maintenance').upsertJobScheduler(
      job,
      { every: everyMs },
      { name: job, data: {} },
    );
  }

  startWorkers(): void {
    for (const name of QUEUE_NAMES) {
      const worker = new Worker(
        name,
        async (job) => {
          const handlers = this.handlers.get(`${name}:${job.name}`) ?? [];
          for (const h of handlers) await h(job);
        },
        { connection: connection(this.env), concurrency: name === 'files' ? 2 : 10 },
      );
      worker.on('failed', (job, err) => {
        this.logger.warn(`Job ${name}:${job?.name ?? '?'} failed: ${err.message}`);
      });
      this.workers.push(worker);
    }
    this.logger.log(`Workers started for ${QUEUE_NAMES.join(', ')}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}
