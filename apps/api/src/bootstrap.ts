import 'reflect-metadata';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import * as Sentry from '@sentry/node';
import { Redis } from 'ioredis';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { Server, ServerOptions } from 'socket.io';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { ObjectStorage } from './infra/storage.service.js';
import { AUTH, type Auth } from './modules/auth/auth.js';
import { mountAuth } from './modules/auth/mount.js';
import { OutboxRelay } from './modules/events/outbox-relay.js';
import { Queues } from './modules/events/queues.js';
import { MaintenanceService } from './modules/maintenance/maintenance.service.js';

/** Socket.IO with the Redis adapter so events reach clients on every API instance. */
class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    const pub = new Redis(this.redisUrl);
    server.adapter(createAdapter(pub, pub.duplicate()));
    return server;
  }
}

export interface BootstrapOptions {
  /** Start the outbox relay and (if RUN_WORKERS) BullMQ workers + schedules. */
  background?: boolean;
  logger?: boolean;
}

export async function createApp(
  env: Env,
  options: BootstrapOptions = {},
): Promise<NestFastifyApplication> {
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

  const adapter = new FastifyAdapter({ bodyLimit: 8 * 1024 * 1024, trustProxy: true });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(env), adapter, {
    bufferLogs: true,
    rawBody: true,
    logger: options.logger === false ? false : undefined,
  });
  if (options.logger !== false) app.useLogger(app.get(PinoLogger));

  const origins = new Set([env.WEB_URL, env.ADMIN_URL, ...env.CORS_ORIGINS]);
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, !origin || origins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'idempotency-key',
      'accept',
      'cookie',
      'expo-origin',
    ],
    exposedHeaders: ['ratelimit-remaining', 'retry-after', 'idempotent-replay', 'set-auth-token'],
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cookie);
  mountAuth(app.getHttpAdapter().getInstance(), app.get<Auth>(AUTH), env.API_PUBLIC_URL);
  app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL));
  app.enableShutdownHooks();

  await app
    .get(ObjectStorage)
    .ensureBucket([...origins])
    .catch((e: unknown) => {
      new Logger('Bootstrap').warn(`Object storage unavailable: ${(e as Error).message}`);
    });

  if (options.background) {
    app.get(OutboxRelay).start();
    if (env.RUN_WORKERS) {
      app.get(Queues).startWorkers();
      await app.get(MaintenanceService).registerSchedules();
    }
  }
  return app;
}
