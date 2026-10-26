import { expect, test } from './pw';
import { signUpWithHousehold } from './helpers';

// Recipe import from a URL: see recipe-import.spec.ts.

test('plan a recipe and add the week to the shopping list', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await signUpWithHousehold(page);

  await page.goto('/meals/recipe-new');
  await page.getByLabel('Titel', { exact: true }).fill('Gefüllte Zucchini');
  await page.getByLabel('Zutaten (eine pro Zeile)').fill('2 Zucchini\n400 g Hackfleisch');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('400 g Hackfleisch')).toBeVisible();

  // Plan it for today's dinner (the defaults of the "Einplanen" card).
  await page.getByRole('button', { name: 'Einplanen' }).click();

  await page.goto('/meals');
  await expect(page.getByText('Gefüllte Zucchini')).toBeVisible();
  await page.getByRole('button', { name: 'Woche auf Einkaufsliste' }).click();
  await expect(page.getByText('Vorräte überspringen')).toBeVisible();
  await page.getByRole('button', { name: 'Woche auf Einkaufsliste' }).last().click();

  // Lands on the (newly created) shopping list with the merged ingredients.
  await expect(page.getByRole('checkbox', { name: /Zucchini/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Hackfleisch/ })).toBeVisible();
});
