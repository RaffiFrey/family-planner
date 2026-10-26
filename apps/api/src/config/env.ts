import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  WEB_URL: z.url().default('http://localhost:3000'),
  ADMIN_URL: z.url().default('http://localhost:3001'),
  CORS_ORIGINS: csv,
  DATABASE_URL: z.string().min(1),
  DATABASE_SYSTEM_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  BETTER_AUTH_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes base64'),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  S3_ENDPOINT: optional,
  S3_PUBLIC_ENDPOINT: optional,
  S3_REGION: z.string().default('eu-central-1'),
  S3_BUCKET: z.string().default('family-planer-files'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  CLAMAV_HOST: optional,
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('Family Planer <no-reply@family-planer.local>'),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  /** Only for tests/local mocks (stripe-mock), e.g. http://localhost:12111. */
  STRIPE_API_BASE_URL: optional,
  STRIPE_PRICE_PLUS_MONTH: optional,
  STRIPE_PRICE_PLUS_YEAR: optional,
  STRIPE_PRICE_PRO_MONTH: optional,
  STRIPE_PRICE_PRO_YEAR: optional,
  REVENUECAT_WEBHOOK_SECRET: optional,
  EXPO_ACCESS_TOKEN: optional,
  SENTRY_DSN: optional,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Run BullMQ workers and the scheduler inside the API process (dev / small deployments). */
  RUN_WORKERS: z.stringbool().default(true),
  ADMIN_BOOTSTRAP_EMAIL: optional,
  ADMIN_BOOTSTRAP_PASSWORD: optional,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(300),
  /** Monitoring links shown in the admin console. */
  ADMIN_LINK_SENTRY: optional,
  ADMIN_LINK_GRAFANA: optional,
  /** AI assistant (Claude). Without a key the assistant endpoints answer 503. */
  ANTHROPIC_API_KEY: optional,
  ASSISTANT_MODEL: z.string().default('claude-sonnet-5-5'),
  /** PSD2 account data via a licensed aggregator; `mock` for development and tests. */
  BANK_SYNC_PROVIDER: z.enum(['none', 'mock', 'finapi']).default('mock'),
  FINAPI_BASE_URL: z.string().default('https://sandbox.finapi.io'),
  FINAPI_CLIENT_ID: optional,
  FINAPI_CLIENT_SECRET: optional,
  /** Google Calendar two-way sync (OAuth client). */
  GOOGLE_CALENDAR_CLIENT_ID: optional,
  GOOGLE_CALENDAR_CLIENT_SECRET: optional,
  /** OCR for the document vault (tesseract.js language codes). */
  OCR_LANGS: z.string().default('deu+eng'),
  OCR_ENABLED: z.stringbool().default(true),
  /** E2E only: lets recipe import fetch local fixture pages. Ignored unless NODE_ENV=test. */
  RECIPE_FETCH_ALLOW_PRIVATE: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
