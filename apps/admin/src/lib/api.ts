'use client';

import { adminApiContract, ApiError, createClient } from '@fp/contracts';

/** Same-origin path of the server-side proxy that attaches the bearer from the httpOnly cookie. */
export const PROXY_BASE = '/api/admin-proxy';

/** Typed browser client. Talks only to our own origin; the token never reaches JS. */
export const api = createClient(adminApiContract, {
  baseUrl: PROXY_BASE,
  credentials: 'same-origin',
}).admin;

/**
 * Endpoints whose request body has no `reason` field still require one for the staff audit log.
 * It travels in this header (URI-encoded, since header values must be ASCII-safe).
 */
export const REASON_HEADER = 'x-audit-reason';

export function withReason(reason: string): RequestInit {
  return { headers: { [REASON_HEADER]: encodeURIComponent(reason.trim()) } };
}

/** Message the API's StaffGuard uses when the staff member lacks the required role. */
const MISSING_ROLE = 'Missing staff role';

/** 403 caused by RBAC (as opposed to a business rule such as a missing customer grant). */
export function isMissingRole(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    (!err.problem.detail || err.message === MISSING_ROLE)
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (isMissingRole(err)) return 'You lack the staff role required for this action.';
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    const fieldErrors = err.problem.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
    return fieldErrors ? `${err.message} (${fieldErrors})` : err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
