import { createAuthClient } from 'better-auth/react';
import { API_URL } from './env';

/**
 * Web (Expo web export): SecureStore does not exist in browsers, so use the plain Better Auth
 * client and let the browser keep the session cookie (`credentials: 'include'`).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});

/** Browsers attach the cookie themselves; no manual cookie header on web. */
export function sessionCookie(): Promise<string> {
  return Promise.resolve('');
}

/** Whether requests must carry the cookie manually (native) or the browser sends it (web). */
export const usesBrowserCookies = true;
