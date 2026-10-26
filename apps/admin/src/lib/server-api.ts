import { adminApiContract, createClient } from '@fp/contracts';
import { ADMIN_API_URL } from './env';
import { getSessionToken } from './session';

/** Typed admin API client for Server Components/Functions and Route Handlers. Pass `null` for unauthenticated calls (login); omit to use the session cookie. */
export function serverApi(token?: string | null) {
  return createClient(adminApiContract, {
    baseUrl: ADMIN_API_URL,
    credentials: 'omit',
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    headers: async (): Promise<Record<string, string>> => {
      const t = token === undefined ? await getSessionToken() : token;
      return t ? { authorization: `Bearer ${t}` } : {};
    },
  }).admin;
}
