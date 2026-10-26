import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/cookie-name';

/**
 * Optimistic auth check only (cookie presence). The real check happens in the console
 * layout (`me` call) and in the admin API itself.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === '/login' || pathname.startsWith('/api/');
  if (!isPublic && !req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
