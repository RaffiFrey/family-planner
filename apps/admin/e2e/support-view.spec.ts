import { expect, test } from '@playwright/test';
import { hasStaffCredentials, login } from './helpers';

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

test.describe('household support view', () => {
  test.skip(!hasStaffCredentials, 'Set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD to run');

  test('shows the not-granted state when the customer has not granted access', async ({ page }) => {
    await login(page);

    // Find a household without an active support-access grant (via the same-origin proxy).
    const list = await page.request.get('/api/admin-proxy/admin/v1/households?limit=20');
    expect(list.ok()).toBe(true);
    const { items } = (await list.json()) as Page<{ id: string }>;
    let householdId: string | undefined;
    for (const h of items) {
      const res = await page.request.get(`/api/admin-proxy/admin/v1/households/${h.id}`);
      const detail = (await res.json()) as { supportAccessUntil: string | null };
      if (res.ok() && detail.supportAccessUntil === null) {
        householdId = h.id;
        break;
      }
    }
    test.skip(!householdId, 'No household without a support grant in this database');

    let supportRequests = 0;
    page.on('request', (r) => {
      if (/\/households\/[^/]+\/support$/.test(new URL(r.url()).pathname)) supportRequests++;
    });

    await page.goto(`/households/${householdId ?? ''}`);
    await expect(page.getByTestId('support-access-status')).toContainText('Not granted');

    await page.getByRole('tab', { name: 'Support view' }).click();
    await expect(page.getByRole('tab', { name: 'Support view' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('support-consent-note')).toContainText('audit log');
    const notGranted = page.getByTestId('support-not-granted');
    await expect(notGranted).toBeVisible();
    await expect(notGranted).toContainText('Support access not granted');
    // Without a grant the (audited) support endpoint is not even called.
    expect(supportRequests).toBe(0);

    // The API refuses it as well.
    const direct = await page.request.get(
      `/api/admin-proxy/admin/v1/households/${householdId ?? ''}/support`,
    );
    expect(direct.status()).toBe(403);
    expect(((await direct.json()) as { detail?: string }).detail).toContain(
      'has not granted support access',
    );
  });
});
