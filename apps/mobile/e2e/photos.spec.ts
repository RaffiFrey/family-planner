import { join } from 'node:path';
import { signUpWithHousehold } from './helpers';
import { expect, test } from './pw';

test('photos: create an album and upload a photo from the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signUpWithHousehold(page, `Familie Fotos ${String(Date.now())}`);

  await page.goto('/photos');
  await expect(page.getByText('An diesem Tag')).toBeVisible();
  await page.getByRole('button', { name: 'Neues Album' }).click();
  await page.getByLabel('Titel').fill('Sommer');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Dieses Album ist noch leer.')).toBeVisible();

  // expo-image-picker opens a hidden <input type="file"> on web.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto hinzufügen' }).click();
  await (await chooser).setFiles(join(__dirname, 'fixtures', 'photo.png'));

  const photo = page.getByRole('button', { name: /\.png$/ }).first();
  await expect(photo).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Dieses Album ist noch leer.')).toHaveCount(0);

  // Caption in the viewer.
  await photo.click();
  await page.getByLabel('Bildunterschrift').fill('Am Strand');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByLabel('Bildunterschrift')).toHaveValue('Am Strand');
  await page.getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByRole('button', { name: 'Am Strand' })).toBeVisible();

  expect(errors).toEqual([]);
});
