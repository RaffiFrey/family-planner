import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('document vault shows the upsell on the free plan', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Vault');

  await page.goto('/vault');
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  const upsell = page.getByTestId('upsell-vault');
  await expect(upsell).toBeVisible();
  await expect(upsell.getByText('Not included in your plan')).toBeVisible();
  // The owner can go straight to billing.
  await expect(upsell.getByRole('link', { name: 'Upgrade plan' })).toHaveAttribute(
    'href',
    '/settings/billing',
  );
  // Nothing can be created on the free plan.
  await expect(page.getByRole('button', { name: 'Add document' })).toHaveCount(0);
});
