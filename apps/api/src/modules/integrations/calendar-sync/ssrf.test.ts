import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FetchError, isPrivateAddress, normalizeFeedUrl, safeFetch } from './ssrf.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::1]',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('normalizeFeedUrl', () => {
  it('accepts https and webcal', () => {
    expect(normalizeFeedUrl('webcal://example.com/a.ics').toString()).toBe(
      'https://example.com/a.ics',
    );
    expect(normalizeFeedUrl('https://example.com/a.ics').hostname).toBe('example.com');
  });

  it.each([
    ['http://example.com/a.ics', 'invalid_url'],
    ['ftp://example.com/a.ics', 'invalid_url'],
    ['https://user:pw@example.com/a.ics', 'invalid_url'],
    ['nonsense', 'invalid_url'],
    ['https://localhost/a.ics', 'blocked'],
    ['https://metadata.google.internal/', 'blocked'],
    ['https://127.0.0.1/a.ics', 'blocked'],
    ['https://[::1]/a.ics', 'blocked'],
    ['https://169.254.169.254/latest', 'blocked'],
  ])('rejects %s', (url, code) => {
    try {
      normalizeFeedUrl(url);
      expect.unreachable();
    } catch (e) {
      expect((e as FetchError).code).toBe(code);
    }
  });

  it('allows private http targets only with the override', () => {
    expect(
      normalizeFeedUrl('http://127.0.0.1:8080/x', { allowHttp: true, allowPrivateNetworks: true })
        .port,
    ).toBe('8080');
  });
});

describe('safeFetch', () => {
  let server: Server;
  let base: string;
  const open = { allowHttp: true, allowPrivateNetworks: true };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/feed' }).end();
      } else if (req.url === '/loop') {
        res.writeHead(302, { location: '/loop' }).end();
      } else if (req.url === '/big') {
        res.end('x'.repeat(2000));
      } else if (req.url === '/evil') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest' }).end();
      } else {
        res.writeHead(200, { etag: '"v1"' }).end('BEGIN:VCALENDAR');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(
    () =>
      new Promise<void>((r) =>
        server.close(() => {
          r();
        }),
      ),
  );

  it('blocks loopback by default', async () => {
    await expect(safeFetch(`${base}/feed`)).rejects.toMatchObject({ code: 'invalid_url' });
    await expect(
      safeFetch(`${base}/feed`, { policy: { allowHttp: true, allowPrivateNetworks: false } }),
    ).rejects.toMatchObject({ code: 'blocked' });
    await expect(
      safeFetch(`http://localtest.me:1/feed`, {
        policy: { allowHttp: true, allowPrivateNetworks: false },
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it('fetches, follows redirects and enforces limits with the override', async () => {
    const res = await safeFetch(`${base}/redirect`, { policy: open });
    expect(res).toMatchObject({ status: 200, body: 'BEGIN:VCALENDAR', finalUrl: `${base}/feed` });
    expect(res.headers.etag).toBe('"v1"');
    await expect(safeFetch(`${base}/loop`, { policy: open })).rejects.toThrow(/redirects/);
    await expect(safeFetch(`${base}/big`, { policy: open, maxBytes: 100 })).rejects.toMatchObject({
      code: 'too_large',
    });
    await expect(
      safeFetch(`${base}/evil`, { policy: { allowHttp: true, allowPrivateNetworks: false } }),
    ).rejects.toMatchObject({ code: 'blocked' });
  });
});
