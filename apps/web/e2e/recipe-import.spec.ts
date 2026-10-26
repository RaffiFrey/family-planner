import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

/**
 * Needs an API started with NODE_ENV=test and RECIPE_FETCH_ALLOW_PRIVATE=true, otherwise the
 * SSRF guard (correctly) refuses to fetch from 127.0.0.1.
 */
const RECIPE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'E2E Tomato Soup',
  description: 'A quick soup for busy evenings.',
  recipeYield: '4 servings',
  prepTime: 'PT10M',
  cookTime: 'PT25M',
  recipeIngredient: ['500 g tomatoes', '1 onion', '2 tbsp olive oil'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Chop the onion and tomatoes.' },
    { '@type': 'HowToStep', text: 'Simmer everything for 20 minutes and blend.' },
  ],
};

const PAGE = `<!doctype html>
<html><head><title>Tomato soup</title>
<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>
</head><body><h1>Tomato soup</h1></body></html>`;

let server: Server;
let recipeUrl = '';

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/recipe') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  recipeUrl = `http://127.0.0.1:${port}/recipe`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('import a recipe from a URL (preview → save)', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Recipe Import');
  await page.goto('/meals/recipes');
  await page.getByRole('button', { name: 'Import from URL' }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Recipe URL').fill(recipeUrl);
  await dialog.getByRole('button', { name: 'Load preview' }).click();

  const preview = dialog.getByRole('region', { name: 'E2E Tomato Soup' });
  await expect(preview).toBeVisible();
  await expect(preview.getByText('3 ingredients')).toBeVisible();
  await expect(preview.getByText(/500 g tomatoes/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Save to recipe box' }).click();
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/\/meals\/recipes\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Tomato Soup' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: '500 g tomatoes' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: '1 onion' })).toBeVisible();
  await expect(page.getByText(/olive oil/)).toBeVisible();
  await expect(page.getByText('Simmer everything for 20 minutes and blend.')).toBeVisible();

  await page.goto('/meals/recipes');
  await expect(page.getByText('E2E Tomato Soup')).toBeVisible();
});
