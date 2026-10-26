import {
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { idempotencyKeys } from '@fp/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { from, type Observable, of, switchMap } from 'rxjs';
import { ENV, type Env } from '../config/env.js';
import { Db } from '../infra/database.js';
import { REDIS } from '../infra/infra.module.js';
import { getEndpointMeta } from './contract.js';
import { AppError } from './errors.js';

/**
 * Validates handler output against the contract's response schema. Unknown keys are stripped,
 * which is the last line of defence against leaking internal columns.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = ctx.getType() === 'http' ? getEndpointMeta(ctx) : undefined;
    if (!meta) return next.handle();
    return next.handle().pipe(
      switchMap((data: unknown) => {
        const parsed = meta.endpoint.response.safeParse(data);
        if (!parsed.success) {
          this.logger.error(
            `Response of ${meta.endpoint.method} ${meta.endpoint.path} violates contract: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`,
          );
          throw new AppError(500, 'contract_violation', 'Internal Server Error');
        }
        return of(parsed.data);
      }),
    );
  }
}

/**
 * Makes POSTs retry-safe for flaky mobile networks: the first response for an
 * `Idempotency-Key` is stored and replayed for repeats by the same user.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const key = req.headers['idempotency-key'];
    const userId = req.fpUser?.userId;
    if (req.method !== 'POST' || typeof key !== 'string' || !userId || key.length > 100)
      return next.handle();
    const path = req.url.split('?')[0] ?? req.url;
    return from(
      this.db.system
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
        .limit(1),
    ).pipe(
      switchMap(([existing]) => {
        if (existing) {
          if (existing.path !== path || existing.method !== req.method) {
            throw new AppError(
              422,
              'idempotency_key_reused',
              'Idempotency key reused for a different request',
            );
          }
          ctx
            .switchToHttp()
            .getResponse<FastifyReply>()
            .status(existing.status)
            .header('idempotent-replay', 'true');
          return of(existing.response);
        }
        return next.handle().pipe(
          switchMap(async (data: unknown) => {
            const status = ctx.switchToHttp().getResponse<FastifyReply>().statusCode;
            await this.db.system
              .insert(idempotencyKeys)
              .values({ userId, key, method: req.method, path, status, response: data ?? null })
              .onConflictDoNothing();
            return data;
          }),
        );
      }),
    );
  }
}

/** Fixed-window rate limit per user (or IP) stored in Redis, shared across API instances. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.env.NODE_ENV === 'test' || ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const who = req.fpUser?.userId ?? req.fpStaff?.staffId ?? req.ip;
    const window = Math.floor(Date.now() / 60_000);
    const key = `rl:${who}:${window}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 70);
      const reply = ctx.switchToHttp().getResponse<FastifyReply>();
      void reply.header('ratelimit-limit', this.env.RATE_LIMIT_PER_MINUTE);
      void reply.header('ratelimit-remaining', Math.max(0, this.env.RATE_LIMIT_PER_MINUTE - count));
      if (count > this.env.RATE_LIMIT_PER_MINUTE) {
        void reply.header('retry-after', 60 - Math.floor((Date.now() / 1000) % 60));
        throw new AppError(429, 'rate_limited', 'Too Many Requests', 'Rate limit exceeded');
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      // Fail open when Redis is unavailable.
    }
    return true;
  }
}
