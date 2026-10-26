import type { Env } from '../../../config/env.js';
import { describe, expect, it } from 'vitest';
import { isPrivateAddress, RecipeFetcher } from './recipe-fetcher.js';

describe('SSRF guard', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.1', true],
    ['192.168.178.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['[::1]', true],
    ['fd00::1', true],
    ['fe80::1%eth0', true],
    ['::ffff:127.0.0.1', true],
    ['not-an-ip', true],
    ['93.184.216.34', false],
    ['2a00:1450:4001:82a::2004', false],
    ['::ffff:93.184.216.34', false],
  ])('%s → %s', (ip, blocked) => {
    expect(isPrivateAddress(ip)).toBe(blocked);
  });

  it('rejects non-http URLs, credentials and private literals before connecting', async () => {
    const f = new RecipeFetcher();
    await expect(f.fetchHtml('file:///etc/passwd')).rejects.toMatchObject({
      code: 'import_blocked',
    });
    await expect(f.fetchHtml('http://user:pw@example.com/')).rejects.toMatchObject({
      code: 'import_blocked',
    });
    await expect(f.fetchHtml('http://169.254.169.254/latest/meta-data')).rejects.toMatchObject({
      code: 'import_blocked',
    });
    await expect(f.fetchHtml('http://[::1]:8080/')).rejects.toMatchObject({
      code: 'import_blocked',
    });
    await expect(f.fetchHtml('http://localhost:3000/')).rejects.toMatchObject({
      code: 'import_blocked',
    });
    await expect(f.fetchHtml('not a url')).rejects.toMatchObject({ code: 'import_failed' });
  });
});

describe('RecipeFetcher private-network switch', () => {
  it('is honoured only in test mode', () => {
    const env = (nodeEnv: string) =>
      ({ NODE_ENV: nodeEnv, RECIPE_FETCH_ALLOW_PRIVATE: true }) as unknown as Env;
    expect(new RecipeFetcher(env('production')).allowPrivateNetworks).toBe(false);
    expect(new RecipeFetcher(env('development')).allowPrivateNetworks).toBe(false);
    expect(new RecipeFetcher(env('test')).allowPrivateNetworks).toBe(true);
    expect(new RecipeFetcher().allowPrivateNetworks).toBe(false);
  });
});
