import {
  type ContractTree,
  type EndpointDef,
  type EndpointInput,
  type EndpointOutput,
  isEndpoint,
  type ProblemDetails,
} from './core.js';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title);
  }
}

type EndpointFn<E extends EndpointDef> = keyof EndpointInput<E> extends never
  ? (input?: Record<string, never>, init?: RequestInit) => Promise<EndpointOutput<E>>
  : (input: EndpointInput<E>, init?: RequestInit) => Promise<EndpointOutput<E>>;

export type ContractClient<T extends ContractTree> = {
  [K in keyof T]: T[K] extends EndpointDef
    ? EndpointFn<T[K]>
    : T[K] extends ContractTree
      ? ContractClient<T[K]>
      : never;
};

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Extra headers per request, e.g. the session cookie on mobile or an idempotency key. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  credentials?: RequestCredentials;
}

function toParam(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function buildPath(path: string, params: Record<string, unknown> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
    const v = params[key];
    if (v === undefined || v === null) throw new Error(`Missing path parameter "${key}"`);
    return encodeURIComponent(toParam(v));
  });
}

export function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, toParam(item));
    else sp.set(k, toParam(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function makeCall(e: EndpointDef, options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  return async (
    input: { params?: object; query?: object; body?: unknown } = {},
    init: RequestInit = {},
  ) => {
    const url =
      options.baseUrl.replace(/\/$/, '') +
      buildPath(e.path, input.params as Record<string, unknown>) +
      buildQuery(input.query as Record<string, unknown>);
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(await options.headers?.()),
    };
    if (input.body !== undefined) headers['content-type'] = 'application/json';
    if (e.method === 'POST' && !headers['idempotency-key'])
      headers['idempotency-key'] = newIdempotencyKey();
    const res = await doFetch(url, {
      ...init,
      method: e.method,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      body: input.body === undefined ? null : JSON.stringify(input.body),
      credentials: options.credentials ?? 'include',
    });
    if (res.status === 204) return undefined;
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const problem =
        data && typeof data === 'object' && 'title' in data
          ? (data as ProblemDetails)
          : { type: 'about:blank', title: res.statusText || 'Request failed', status: res.status };
      throw new ApiError(res.status, problem);
    }
    return data;
  };
}

/** Typed fetch client derived from a contract tree. */
export function createClient<T extends ContractTree>(
  contract: T,
  options: ClientOptions,
): ContractClient<T> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(contract)) {
    out[key] = isEndpoint(v) ? makeCall(v, options) : createClient(v, options);
  }
  return out as ContractClient<T>;
}
