import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signUpWithHousehold } from './helpers';
import { expect, test } from './pw';

/**
 * Recipe import from a URL against a local fixture page. The API only fetches loopback hosts
 * when it runs with NODE_ENV=test and RECIPE_FETCH_ALLOW_PRIVATE=true (see playwright.config.ts).
 */
const RECIPE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Omas Linsensuppe',
  description: 'Deftige Suppe für kalte Tage.',
  recipeYield: '4 Portionen',
  prepTime: 'PT15M',
  cookTime: 'PT40M',
  recipeIngredient: ['250 g Tellerlinsen', '2 Karotten', '1 Zwiebel', '1 l Gemüsebrühe'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Gemüse würfeln und in Öl anschwitzen.' },
    { '@type': 'HowToStep', text: 'Linsen und Brühe zugeben und 40 Minuten köcheln.' },
  ],
};

const PAGE = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${RECIPE.name}</title>
<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>
</head><body><h1>${RECIPE.name}</h1></body></html>`;

let server: Server;
let fixtureUrl = '';

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fixtureUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/rezept/linsensuppe`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('import a recipe from a URL', async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await signUpWithHousehold(page);

  await page.goto('/meals/import');
  await page.getByLabel('Adresse der Rezeptseite').fill(fixtureUrl);
  await page.getByRole('button', { name: 'Vorschau laden' }).click();
  await expect(page.getByText('Omas Linsensuppe').first()).toBeVisible();
  await expect(page.getByText(/Tellerlinsen/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ins Rezeptbuch übernehmen' }).click();
  // Saved: the recipe detail opens with the imported ingredients and steps.
  await expect(page).toHaveURL(/\/meals\/recipe\//);
  await expect(page.getByText(/Gemüsebrühe/).first()).toBeVisible();
  await expect(page.getByText(/40 Minuten köcheln/).first()).toBeVisible();

  await page.goto('/meals/recipes');
  await expect(page.getByText('Omas Linsensuppe').first()).toBeVisible();
});
