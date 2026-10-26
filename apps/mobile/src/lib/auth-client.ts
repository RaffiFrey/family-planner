import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { API_URL, APP_SCHEME } from './env';

/**
 * Better Auth (email + password); the session cookie lives in SecureStore.
 * On web Metro picks `auth-client.web.ts` instead (browser cookies).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: 'familyplaner',
      storage: SecureStore,
    }),
  ],
});

/** Cookie header for API and realtime requests (React Native has no cookie jar we can rely on). */
export async function sessionCookie(): Promise<string> {
  try {
    return await authClient.getCookie();
  } catch {
    return '';
  }
}

/** Whether requests must carry the cookie manually (native) or the browser sends it (web). */
export const usesBrowserCookies: boolean = false;
