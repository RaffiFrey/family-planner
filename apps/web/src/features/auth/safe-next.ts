/** Only allow same-origin relative redirects after sign-in (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
