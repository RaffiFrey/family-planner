import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { PushService } from './push.service.js';

describe('PushService (Expo Push API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Expo tokens in chunks and reports unregistered devices', async () => {
    const calls: { url: string; body: { to: string }[]; auth: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { to: string }[];
        calls.push({
          url,
          body,
          auth: (init.headers as Record<string, string>).authorization ?? null,
        });
        return new Response(
          JSON.stringify({
            data: body.map((m) =>
              m.to.includes('dead')
                ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
                : { status: 'ok' },
            ),
          }),
        );
      }),
    );
    const push = new PushService({ EXPO_ACCESS_TOKEN: 'expo-token' } as Env);
    const tokens = Array.from(
      { length: 150 },
      (_, i) => `ExponentPushToken[${i === 120 ? 'dead' : `ok${i}`}]`,
    );
    const invalid = await push.send([
      ...tokens.map((to) => ({ to, title: 'Hallo', body: 'Test' })),
      { to: 'not-an-expo-token', title: 'x', body: 'y' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(calls[0]?.body).toHaveLength(100);
    expect(calls[1]?.body).toHaveLength(50);
    expect(calls[0]?.auth).toBe('Bearer expo-token');
    expect(invalid).toEqual(['ExponentPushToken[dead]']);
  });

  it('skips the network when there are no Expo tokens and survives failures', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    const push = new PushService({} as Env);
    expect(await push.send([{ to: 'web-token', title: 'a', body: 'b' }])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await push.send([{ to: 'ExponentPushToken[x]', title: 'a', body: 'b' }])).toEqual([]);
  });
});
