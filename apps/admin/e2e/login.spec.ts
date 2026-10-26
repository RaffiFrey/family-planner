import { expect, test } from '@playwright/test';
import { currentTotp } from './helpers';

const email = process.env.E2E_STAFF_EMAIL;
const password = process.env.E2E_STAFF_PASSWORD;

test('unauthenticated visitors are sent to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('rejects invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('staff login leads to the dashboard', async ({ page, context }) => {
  test.skip(!email || !password, 'Set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD to run');
  await page.goto('/login');
  await page.getByLabel('Email').fill(email ?? '');
  await page.getByLabel('Password').fill(password ?? '');
  /** E2E_STAFF_TOTP_SECRET (preferred) or a pre-generated E2E_STAFF_TOTP code. */
  const totp = currentTotp();
  if (totp) {
    await page.getByRole('button', { name: 'I have an authenticator code' }).click();
    await page.getByLabel('Authenticator code').fill(totp);
  }
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('kpis')).toBeVisible();

  // The session token must not be readable from JS.
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name.endsWith('fp_admin_session'));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Strict');
  expect(await page.evaluate(() => document.cookie)).not.toContain('fp_admin_session');
});
