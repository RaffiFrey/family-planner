import { expect, test } from '@playwright/test';
import { hasStaffCredentials, login } from './helpers';

test.describe('system page', () => {
  test.skip(!hasStaffCredentials, 'Set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD to run');

  test('shows health checks, queues, outbox backlog and monitoring links', async ({ page }) => {
    await login(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'System' })
      .click();
    await expect(page).toHaveURL(/\/system$/);
    await expect(page.getByRole('heading', { name: 'System' })).toBeVisible();

    const checks = page.getByTestId('system-checks');
    await expect(checks.getByTestId('check-database')).toContainText(/Up|Down/);
    await expect(checks.getByTestId('check-redis')).toContainText(/Up|Down/);
    // The local stack is running, so both dependencies must be healthy.
    await expect(checks.getByTestId('check-database')).toContainText('Up');
    await expect(checks.getByText('All systems up')).toBeVisible();

    const queues = page.getByTestId('system-queues');
    for (const name of ['events', 'files', 'maintenance']) {
      await expect(queues.getByRole('cell', { name: new RegExp(name, 'i') }).first()).toBeVisible();
    }
    for (const header of ['Waiting', 'Active', 'Delayed', 'Failed']) {
      await expect(queues.getByRole('columnheader', { name: header })).toBeVisible();
    }

    await expect(page.getByTestId('outbox-backlog')).toContainText(/\d/);
    await expect(
      page.getByTestId('system-links').getByRole('link', { name: 'API docs' }),
    ).toHaveAttribute('href', /\/docs$/);

    // Auto-refresh: a new request to the system endpoint arrives within ~15 s.
    const refreshed = await page.waitForRequest((r) => r.url().includes('/admin/v1/system'), {
      timeout: 20_000,
    });
    expect(refreshed.method()).toBe('GET');
  });
});
