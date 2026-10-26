import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './cookie-name';
import { IS_PROD } from './env';

export { SESSION_COOKIE };

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Only callable from Server Functions and Route Handlers. */
export async function setSessionToken(token: string, expiresAt: string): Promise<void> {
  const expires = new Date(expiresAt);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    path: '/',
    expires: Number.isNaN(expires.getTime()) ? new Date(Date.now() + 8 * 3600_000) : expires,
  });
}

/** Only callable from Server Functions and Route Handlers. */
export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/' });
}
