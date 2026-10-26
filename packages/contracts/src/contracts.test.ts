import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ApiError, buildPath, buildQuery, createClient } from './client.js';
import { flattenContract } from './core.js';
import { adminApiContract, apiContract } from './index.js';
import { CreateEventBody, UpdateEventBody } from './modules/calendar.js';
import { CreateTaskBody } from './modules/tasks.js';
import { generateOpenApi } from './openapi.js';

const HH = '0190f2a4-5b6c-7d8e-9f00-112233445566';

describe('contract', () => {
  it('has unique method+path pairs and operation names', () => {
    const all = [...flattenContract(apiContract), ...flattenContract(adminApiContract)];
    const keys = all.map(([, e]) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Every :param in the path is declared in the params schema.
    for (const [name, e] of all) {
      const declared = Object.keys(e.params?.shape ?? {});
      for (const m of e.path.matchAll(/:([A-Za-z]+)/g)) {
        expect(declared, `${name} declares ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it('generates an OpenAPI document', () => {
    const doc = generateOpenApi(apiContract, { title: 'Family Planer API', version: '1.0.0' }) as {
      paths: Record<
        string,
        Record<string, { operationId: string; parameters: { name: string }[] }>
      >;
    };
    const op = doc.paths['/v1/households/{householdId}/tasks/{taskId}/complete']?.post;
    expect(op?.operationId).toBe('tasks.complete');
    expect(op?.parameters.map((p) => p.name)).toEqual(['householdId', 'taskId']);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(40);
  });
});

describe('schemas', () => {
  it('applies defaults on create and not on update', () => {
    const created = CreateEventBody.parse({
      calendarId: HH,
      title: 'Zahnarzt',
      start: '2026-11-03T14:00:00+01:00',
      end: '2026-11-03T15:00:00+01:00',
    });
    expect(created).toMatchObject({ allDay: false, timezone: 'Europe/Berlin', reminders: [] });
    expect(UpdateEventBody.parse({ title: 'x' })).toEqual({ title: 'x', scope: 'all' });
  });

  it('validates event ranges and recurring tasks', () => {
    expect(
      CreateEventBody.safeParse({
        calendarId: HH,
        title: 'x',
        start: '2026-11-03T15:00:00Z',
        end: '2026-11-03T14:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      CreateTaskBody.safeParse({
        title: 'Gießen',
        recurrence: { mode: 'floating', interval: 3, unit: 'day' },
      }).success,
    ).toBe(false);
    expect(
      CreateTaskBody.safeParse({
        title: 'Gießen',
        dueAt: '2026-11-03T18:00:00+01:00',
        recurrence: { mode: 'floating', interval: 3, unit: 'day' },
      }).success,
    ).toBe(true);
  });
});

describe('client', () => {
  it('builds paths and queries', () => {
    expect(buildPath('/a/:x/b/:y', { x: 'h h', y: 2 })).toBe('/a/h%20h/b/2');
    expect(() => buildPath('/a/:x', {})).toThrow(/Missing path parameter/);
    expect(buildQuery({ a: 1, b: undefined, c: ['x', 'y'] })).toBe('?a=1&c=x&c=y');
    expect(buildQuery({})).toBe('');
  });

  it('calls endpoints with typed inputs and returns JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const client = createClient(apiContract, {
      baseUrl: 'http://api/',
      fetch: fetchMock as typeof fetch,
    });
    const tasks = await client.tasks.list({
      params: { householdId: HH },
      query: { status: 'all' },
    });
    expectTypeOf(tasks).toBeArray();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://api/v1/households/${HH}/tasks?status=all`);
    expect(init.method).toBe('GET');
  });

  it('adds idempotency keys to POSTs and throws ApiError with problem details', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'nope' }),
          { status: 403 },
        ),
    );
    const client = createClient(apiContract, {
      baseUrl: 'http://api',
      fetch: fetchMock as typeof fetch,
      headers: () => ({ cookie: 'c=1' }),
    });
    const err = await client.lists
      .create({ params: { householdId: HH }, body: { name: 'Einkauf' } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toBe('nope');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.cookie).toBe('c=1');
    expect(init.body).toBe(JSON.stringify({ name: 'Einkauf' }));
  });

  it('handles empty and non-JSON error bodies', async () => {
    const client = createClient(apiContract, {
      baseUrl: 'http://api',
      fetch: (async () =>
        new Response('', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch,
    });
    await expect(client.system.health()).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
    });
  });
});
