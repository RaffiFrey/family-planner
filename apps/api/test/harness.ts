import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { seedGlobals, createDb } from '@fp/db';
import { runMigrations } from '@fp/db/migrate';
import { createApp } from '../src/bootstrap.js';
import { type Env, loadEnv } from '../src/config/env.js';

export interface Stack {
  app: NestFastifyApplication;
  env: Env;
  pg: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  ownerUrl: string;
  close: () => Promise<void>;
}

/**
 * Generates a migration from the current Drizzle schema into a temp folder, so tests always run
 * against the schema in source even before the committed migrations are regenerated.
 */
function freshMigrations(): string {
  const out = mkdtempSync(join(tmpdir(), 'fp-migrations-'));
  const dbDir = fileURLToPath(new URL('../../../packages/db', import.meta.url));
  execFileSync(
    process.execPath,
    [
      join(dbDir, 'node_modules/drizzle-kit/bin.cjs'),
      'generate',
      '--dialect',
      'postgresql',
      '--schema',
      './src/schema/index.ts',
      '--out',
      out,
      '--casing',
      'snake_case',
    ],
    { cwd: dbDir, stdio: 'ignore' },
  );
  return out;
}

/** Boots Postgres + Redis in containers, migrates, seeds and starts the API in-process. */
export async function startStack(overrides: Record<string, string> = {}): Promise<Stack> {
  const [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('fp')
      .withUsername('fp')
      .withPassword('fp')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  const host = pg.getHost();
  const port = pg.getPort();
  const ownerUrl = `postgres://fp:fp@${host}:${port}/fp`;
  await runMigrations(ownerUrl, { app: 'app_pw', system: 'system_pw' }, freshMigrations());
  const seed = createDb(ownerUrl, { max: 1 });
  await seedGlobals(seed.db);
  await seed.close();

  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://fp_app:app_pw@${host}:${port}/fp`,
    DATABASE_SYSTEM_URL: `postgres://fp_system:system_pw@${host}:${port}/fp`,
    REDIS_URL: redis.getConnectionUrl(),
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    API_PUBLIC_URL: 'http://localhost:4000',
    WEB_URL: 'http://localhost:3000',
    S3_ENDPOINT: 'http://127.0.0.1:1',
    RUN_WORKERS: 'false',
    LOG_LEVEL: 'silent',
    ADMIN_BOOTSTRAP_EMAIL: 'admin@test.local',
    ADMIN_BOOTSTRAP_PASSWORD: 'admin-password-123',
    ...overrides,
  });
  const app = await createApp(env, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    env,
    pg,
    redis,
    ownerUrl,
    close: async () => {
      await app.close();
      await Promise.allSettled([pg.stop(), redis.stop()]);
    },
  };
}

export interface Response<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | number | undefined>;
}

/** A logged-in (or anonymous) HTTP client using Fastify's inject. */
export class TestClient {
  cookie = '';

  constructor(private readonly app: NestFastifyApplication) {}

  async request<T = any>(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response<T>> {
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      headers: {
        origin: 'http://localhost:3000',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const list = Array.isArray(setCookie) ? setCookie : [setCookie];
      const jar = new Map(
        this.cookie
          .split('; ')
          .filter(Boolean)
          .map((c) => c.split('=') as [string, string]),
      );
      for (const c of list) {
        const [pair] = c.split(';');
        const [k, ...v] = (pair ?? '').split('=');
        if (k) jar.set(k, v.join('='));
      }
      this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const text = res.body;
    return {
      status: res.statusCode,
      body: (text ? JSON.parse(text) : undefined) as T,
      headers: res.headers,
    };
  }

  get<T = any>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = any>(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', url, body ?? {}, headers);
  }
  patch<T = any>(url: string, body: unknown) {
    return this.request<T>('PATCH', url, body);
  }
  put<T = any>(url: string, body: unknown) {
    return this.request<T>('PUT', url, body);
  }
  delete<T = any>(url: string) {
    return this.request<T>('DELETE', url);
  }

  async signUp(email: string, name: string): Promise<this> {
    const res = await this.post('/api/auth/sign-up/email', {
      email,
      name,
      password: 'correct-horse-battery',
    });
    if (res.status !== 200)
      throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    return this;
  }
}
