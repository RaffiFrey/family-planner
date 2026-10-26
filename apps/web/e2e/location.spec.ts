import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 52.52, longitude: 13.405, accuracy: 15 },
});

test('location: add a place, share location and stop sharing', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Locations');

  await page.goto('/location');
  await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Your privacy');
  await expect(
    page.getByRole('region', { name: 'Map with family members and places' }),
  ).toBeVisible();

  // Add a place with explicit coordinates.
  await page.getByRole('button', { name: 'Add place' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('School');
  await dialog.getByLabel('Latitude').fill('52.5200');
  await dialog.getByLabel('Longitude').fill('13.4050');
  await dialog.getByLabel('Radius (meters)').fill('150');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('150 m radius')).toBeVisible();

  // Opt in for one hour; the browser position is sent while the page is open.
  await page.getByLabel('Duration').selectOption('60');
  await page.getByRole('button', { name: 'Share location' }).click();
  await expect(page.getByText(/You are sharing your location until/)).toBeVisible();
  await expect(page.getByText(/Last sent:/)).toBeVisible({ timeout: 15_000 });
  // My own position shows up in the family list, at the place.
  await expect(page.getByRole('button', { name: /E2E Parent: Show on map/ })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByText('You are not sharing your location right now.')).toBeVisible();
});
