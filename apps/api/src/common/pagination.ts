import { badRequest } from './errors.js';

export interface Cursor {
  /** Sort value (ISO timestamp or date). */
  v: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.v !== 'string' || typeof parsed.id !== 'string')
      throw new Error('bad cursor');
    return { v: parsed.v, id: parsed.id };
  } catch {
    throw badRequest('Invalid cursor', 'invalid_cursor');
  }
}

/** Takes `limit + 1` rows and returns the page plus the cursor for the next one. */
export function toPage<T, R>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => Cursor,
  map: (row: T) => R,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: items.map(map),
    nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
  };
}
