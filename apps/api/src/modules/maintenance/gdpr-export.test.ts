import { getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { exportModuleTables, stripSecrets, visibleToMember } from './gdpr-export.js';

const ME = '00000000-0000-7000-8000-000000000001';
const OTHER = '00000000-0000-7000-8000-000000000002';

/** Fake query builder returning canned rows per table. */
function fakeDb(rowsByTable: Record<string, Record<string, unknown>[]>) {
  return {
    select: () => ({
      from: (t: PgTable) => ({ where: async () => rowsByTable[getTableName(t)] ?? [] }),
    }),
  };
}

describe('GDPR module export', () => {
  it('filters private items of others and secret columns', () => {
    expect(visibleToMember({ visibility: 'private', ownerMemberId: ME }, ME)).toBe(true);
    expect(visibleToMember({ visibility: 'private', ownerMemberId: OTHER }, ME)).toBe(false);
    expect(
      visibleToMember({ visibility: 'members', ownerMemberId: OTHER, sharedWith: [ME] }, ME),
    ).toBe(true);
    expect(visibleToMember({ visibility: 'household' }, ME)).toBe(true);
    expect(
      stripSecrets({ title: 'Pass', numberEnc: 'v1:x', numberLast4: '1234', tokenHash: 'h' }),
    ).toEqual({
      title: 'Pass',
      numberLast4: '1234',
    });
  });

  it('exports module tables according to role permissions', async () => {
    const db = fakeDb({
      vault_documents: [
        {
          title: 'Reisepass',
          visibility: 'household',
          holderMemberId: OTHER,
          numberEnc: 'v1:secret',
        },
        { title: 'Privat', visibility: 'private', holderMemberId: OTHER },
      ],
      recipes: [{ title: 'Lasagne' }],
      outbox: [{ type: 'x' }],
    });
    const adult = await exportModuleTables(db as never, 'hh', {
      id: ME,
      role: 'adult',
      grantedModules: null,
      accessUntil: null,
    });
    expect(adult.vault_documents).toEqual([
      { title: 'Reisepass', visibility: 'household', holderMemberId: OTHER },
    ]);
    expect(adult.recipes).toEqual([{ title: 'Lasagne' }]);
    expect(adult.outbox).toBeUndefined();
    const teen = await exportModuleTables(db as never, 'hh', {
      id: ME,
      role: 'teen',
      grantedModules: null,
      accessUntil: null,
    });
    expect(teen.vault_documents).toBeUndefined();
    expect(teen.recipes).toHaveLength(1);
  });
});
