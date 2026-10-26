import { expect, test } from './pw';
import { openMore, signUpWithHousehold } from './helpers';

test('post on the pinboard and see it in the feed', async ({ page }) => {
  await signUpWithHousehold(page);
  await openMore(page, 'Pinnwand');

  const text = `Kühlschrank ist leer! ${Date.now()}`;
  await page.getByLabel('Neuer Beitrag').fill(text);
  await page.getByRole('button', { name: 'Posten' }).click();

  const post = page.getByTestId('pinboard-post').filter({ hasText: text });
  await expect(post).toBeVisible();
  await expect(page.getByLabel('Neuer Beitrag')).toHaveValue('');

  // React with a thumbs up and see the count.
  await post.getByRole('button', { name: 'Mit 👍 reagieren' }).click();
  await expect(post.getByRole('button', { name: 'Reaktion 👍 entfernen' })).toBeVisible();
});
