import { expect, type Page } from './pw';

export function uniqueEmail(prefix = 'mobile-e2e'): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Signs up a fresh user (German UI) and creates a household; ends on the Übersicht tab. */
export async function signUpWithHousehold(
  page: Page,
  householdName = 'Familie E2E',
): Promise<void> {
  await page.goto('/');
  await page.getByText('Noch kein Konto? Registrieren').click();
  await page.getByLabel('Name', { exact: true }).fill('E2E Elternteil');
  await page.getByLabel('E-Mail').fill(uniqueEmail());
  await page.getByLabel('Passwort').fill('correct-horse-battery-staple');
  // Better Auth rate-limits sign-ups per IP (a few per 10 s); wait and retry when it kicks in.
  for (let attempt = 0; ; attempt++) {
    const response = page.waitForResponse((r) => r.url().includes('/api/auth/sign-up'));
    await page.getByRole('button', { name: 'Registrieren' }).click();
    if ((await response).status() !== 429) break;
    if (attempt >= 5) throw new Error('Sign-up stayed rate-limited');
    await page.waitForTimeout(11_000);
  }

  await page.getByLabel('Name des Haushalts').fill(householdName);
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click();
  await expect(page.getByRole('tab', { name: /Übersicht/ }).first()).toBeVisible();
}

/** Opens an entry of the "Mehr" tab. */
export async function openMore(page: Page, entry: string | RegExp): Promise<void> {
  await page.getByRole('tab', { name: /Mehr/ }).first().click();
  await page.getByRole('button', { name: entry }).first().click();
}
