import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against a running admin app (port 3001) and admin API.
 * Credentials come from env: E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD and either E2E_STAFF_TOTP_SECRET
 * (codes generated per login) or a pre-generated E2E_STAFF_TOTP code (optional).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3001/login',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
