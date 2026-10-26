import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { EntityChanged } from '@fp/contracts';
import { outbox } from '@fp/db';
import { and, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Db } from '../../infra/database.js';
import { Queues } from './queues.js';
import { RealtimePublisher } from './realtime.js';

/**
 * Transactional outbox relay: picks up committed events (SKIP LOCKED, so several instances
 * can run), pushes entity changes to Socket.IO and domain events to the `events` queue.
 */
@Injectable()
export class OutboxRelay implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly queues: Queues,
    private readonly realtime: RealtimePublisher,
  ) {}

  start(intervalMs = 250): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  /** Processes one batch; returns the number of events relayed. Exposed for tests. */
  async tick(batch = 200): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.system.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(outbox)
          .where(and(isNull(outbox.processedAt), lt(outbox.attempts, 10)))
          .orderBy(outbox.id)
          .limit(batch)
          .for('update', { skipLocked: true });
        if (rows.length === 0) return 0;
        const done: number[] = [];
        for (const row of rows) {
          try {
            if (row.type === 'entity.changed') {
              this.realtime.entityChanged(row.payload as unknown as EntityChanged);
            } else {
              await this.queues.add('events', row.type, row.payload, { jobId: `outbox-${row.id}` });
            }
            done.push(row.id);
          } catch (e) {
            await tx
              .update(outbox)
              .set({ attempts: sql`${outbox.attempts} + 1`, lastError: (e as Error).message })
              .where(inArray(outbox.id, [row.id]));
          }
        }
        if (done.length > 0) {
          await tx.update(outbox).set({ processedAt: new Date() }).where(inArray(outbox.id, done));
        }
        return done.length;
      });
    } catch (e) {
      this.logger.warn(`Outbox relay failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
