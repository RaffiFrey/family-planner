import { createApi } from '@fp/api-client';
import { sessionCookie, usesBrowserCookies } from './auth-client';
import { trackedFetch } from './connectivity';
import { API_URL } from './env';

/**
 * Typed API client. Native requests carry the Better Auth session cookie explicitly;
 * on web the browser sends its own cookie (`credentials: 'include'`).
 */
export const api = createApi({
  baseUrl: API_URL,
  credentials: usesBrowserCookies ? 'include' : 'omit',
  fetch: trackedFetch,
  headers: async (): Promise<Record<string, string>> => {
    if (usesBrowserCookies) return {};
    const cookie = await sessionCookie();
    return cookie ? { cookie } : {};
  },
});
