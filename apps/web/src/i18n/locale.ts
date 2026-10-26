export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Persists the UI language; the server reads it on the next render. */
export function setLocaleCookie(locale: string): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
