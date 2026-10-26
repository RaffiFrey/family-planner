import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/cookie-name';

/**
 * Clears an expired/invalid session cookie and returns to the login page.
 * Server Components cannot modify cookies, so they redirect here on 401.
 * (Interactive sign-out uses the `logoutAction` server action, which also revokes the session upstream.)
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login?expired=1', req.url));
  res.cookies.delete({ name: SESSION_COOKIE, path: '/' });
  return res;
}
