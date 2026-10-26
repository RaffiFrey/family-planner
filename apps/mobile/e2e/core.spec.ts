import { expect, test } from './pw';
import { signUpWithHousehold } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await signUpWithHousehold(page);
});

test('add an item to a shopping list', async ({ page }) => {
  await page
    .getByRole('tab', { name: /Listen/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Neue Liste' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Wocheneinkauf');
  await page.getByRole('button', { name: 'Erstellen' }).click();

  const input = page.getByLabel('Artikel hinzufügen …');
  await input.fill('Milch');
  await input.press('Enter');
  const item = page.getByRole('checkbox', { name: 'Milch' });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByText('Erledigt (1)')).toBeVisible();
});

test('create a chore and complete it', async ({ page }) => {
  await page
    .getByRole('tab', { name: /Aufgaben/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Neue Aufgabe' }).click();
  await page.getByLabel('Titel', { exact: true }).fill('Müll rausbringen');
  await page.getByRole('button', { name: 'Speichern' }).click();

  const complete = page.getByRole('checkbox', { name: '„Müll rausbringen“ erledigen' });
  await expect(complete).toBeVisible();
  await complete.click();
  await page.getByRole('tab', { name: 'Erledigt', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '„Müll rausbringen“ wieder öffnen' }),
  ).toBeVisible();
});
