import { expect, test } from './pw';
import { openMore, signUpWithHousehold } from './helpers';

test('emergency card opens with "Stand" and is stored for offline use', async ({ page }) => {
  await signUpWithHousehold(page);
  await openMore(page, 'Kontakte');

  await page.getByRole('button', { name: 'Notfallkarte von E2E Elternteil öffnen' }).click();
  await expect(page.getByText(/Stand: /)).toBeVisible();
  await expect(page.getByText('Noch keine Notfallkarte')).toBeVisible();

  // Fill in the card.
  await page.getByRole('button', { name: 'Notfallkarte anlegen' }).click();
  await page.getByRole('button', { name: 'A+', exact: true }).click();
  await page.getByLabel('Allergien').fill('Erdnüsse, Penicillin');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByText('Erdnüsse')).toBeVisible();
  await expect(page.getByText('Penicillin')).toBeVisible();
  await expect(page.getByText('A+')).toBeVisible();
  await expect(page.getByText(/Stand: /)).toBeVisible();

  // The summary is persisted on the device (AsyncStorage = localStorage on web).
  const stored = await page.evaluate(() =>
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('fp-emergency-v1:'))
      .map((k) => window.localStorage.getItem(k) ?? ''),
  );
  expect(stored.some((v) => v.includes('Erdnüsse'))).toBe(true);
});
