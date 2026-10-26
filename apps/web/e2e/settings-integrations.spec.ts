import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('grant and revoke support access', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Support');
  await page.goto('/settings/household');

  const section = page
    .getByRole('region', { name: 'Support access' })
    .or(page.locator('section', { has: page.getByRole('heading', { name: 'Support access' }) }));
  await expect(section.getByText('Support currently has no access.')).toBeVisible();
  await section.getByLabel('Duration').selectOption('4');
  await section.getByLabel(/Reason/).fill('E2E check');
  await section.getByRole('button', { name: 'Allow access' }).click();
  await expect(section.getByText(/Support access active until/)).toBeVisible();
  await expect(section.getByText('Reason: E2E check')).toBeVisible();

  await section.getByRole('button', { name: 'Revoke access' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke access' }).click();
  await expect(section.getByText('Support currently has no access.')).toBeVisible();
});

test('integrations page shows calendar sync options', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Integrations');
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Integrations' }).click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await expect(page.getByRole('heading', { name: 'Calendar subscriptions (ICS)' })).toBeVisible();
  await expect(page.getByText('No subscribed calendars yet.')).toBeVisible();
  await expect(page.getByText('No Google calendar connected.')).toBeVisible();

  await page.getByRole('button', { name: 'Subscribe to calendar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Holidays');
  await dialog.getByLabel('Feed address (URL)').fill('ftp://nope');
  await dialog.getByRole('button', { name: 'Subscribe to calendar' }).click();
  await expect(dialog.getByText('Please enter an https:// or webcal:// address.')).toBeVisible();
});

test('google callback without code shows an error', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Callback');
  await page.goto('/settings/integrations/google/callback?error=access_denied');
  await expect(page.getByText('Access was denied at Google.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to integrations' })).toBeVisible();
});
