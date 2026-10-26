import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_API_URL } from '@/lib/env';
import { SESSION_COOKIE } from '@/lib/cookie-name';

/**
 * Same-origin backend-for-frontend proxy for client components.
 * Reads the staff token from the httpOnly cookie and forwards the call to the admin API
 * with `Authorization: Bearer`. The token itself is never exposed to browser JS.
 */

export const dynamic = 'force-dynamic';

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'idempotency-key', 'x-audit-reason'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after'];
/** Auth endpoints that must go through the server actions (they manage the cookie). */
const BLOCKED = new Set(['admin/v1/auth/login', 'admin/v1/auth/logout']);

function problem(status: number, title: string, detail?: string) {
  return NextResponse.json(
    { type: 'about:blank', title, status, detail },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') === 'same-origin';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(encodeURIComponent).join('/');
  if (
    path.some((s) => s === '.' || s === '..' || s === '') ||
    !joined.startsWith('admin/v1/') ||
    BLOCKED.has(joined)
  ) {
    return problem(404, 'Not found');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !isSameOrigin(req)) {
    return problem(403, 'Cross-origin request rejected');
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return problem(401, 'Not signed in');

  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const clientIp = req.headers.get('x-forwarded-for');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${ADMIN_API_URL}/${joined}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : null,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return problem(502, 'Admin API unreachable');
  }

  const resHeaders = new Headers({ 'cache-control': 'no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) resHeaders.set(name, v);
  }
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  const res = new NextResponse(body, { status: upstream.status, headers: resHeaders });
  if (upstream.status === 401) res.cookies.delete({ name: SESSION_COOKIE, path: '/' });
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
