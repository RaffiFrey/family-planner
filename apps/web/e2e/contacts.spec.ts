import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('contacts and a printable emergency card', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Contacts');

  await page.goto('/contacts');
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts & emergency' })).toBeVisible();

  // Create a contact.
  await page.getByRole('button', { name: 'Add contact' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Dr. Sommer');
  await dialog.getByLabel('Category').selectOption('doctor');
  await dialog.getByLabel('Organization').fill('Kinderarztpraxis Sonnenschein');
  await dialog.getByLabel('Number', { exact: true }).fill('+49 30 1234567');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Dr. Sommer')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call +49 30 1234567' })).toBeVisible();

  // Fill the emergency card of the current member.
  await page.getByRole('tab', { name: 'Emergency cards' }).click();
  await page.getByRole('button', { name: 'Create emergency card: E2E Parent' }).click();
  const card = page.getByRole('dialog');
  await card.getByLabel('Blood type').selectOption('A+');
  await card.getByLabel('Allergies').fill('Peanuts, Penicillin');
  await card
    .getByLabel('Family doctor / pediatrician')
    .selectOption({ label: 'Dr. Sommer (Kinderarztpraxis Sonnenschein)' });
  await card.getByLabel('Dr. Sommer').check();
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card).toBeHidden();
  await expect(page.getByText('Peanuts, Penicillin')).toBeVisible();

  // Printable view.
  await page.getByRole('link', { name: 'Print view' }).click();
  await expect(page).toHaveURL(/\/contacts\/emergency\/[0-9a-f-]+$/);
  const printable = page.locator('#emergency-card');
  await expect(printable.getByRole('heading', { name: 'E2E Parent' })).toBeVisible();
  await expect(printable.getByText('A+', { exact: true })).toBeVisible();
  await expect(printable.getByText('Peanuts, Penicillin')).toBeVisible();
  await expect(printable.getByText('+49 30 1234567').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeEnabled();
});
