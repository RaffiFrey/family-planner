import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('create a shopping list and add an item', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Shoppers');

  await page.goto('/lists');
  await page.getByRole('button', { name: 'New list' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Weekly groceries');
  await dialog.getByRole('button', { name: /^(Save|Create)$/ }).click();
  await expect(dialog).toBeHidden();

  // Creating a list opens it right away.
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);

  const quickAdd = page.getByLabel('Add item');
  await quickAdd.fill('Milk');
  await quickAdd.press('Enter');

  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
});
