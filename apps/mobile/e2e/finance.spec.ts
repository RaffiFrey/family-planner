import { signUpWithHousehold } from './helpers';
import { expect, test } from './pw';

test('finance: shared expense with exact split, then settle up', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await signUpWithHousehold(page, `Familie Geld ${String(Date.now())}`);

  await page.goto('/finance');
  await page
    .getByRole('button', { name: /Geteilte Ausgaben/ })
    .first()
    .click();
  await expect(page.getByText('Alles ausgeglichen – niemand schuldet etwas.')).toBeVisible();
  await page.getByLabel('Person hinzufügen').first().fill('Oma');
  await page.getByRole('button', { name: 'Person hinzufügen' }).click();
  await expect(page.getByRole('button', { name: /^Oma, Weitere Person/ })).toBeVisible();

  await page.getByRole('button', { name: 'Neue Ausgabe' }).click();
  await page.getByLabel('Wofür?').fill('Wocheneinkauf');
  await page.getByLabel('Betrag', { exact: true }).fill('30');
  await page.getByRole('tab', { name: 'Beträge' }).click();
  await page.getByLabel('E2E Elternteil – Betrag').fill('20');
  await page.getByLabel('Oma – Betrag').fill('5');
  await expect(page.getByTestId('split-error')).toBeVisible();
  await page.getByLabel('Oma – Betrag').fill('10');
  await expect(page.getByText(/^Oma: 10,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByText('Wocheneinkauf')).toBeVisible();
  await expect(page.getByText('schuldet', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Oma zahlt E2E Elternteil 10,00/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Als bezahlt markieren' }).click();
  await expect(page.getByText('Alles ausgeglichen – niemand schuldet etwas.')).toBeVisible();
  await expect(page.getByText('Ausgleichszahlungen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ausgleichszahlung löschen?' })).toBeVisible();
  await expect(page.getByText('Oma an E2E Elternteil')).toBeVisible();

  expect(errors).toEqual([]);
});
