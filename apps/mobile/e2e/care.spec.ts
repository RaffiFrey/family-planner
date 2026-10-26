import { expect, test } from './pw';
import { openMore, signUpWithHousehold } from './helpers';

test('medication schedule and maintenance completion with cost', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await signUpWithHousehold(page);

  // Health: medication with two intake times shows up in the intake plan.
  await openMore(page, 'Gesundheit');
  await page.getByRole('button', { name: 'Medikament hinzufügen' }).first().click();
  await page.getByLabel('Medikament', { exact: true }).fill('Ibuprofen');
  await page.getByLabel('Einnahmezeiten').fill('08:00, 20:00');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('button', { name: 'Einnahmeplan anzeigen' }).click();
  await page.getByRole('tab', { name: '7 Tage' }).click();
  await expect(page.getByText('20:00 · Ibuprofen').first()).toBeVisible();
  await expect(page.getByText('08:00 · Ibuprofen').first()).toBeVisible();
  await page.goBack();
  await page.goBack();

  // Home & vehicles: complete the HU with cost + notes and see it in the history.
  await openMore(page, 'Haus & Auto');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Familienauto');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('tab', { name: 'Alles' }).click();
  await page.getByRole('button', { name: /Familienauto/ }).click();
  await page.getByRole('button', { name: 'Plan hinzufügen' }).click();
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await page
    .getByRole('button', { name: /als erledigt markieren/ })
    .first()
    .click();
  await page.getByLabel(/Kosten/).fill('89,90');
  await page.getByLabel('Notizen').fill('Werkstatt Müller');
  await page.getByRole('button', { name: 'Als erledigt speichern' }).click();
  await expect(page.getByText('Verlauf')).toBeVisible();
  await expect(page.getByText(/89,90.*Werkstatt Müller/)).toBeVisible();
});
