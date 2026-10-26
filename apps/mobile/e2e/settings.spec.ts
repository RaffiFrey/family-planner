import { expect, test } from './pw';
import { openMore, signUpWithHousehold } from './helpers';

test('support access can be granted and revoked; calendar sync shows subscriptions', async ({
  page,
}) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  page.on('dialog', (d) => void d.accept());
  await signUpWithHousehold(page);

  await openMore(page, /Einstellungen/);
  await page.getByRole('button', { name: /Support-Zugang/ }).click();
  await expect(page.getByText('Kein Support-Zugang freigegeben.')).toBeVisible();
  await page.getByRole('button', { name: 'Zugang freigeben' }).click();
  await expect(page.getByText(/Zugang aktiv bis/)).toBeVisible();
  await page.getByRole('button', { name: 'Zugang widerrufen' }).click();
  await expect(page.getByText('Kein Support-Zugang freigegeben.')).toBeVisible();

  await page.goBack();
  await page.getByRole('button', { name: /Kalender-Abgleich/ }).click();
  await expect(page.getByText('Noch keine Kalender abonniert.')).toBeVisible();
  await page.getByLabel('Adresse des Kalenders (https:// oder webcal://)').fill('kein-link');
  await page.getByRole('button', { name: 'Abonnieren' }).click();
  await expect(page.getByText('Bitte gib einen Namen ein.')).toBeVisible();
});
