import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Signs up a fresh user and creates a household; ends on the dashboard. */
export async function signUpWithHousehold(page: Page, householdName = 'E2E Family'): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill('E2E Parent');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign up' }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Household name').fill(householdName);
  await expect(page.getByLabel('Your display name')).toHaveValue('E2E Parent');
  await page.getByRole('button', { name: 'Create household' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /Hi E2E Parent/ })).toBeVisible();
}
