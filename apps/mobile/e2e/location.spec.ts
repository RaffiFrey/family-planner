import { execSync } from 'node:child_process';
import { expect, type Page, test } from './pw';
import { openMore, signUpWithHousehold } from './helpers';

async function startSharing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Standort teilen …' }).click();
  await page.getByRole('button', { name: '1 Stunde' }).click();
  await page.getByRole('button', { name: 'Teilen starten' }).click();
  await expect(page.getByText(/Du teilst deinen Standort bis/)).toBeVisible();
  await expect(page.getByText(/Zuletzt gesendet/)).toBeVisible();
}

test('location screen shows the explicit opt-in', async ({ page }) => {
  await signUpWithHousehold(page);
  await openMore(page, /Standorte/);

  // Opt-in card with explanation; nothing is shared yet.
  await expect(page.getByText('Standort teilen', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Ohne deine Zustimmung wird nichts geteilt/)).toBeVisible();
  await expect(page.getByText(/Gerade teilt niemand seinen Standort/)).toBeVisible();

  // The opt-in screen asks for duration and audience before anything starts.
  await page.getByRole('button', { name: 'Standort teilen …' }).click();
  await expect(page.getByRole('button', { name: 'Bis heute Abend' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ganze Familie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Teilen starten' })).toBeVisible();
});

test('share, see own history, stop sharing', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405, accuracy: 20 });
  page.on('dialog', (d) => void d.accept());
  await signUpWithHousehold(page);
  await openMore(page, /Standorte/);
  await startSharing(page);

  // Own position appears in the family list; it opens the 24 h history.
  await page.getByRole('button', { name: /E2E Elternteil \(du\)/ }).click();
  await expect(page.getByText(/^1 Position · /)).toBeVisible();
  await expect(page.getByText(/52\.52000, 13\.40500/)).toBeVisible();
  await page.goBack();

  await page.getByRole('button', { name: 'Teilen beenden' }).click();
  await expect(page.getByRole('button', { name: 'Standort teilen …' })).toBeVisible();
});

test('add a place and subscribe to arrivals', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 50.9375, longitude: 6.9603, accuracy: 15 });
  await signUpWithHousehold(page);
  await openMore(page, /Standorte/);

  await page.getByRole('button', { name: 'Ort hinzufügen' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Schule');
  await page.getByRole('button', { name: 'Meine Position' }).click();
  await expect(page.getByLabel('Breitengrad')).toHaveValue('50.9375');
  await page.getByRole('button', { name: '200 m' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();

  const place = page.getByRole('button', { name: /^Schule, Umkreis 200 m/ });
  await expect(place).toBeVisible();
  await place.click();
  await expect(
    page.getByText('Erhalte eine Mitteilung, wenn jemand diesen Ort erreicht oder verlässt.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Benachrichtigen', exact: true }).click();
  await expect(page.getByText('Ankunft und Verlassen')).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/Umkreis 200 m · Benachrichtigung an/)).toBeVisible();
});

test('vault shows the upsell on the free plan', async ({ page }) => {
  await signUpWithHousehold(page);
  await openMore(page, /Dokumente/);
  await expect(page.getByTestId('upsell-vault')).toBeVisible();
});

/** Upgrades the household in the local Docker database; skipped when that is not available. */
function upgradeToPro(householdName: string): boolean {
  try {
    execSync(
      `docker exec family-planer-postgres-1 psql -U fp -d family_planer -c "update households set plan='pro' where name='${householdName}'"`,
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

test('vault: create a document with custom reminders and see it in the expiring view', async ({
  page,
}) => {
  const name = `Vault ${String(Date.now())}`;
  await signUpWithHousehold(page, name);
  test.skip(!upgradeToPro(name), 'local database not reachable via docker');
  await page.reload();
  await openMore(page, /Dokumente/);
  await expect(page.getByText('Noch keine Dokumente')).toBeVisible();

  await page.getByRole('button', { name: 'Neues Dokument' }).click();
  await page.getByRole('button', { name: 'Reisepass' }).click();
  await page.getByLabel('Dokumentnummer').fill('C01X00T47');
  await page.getByLabel(/^Gültig bis/).click();
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await page
    .getByRole('button', { name: /, 10\. / })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await page.getByRole('button', { name: 'Eigene' }).click();
  await page.getByRole('button', { name: '14 Tage vorher' }).click();
  await page.getByRole('button', { name: '1 Tag vorher' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByText('C01X00T47')).toBeVisible();
  await expect(page.getByText('Erinnerung 14, 1 Tage vor Ablauf.')).toBeVisible();
  await page.goBack();

  await page.getByRole('button', { name: /^Ablaufdaten/ }).click();
  await expect(page.getByText('Läuft bald ab')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Reisepass, Reisepass/ }).last()).toBeVisible();
  await page.getByRole('tab', { name: '1 Jahr' }).click();
  await expect(page.getByRole('button', { name: /^Reisepass, Reisepass/ }).last()).toBeVisible();
});
