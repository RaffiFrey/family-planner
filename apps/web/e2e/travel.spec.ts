import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('plan a trip with an itinerary item and a packing list', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Travellers');

  await page.goto('/travel');
  await page.getByRole('button', { name: 'New trip' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Baltic summer');
  await dialog.getByLabel('Destination').fill('Rügen');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\/travel\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Baltic summer' })).toBeVisible();

  await page.getByRole('button', { name: 'Add item' }).click();
  const itemDialog = page.getByRole('dialog');
  await itemDialog.getByLabel('Title').fill('Ferry to the island');
  await itemDialog.getByLabel('Booking reference').fill('ABC123');
  await itemDialog.getByRole('button', { name: 'Save' }).click();
  await expect(itemDialog).toBeHidden();
  await expect(page.getByText('Ferry to the island')).toBeVisible();
  await expect(page.getByText('ABC123')).toBeVisible();

  await page.getByRole('button', { name: 'Create packing list' }).click();
  const packing = page.getByRole('dialog');
  await expect(packing.getByRole('checkbox').first()).toBeVisible();
  await packing.getByRole('button', { name: 'Create packing list' }).click();
  await expect(packing).toBeHidden();

  await page.getByRole('link', { name: 'Open packing list' }).click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
});
