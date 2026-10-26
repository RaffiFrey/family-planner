import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('assistant shows the plan upsell and privacy explanation on the free plan', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'E2E Assistant');

  await page.goto('/assistant');
  await expect(page.getByRole('heading', { level: 1, name: 'Assistant' })).toBeVisible();

  const upsell = page.getByTestId('upsell-ai_assistant');
  await expect(upsell).toBeVisible();
  await expect(upsell).toContainText('Not included in your plan');
  await expect(upsell).toContainText('Family Pro');
  // The owner can upgrade from here.
  await expect(upsell.getByRole('link', { name: 'Upgrade plan' })).toHaveAttribute(
    'href',
    '/settings/billing',
  );
  // Consent is explained up front, but nothing can be captured without the plan.
  await expect(
    page.getByText('No data is sent to the AI provider before you enable it.'),
  ).toBeVisible();
  await expect(page.getByLabel('What would you like to add?')).toHaveCount(0);
});
