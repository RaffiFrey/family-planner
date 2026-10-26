import { setHouseholdPlan } from './family-db';
import { signUpWithHousehold, uniqueEmail } from './helpers';
import { expect, type Page, test } from './pw';

const API = `http://localhost:${process.env.E2E_API_PORT ?? '4020'}`;

/** Calls the API from the page so the browser's session cookie is used. */
async function apiCall<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'idempotency-key': crypto.randomUUID(),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? null : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${url}: ${String(res.status)} ${await res.text()}`);
      return (await res.json()) as T;
    },
    { url: `${API}${path}`, method, body },
  );
}

test('child requests a reward, parent approves it', async ({ page: parent, browser }) => {
  parent.on('dialog', (d) => void d.accept());
  const household = `Familie Belohnung ${String(Date.now())}`;
  await signUpWithHousehold(parent, household);
  // Rewards is a paid feature: upgrade the test household directly in the local DB.
  await setHouseholdPlan(household, 'pro');

  // Parent adds a reward.
  await parent.goto('/rewards');
  await parent.getByRole('button', { name: 'Neue Belohnung' }).click();
  await parent.getByLabel('Titel', { exact: true }).fill('Eis essen');
  await parent.getByLabel('Kosten in Punkten').fill('5');
  await parent.getByRole('button', { name: 'Speichern' }).click();
  await expect(parent.getByText('Eis essen')).toBeVisible();

  // Invite a child.
  const me = await apiCall<{ memberships: { household: { id: string; name: string } }[] }>(
    parent,
    'GET',
    '/v1/me',
  );
  const householdId = me.memberships.find((m) => m.household.name === household)?.household.id;
  if (!householdId) throw new Error('household not found');
  const invitation = await apiCall<{ token: string }>(
    parent,
    'POST',
    `/v1/households/${householdId}/invitations`,
    { role: 'child' },
  );

  // The child signs up in a separate browser context and joins with the invite code.
  const childContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 412, height: 839 },
  });
  const child = await childContext.newPage();
  child.on('dialog', (d) => void d.accept());
  await child.goto('/');
  await child.getByText('Noch kein Konto? Registrieren').click();
  await child.getByLabel('Name', { exact: true }).fill('Kind');
  await child.getByLabel('E-Mail').fill(uniqueEmail('mobile-e2e-child'));
  await child.getByLabel('Passwort').fill('correct-horse-battery-staple');
  await child.getByRole('button', { name: 'Registrieren' }).click();
  await child.getByLabel('Einladungslink oder Code').fill(invitation.token);
  await child.getByRole('button', { name: 'Beitreten' }).click();
  await expect(child.getByText(`Einladung zu „${household}“`)).toBeVisible();
  await child.getByRole('button', { name: 'Beitreten' }).click();
  await expect(child.getByRole('tab', { name: /Übersicht/ }).first()).toBeVisible();

  // Parent awards points so the child can afford the reward.
  await parent.goto('/rewards');
  await parent.getByRole('button', { name: /^Kind/ }).first().click();
  await parent.getByLabel('Punkte (z. B. 10 oder -5)').fill('10');
  await parent.getByLabel('Grund', { exact: true }).fill('Zimmer aufgeräumt');
  await parent.getByRole('button', { name: 'Buchen' }).click();
  await expect(parent.getByText('Zimmer aufgeräumt')).toBeVisible();

  // Child requests the reward (the confirm dialog is accepted).
  await child.goto('/rewards');
  await expect(child.getByText('Meine Punkte')).toBeVisible();
  await child.getByRole('button', { name: 'Einlösen' }).click();
  await expect(child.getByText('Angefragt', { exact: true })).toBeVisible();

  // Parent approves.
  await parent.goto('/rewards');
  await parent.getByRole('button', { name: 'Eis essen für Kind genehmigen' }).click();
  await expect(parent.getByText('Keine offenen Anfragen.')).toBeVisible();

  // The child sees the decision; 10 - 5 points remain.
  await child.reload();
  await expect(child.getByText('Genehmigt', { exact: true })).toBeVisible();
  await expect(child.getByText('5', { exact: true }).first()).toBeVisible();

  // Parent leaderboard: points earned in the current week, previous/next period navigation.
  await parent.goto('/rewards');
  const label = parent.getByTestId('leaderboard-period');
  await expect(label).toHaveText(/^KW \d+/);
  const current = await label.innerText();
  await expect(parent.getByText(/Im Zeitraum: \+10/)).toBeVisible();
  await parent.getByRole('button', { name: 'Vorheriger Zeitraum' }).click();
  await expect(label).not.toHaveText(current);
  await expect(parent.getByText(/Im Zeitraum: \+10/)).toHaveCount(0);
  await parent.getByRole('button', { name: 'Nächster Zeitraum' }).click();
  await expect(label).toHaveText(current);
  await parent.getByRole('tab', { name: 'Monat', exact: true }).click();
  await expect(label).toHaveText(/^[A-Za-zäöüÄÖÜ]+ \d{4}$/);
  await expect(parent.getByText(/Im Zeitraum: \+10/)).toBeVisible();
  await childContext.close();
});
