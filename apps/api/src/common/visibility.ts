import { and, eq, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * SQL filter for item-level visibility (household / private / selected members),
 * mirroring `canSee` from @fp/domain/permissions.
 */
export function visibleTo(
  memberId: string,
  cols: { visibility: AnyPgColumn; owner: AnyPgColumn; sharedWith?: AnyPgColumn },
): SQL {
  return or(
    eq(cols.visibility, 'household'),
    eq(cols.owner, memberId),
    cols.sharedWith
      ? and(eq(cols.visibility, 'members'), sql`${memberId}::uuid = any(${cols.sharedWith})`)
      : sql`false`,
  ) as SQL;
}
