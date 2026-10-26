import { defineConfig, devices } from './pw';

const PORT = Number(process.env.E2E_PORT ?? 8091);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4020);
const DIST = process.env.E2E_DIST ?? 'dist-web';

/**
 * Smoke tests for the Expo web export. Build first:
 *   EXPO_PUBLIC_API_URL=http://localhost:4020 npx expo export --platform web --output-dir dist-web
 * then run (from apps/mobile):
 *   node ../web/node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts
 * The API must run on E2E_API_PORT with CORS_ORIGINS/WEB_URL=http://localhost:8091 and NODE_ENV=test RECIPE_FETCH_ALLOW_PRIVATE=true
 * (an already running instance is reused).
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: `../test-results/${PORT}`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      command: `node e2e/serve.mjs ${DIST} ${PORT}`,
      cwd: '..',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `node --env-file=../../.env dist/main.js`,
      cwd: '../../api',
      url: `http://localhost:${API_PORT}/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        // 'test' only disables the auth and API rate limits, which all e2e sign-ups from localhost would hit.
        NODE_ENV: 'test',
        // Lets the recipe fetcher load the loopback fixture page (honoured only in test mode).
        RECIPE_FETCH_ALLOW_PRIVATE: 'true',
        API_PORT: String(API_PORT),
        API_PUBLIC_URL: `http://localhost:${API_PORT}`,
        CORS_ORIGINS: `http://localhost:${PORT}`,
        WEB_URL: `http://localhost:${PORT}`,
      },
    },
  ],
});
