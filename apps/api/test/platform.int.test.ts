import { generateSync } from 'otplib';
import sharp from 'sharp';
import Stripe from 'stripe';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pingClamd } from '../src/modules/storage/clamav.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { type Stack, startStack, TestClient } from './harness.js';

/**
 * Exercises the external integrations against real containers:
 * stripe-mock (Stripe API), SeaweedFS (S3) and — with CLAMAV_TEST=1 — ClamAV.
 */
const WITH_CLAMAV = process.env.CLAMAV_TEST === '1';
const WEBHOOK_SECRET = 'whsec_test_secret';
const S3_CONFIG = JSON.stringify({
  identities: [
    {
      name: 'test',
      credentials: [{ accessKey: 'test-key', secretKey: 'test-secret' }],
      actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
    },
  ],
});
// The standard antivirus test file (harmless by definition). Assembled at runtime so local
// antivirus software doesn't quarantine this source file.
const EICAR = [
  'X5O!P%@AP[4',
  String.fromCharCode(92),
  'PZX54(P^)7CC)7}$EICAR-STANDARD-',
  'ANTIVIRUS-TEST-FILE!$H+H*',
].join('');

let stack: Stack;
let containers: StartedTestContainer[] = [];
let anna: TestClient;
let hh: string;

beforeAll(async () => {
  const [stripeMock, s3, clamav] = await Promise.all([
    new GenericContainer('stripe/stripe-mock:latest').withExposedPorts(12111).start(),
    new GenericContainer('chrislusf/seaweedfs:latest')
      .withCommand(['server', '-dir=/data', '-s3', '-s3.port=8333', '-s3.config=/etc/s3.json'])
      .withCopyContentToContainer([{ content: S3_CONFIG, target: '/etc/s3.json' }])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
    WITH_CLAMAV
      ? new GenericContainer('clamav/clamav:stable')
          .withExposedPorts(3310)
          .withWaitStrategy(Wait.forLogMessage(/socket found, clamd started/i))
          .withStartupTimeout(600_000)
          .start()
      : null,
  ]);
  containers = [stripeMock, s3, ...(clamav ? [clamav] : [])];
  // Docker Desktop accepts on ::1 for "localhost" without forwarding; use IPv4 explicitly.
  const clamHost = clamav && clamav.getHost() === 'localhost' ? '127.0.0.1' : clamav?.getHost();
  if (clamav) {
    // The startup log appears before clamd accepts scans; wait for PONG.
    const deadline = Date.now() + 600_000;
    while (!(await pingClamd(clamHost as string, clamav.getMappedPort(3310)))) {
      if (Date.now() > deadline) throw new Error('clamd did not become ready');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  stack = await startStack({
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_API_BASE_URL: `http://${stripeMock.getHost()}:${stripeMock.getMappedPort(12111)}`,
    STRIPE_PRICE_PLUS_MONTH: 'price_plus_month',
    STRIPE_PRICE_PRO_YEAR: 'price_pro_year',
    REVENUECAT_WEBHOOK_SECRET: 'rc_secret',
    S3_ENDPOINT: `http://${s3.getHost()}:${s3.getMappedPort(8333)}`,
    S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret',
    ...(clamav
      ? { CLAMAV_HOST: clamHost as string, CLAMAV_PORT: String(clamav.getMappedPort(3310)) }
      : {}),
  });
  anna = await new TestClient(stack.app).signUp('anna@platform.test', 'Anna');
  hh = (await anna.post('/v1/households', { name: 'Plattform', displayName: 'Anna' })).body
    .household.id;
}, 900_000);

afterAll(async () => {
  await stack.close();
  await Promise.allSettled(containers.map((c) => c.stop()));
});

describe('billing', () => {
  it('starts a Stripe checkout session', async () => {
    const res = await anna.post(`/v1/households/${hh}/billing/checkout`, {
      plan: 'plus',
      interval: 'month',
    });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https?:\/\//);
  });

  it('applies verified Stripe subscription webhooks and rejects forged ones', async () => {
    const event = {
      id: 'evt_1',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          object: 'subscription',
          status: 'active',
          customer: 'cus_1',
          cancel_at_period_end: false,
          metadata: { householdId: hh },
          items: {
            data: [{ price: { id: 'price_plus_month' }, current_period_end: 1_900_000_000 }],
          },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const send = (sig: string) =>
      stack.app.inject({
        method: 'POST',
        url: '/v1/billing/webhooks/stripe',
        headers: { 'content-type': 'application/json', 'stripe-signature': sig },
        payload,
      });
    expect((await send('t=1,v1=forged')).statusCode).toBe(400);
    expect((await send(signature)).statusCode).toBe(200);
    const sub = await anna.get(`/v1/households/${hh}/billing`);
    expect(sub.body).toMatchObject({ plan: 'plus', status: 'active', provider: 'stripe' });
    expect(sub.body.entitlements.features).toContain('vault');
  });

  it('applies RevenueCat events with a valid secret only', async () => {
    const send = (auth: string, type: string, entitlementIds: string[]) =>
      stack.app.inject({
        method: 'POST',
        url: '/v1/billing/webhooks/revenuecat',
        headers: { 'content-type': 'application/json', authorization: auth },
        payload: JSON.stringify({
          event: { type, app_user_id: hh, entitlement_ids: entitlementIds, store: 'APP_STORE' },
        }),
      });
    expect((await send('Bearer wrong', 'INITIAL_PURCHASE', ['pro'])).statusCode).toBe(401);
    expect((await send('Bearer rc_secret', 'INITIAL_PURCHASE', ['pro'])).statusCode).toBe(200);
    expect((await anna.get(`/v1/households/${hh}/billing`)).body.plan).toBe('pro');
    await send('Bearer rc_secret', 'EXPIRATION', []);
    expect((await anna.get(`/v1/households/${hh}/billing`)).body.plan).toBe('free');
  });
});

describe('storage against real S3', () => {
  async function upload(name: string, mimeType: string, body: Buffer) {
    const ticket = await anna.post(`/v1/households/${hh}/storage/uploads`, {
      name,
      mimeType,
      sizeBytes: body.length,
    });
    expect(ticket.status).toBe(201);
    const put = await fetch(ticket.body.uploadUrl, {
      method: 'PUT',
      headers: ticket.body.uploadHeaders,
      body: new Uint8Array(body),
    });
    expect(put.status).toBe(200);
    const done = await anna.post(
      `/v1/households/${hh}/storage/files/${ticket.body.file.id}/complete`,
    );
    expect(done.body.status).toBe('scanning');
    // Workers don't run in tests; process the upload like the BullMQ job would.
    await stack.app.get(StorageService).process({ fileId: ticket.body.file.id });
    const file = await anna.get(`/v1/households/${hh}/storage/files/${ticket.body.file.id}`);
    expect(file.status).toBe(200);
    return file.body;
  }

  it('rejects uploads whose size does not match', async () => {
    const ticket = await anna.post(`/v1/households/${hh}/storage/uploads`, {
      name: 'x.txt',
      mimeType: 'text/plain',
      sizeBytes: 10,
    });
    const put = await fetch(ticket.body.uploadUrl, {
      method: 'PUT',
      headers: ticket.body.uploadHeaders,
      body: 'too short',
    });
    expect(put.status).toBeGreaterThanOrEqual(400);
    const done = await anna.post(
      `/v1/households/${hh}/storage/files/${ticket.body.file.id}/complete`,
    );
    expect(done.status).toBe(409);
  });

  it('stores images with thumbnails and serves downloads', async () => {
    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#22c55e' },
    })
      .png()
      .toBuffer();
    const file = await upload('garten.png', 'image/png', png);
    expect(file).toMatchObject({ status: 'ready', hasThumbnail: true });
    const link = await anna.get(
      `/v1/households/${hh}/storage/files/${file.id}/download?thumbnail=true`,
    );
    const thumb = await fetch(link.body.url);
    expect(thumb.status).toBe(200);
    expect(
      (await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width,
    ).toBeLessThanOrEqual(480);
  });

  it.runIf(WITH_CLAMAV)('blocks infected files (EICAR) with ClamAV', async () => {
    const clean = await upload(
      'notes.txt',
      'text/plain',
      Buffer.from('Einkaufsliste: Milch, Brot'),
    );
    expect(clean.status).toBe('ready');
    const infected = await upload('eicar.txt', 'text/plain', Buffer.from(EICAR));
    expect(infected.status).toBe('infected');
    const link = await anna.get(`/v1/households/${hh}/storage/files/${infected.id}/download`);
    expect(link.status).toBe(409);
  });
});

describe('admin operations', () => {
  let session: { admin: TestClient; auth: { authorization: string } } | null = null;

  /** One staff session for all tests: after TOTP enrolment, logins need a code. */
  async function staffClient() {
    session ??= await login();
    return session;
  }

  async function login() {
    const admin = new TestClient(stack.app);
    const login = await admin.post('/admin/v1/auth/login', {
      email: 'admin@test.local',
      password: 'admin-password-123',
    });
    const auth = { authorization: `Bearer ${login.body.token}` };
    if (login.body.totpSetupRequired) {
      const setup = await admin.request<{ secret: string }>(
        'POST',
        '/admin/v1/auth/totp',
        {},
        auth,
      );
      await admin.request(
        'POST',
        '/admin/v1/auth/totp/confirm',
        { code: generateSync({ secret: setup.body.secret }) },
        auth,
      );
    }
    return { admin, auth };
  }

  it('requires a customer grant for the support view and audits access', async () => {
    const { admin, auth } = await staffClient();
    const denied = await admin.request(
      'GET',
      `/admin/v1/households/${hh}/support`,
      undefined,
      auth,
    );
    expect(denied.status).toBe(403);
    const grant = await anna.post(`/v1/households/${hh}/support-access`, {
      hours: 2,
      reason: 'Sync-Problem',
    });
    expect(grant.body).toMatchObject({ active: true, reason: 'Sync-Problem' });
    const view = await admin.request<{ members: unknown[]; recentActivity: unknown[] }>(
      'GET',
      `/admin/v1/households/${hh}/support`,
      undefined,
      auth,
    );
    expect(view.status).toBe(200);
    expect(view.body.members).toHaveLength(1);
    expect(view.body.recentActivity.length).toBeGreaterThan(0);
    const detail = await admin.request<{ supportAccessUntil: string | null }>(
      'GET',
      `/admin/v1/households/${hh}`,
      undefined,
      auth,
    );
    expect(detail.body.supportAccessUntil).not.toBeNull();
    await anna.delete(`/v1/households/${hh}/support-access`);
    expect(
      (await admin.request('GET', `/admin/v1/households/${hh}/support`, undefined, auth)).status,
    ).toBe(403);
    const audit = await admin.request<{ items: { action: string }[] }>(
      'GET',
      '/admin/v1/audit?limit=20',
      undefined,
      auth,
    );
    expect(audit.body.items.map((a) => a.action)).toContain('household.support_viewed');
  });

  it('refuses refunds for payments of other customers', async () => {
    const { admin, auth } = await staffClient();
    const res = await admin.request(
      'POST',
      `/admin/v1/households/${hh}/refund`,
      { paymentIntentId: 'pi_123', reason: 'Doppelt abgebucht' },
      auth,
    );
    expect(res.status).toBe(403);
  });

  it('reports system status and CSV presets', async () => {
    const { admin, auth } = await staffClient();
    const sys = await admin.request<{ checks: Record<string, string>; queues: { name: string }[] }>(
      'GET',
      '/admin/v1/system',
      undefined,
      auth,
    );
    expect(sys.body.checks).toEqual({ database: 'up', redis: 'up' });
    const list = await admin.request<{ items: { id: string; memberCount: number }[] }>(
      'GET',
      '/admin/v1/households?limit=50',
      undefined,
      auth,
    );
    expect(list.body.items.find((h) => h.id === hh)?.memberCount).toBe(1);
    const users = await admin.request<{ items: { email: string; households: number }[] }>(
      'GET',
      '/admin/v1/users?q=anna%40platform',
      undefined,
      auth,
    );
    expect(users.body.items[0]?.households).toBe(1);
    expect(sys.body.queues.map((q) => q.name)).toEqual(['events', 'files', 'maintenance']);
    const presets = await admin.request<{ id: string }[]>(
      'GET',
      '/admin/v1/finance/csv-presets',
      undefined,
      auth,
    );
    expect(presets.body.map((p) => p.id)).toContain('sparkasse-camt');
  });
});
