import { Controller, Get, Header, Inject } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { collectDefaultMetrics, register } from 'prom-client';
import { Endpoint, type Out } from '../../common/contract.js';
import { Db } from '../../infra/database.js';
import { REDIS } from '../../infra/infra.module.js';

collectDefaultMetrics({ prefix: 'fp_api_' });

@Controller()
export class HealthController {
  constructor(
    private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Endpoint(apiContract.system.health)
  async health(): Promise<Out<typeof apiContract.system.health>> {
    const [dbUp, redisUp] = await Promise.all([
      this.db.system.execute(sql`select 1`).then(
        () => true,
        () => false,
      ),
      this.redis.ping().then(
        () => true,
        () => false,
      ),
    ]);
    return {
      status: dbUp && redisUp ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? '0.0.0',
      checks: { database: dbUp ? 'up' : 'down', redis: redisUp ? 'up' : 'down' },
    };
  }

  /** Prometheus scrape endpoint (keep it internal at the ingress). */
  @Get('/metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  metrics(): Promise<string> {
    return register.metrics();
  }
}
