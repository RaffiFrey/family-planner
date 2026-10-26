import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('pinboard: post a note, react, start a poll and vote', async ({ page }) => {
  await signUpWithHousehold(page, 'E2E Pinboard');

  await page.goto('/pinboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Pinboard' })).toBeVisible();

  // Post a note.
  await page.getByLabel('What’s new?').fill('Back at 6 pm');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.getByRole('article').filter({ hasText: 'Back at 6 pm' });
  await expect(post).toBeVisible();

  // React with an emoji.
  await post.getByRole('button', { name: 'React', exact: true }).click();
  await page.getByRole('button', { name: 'React with 👍' }).click();
  await expect(post.getByRole('button', { name: 'Remove 👍 reaction' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Start a poll.
  await page.getByRole('tab', { name: 'Polls' }).click();
  await page.getByRole('button', { name: 'New poll' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Question').fill('Pizza or pasta?');
  await dialog.getByLabel('Option 1').fill('Pizza');
  await dialog.getByLabel('Option 2').fill('Pasta');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  // Vote and see the results.
  await page.getByRole('radio', { name: 'Pasta' }).check();
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  const results = page.getByRole('group', { name: 'Results' });
  await expect(results).toBeVisible();
  await expect(results.getByText('Your choice')).toBeVisible();
  await expect(page.getByText('1 person voted')).toBeVisible();
  await expect(results.getByText('1 vote · 100%')).toBeVisible();

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole('group', { name: 'Results' }).getByText('Your choice')).toBeVisible();
});
