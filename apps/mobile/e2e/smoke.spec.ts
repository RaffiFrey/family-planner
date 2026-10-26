import { expect, test } from './pw';
import { signUpWithHousehold } from './helpers';

test('sign up, create household and see the tabs', async ({ page }) => {
  await signUpWithHousehold(page);
  for (const tab of ['Übersicht', 'Kalender', 'Aufgaben', 'Listen', 'Mehr']) {
    await expect(page.getByRole('tab', { name: new RegExp(tab) }).first()).toBeVisible();
  }
});
