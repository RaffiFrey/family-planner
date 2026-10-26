/** sessionStorage key remembering which household started the Google OAuth flow. */
export const GOOGLE_PENDING_KEY = 'fp.googleCalendarPending';

export function readGooglePending(): { householdId: string; state: string } | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_PENDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { householdId?: unknown; state?: unknown };
    return typeof v.householdId === 'string' && typeof v.state === 'string'
      ? { householdId: v.householdId, state: v.state }
      : null;
  } catch {
    return null;
  }
}

export function clearGooglePending(): void {
  try {
    sessionStorage.removeItem(GOOGLE_PENDING_KEY);
  } catch {
    // ignore
  }
}
