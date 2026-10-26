import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('create a savings goal and add a contribution', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Savers');

  await page.goto('/finance/goals');
  await expect(page.getByRole('heading', { level: 1, name: 'Savings goals' })).toBeVisible();
  await page.getByRole('button', { name: 'New savings goal' }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Summer holiday');
  await dialog.getByLabel('Target amount').fill('1000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole('listitem').filter({ hasText: 'Summer holiday' });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('goal-saved')).toHaveText(/0[.,]00/);

  await card.getByRole('button', { name: 'Contribute' }).click();
  const contribution = page.getByRole('dialog');
  await expect(contribution.getByRole('heading', { name: /Contribution to/ })).toBeVisible();
  await contribution.getByLabel('Amount').fill('250');
  await contribution.getByLabel('Note').fill('Birthday money');
  await contribution.getByRole('button', { name: 'Contribute' }).click();
  await expect(contribution).toBeHidden();

  await expect(card.getByTestId('goal-saved')).toHaveText(/250[.,]00/);
  await expect(card.getByRole('progressbar')).toBeVisible();
  await expect(card.getByText(/25 % done/)).toBeVisible();

  // Persisted server-side, with the contribution in the history.
  await page.reload();
  const reloaded = page.getByRole('listitem').filter({ hasText: 'Summer holiday' });
  await expect(reloaded.getByTestId('goal-saved')).toHaveText(/250[.,]00/);
  await reloaded.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('dialog').getByText('Birthday money')).toBeVisible();
});
