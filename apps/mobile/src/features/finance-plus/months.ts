/** `YYYY-MM` of a date (local time). */
export function yearMonth(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM` n months before `d`'s month. */
export function monthsBack(d: Date, n: number): string {
  return yearMonth(new Date(d.getFullYear(), d.getMonth() - n, 1));
}

/** Short month label ("Okt.") for a `YYYY-MM`. */
export function monthLabel(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(
    new Date(y ?? 1970, (m ?? 1) - 1, 15),
  );
}
