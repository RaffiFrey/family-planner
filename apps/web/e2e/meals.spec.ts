import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('meals: recipe → week plan → shopping list', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Meals');

  // Create a recipe with two ingredients.
  await page.goto('/meals/recipes');
  await page.getByRole('button', { name: 'New recipe' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Title').fill('Spaghetti Bolognese');
  await form.getByLabel('Servings').fill('4');
  await form.getByLabel('Quantity 1', { exact: true }).fill('500');
  await form.getByLabel('Unit 1', { exact: true }).selectOption('g');
  await form.getByLabel('Ingredient 1', { exact: true }).fill('Minced beef');
  await form.getByRole('button', { name: 'Add ingredient' }).click();
  await form.getByLabel('Quantity 2', { exact: true }).fill('400');
  await form.getByLabel('Unit 2', { exact: true }).selectOption('g');
  await form.getByLabel('Ingredient 2', { exact: true }).fill('Spaghetti');
  await form.getByLabel('Steps').fill('Brown the beef\nCook the pasta');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();
  await expect(page).toHaveURL(/\/meals\/recipes\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Spaghetti Bolognese' })).toBeVisible();
  await expect(page.getByText('500 g Minced beef')).toBeVisible();

  // Plan it for dinner this week.
  await page.goto('/meals');
  await page
    .getByRole('button', { name: /^Add Dinner on / })
    .first()
    .click();
  const entry = page.getByRole('dialog');
  await entry.getByLabel('Recipe', { exact: true }).selectOption({ label: 'Spaghetti Bolognese' });
  await entry.getByRole('button', { name: 'Save' }).click();
  await expect(entry).toBeHidden();
  await expect(page.getByRole('button', { name: 'Spaghetti Bolognese' })).toBeVisible();

  // Add the week's ingredients to the shopping list.
  await page.getByRole('button', { name: 'Add week to shopping list' }).click();
  const shopping = page.getByRole('dialog');
  await shopping.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(shopping).toBeHidden();
  await expect(page.getByText('2 ingredients added')).toBeVisible();
  await page.getByRole('button', { name: 'Open list' }).click();

  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
  await expect(page.getByText('Minced beef', { exact: false })).toBeVisible();
  await expect(page.getByText('Spaghetti', { exact: false }).first()).toBeVisible();
});
