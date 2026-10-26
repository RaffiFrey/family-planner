import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test.describe('household onboarding and chores', () => {
  test('sign up, create a household, create a chore and complete it', async ({ page }) => {
    await signUpWithHousehold(page);

    await page.goto('/tasks');
    await page.getByRole('button', { name: 'New task' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill('Water the plants');
    await dialog.getByRole('button', { name: /^(Save|Create)$/ }).click();
    await expect(dialog).toBeHidden();

    const complete = page.getByRole('checkbox', { name: 'Complete Water the plants' });
    await expect(complete).toBeVisible();
    await complete.click();

    // Optimistic update: the chore leaves the open list right away and stays gone after the refetch.
    await expect(page.getByRole('checkbox', { name: 'Complete Water the plants' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Complete Water the plants' })).toHaveCount(0);
  });
});
