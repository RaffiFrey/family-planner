import type { VaultDocument } from '@fp/contracts';
import {
  compareDocuments,
  daysUntil,
  isLocalDate,
  leadDaysFor,
  parseTags,
  reminderModeOf,
  toLocalDate,
} from './expiry';

function doc(partial: Partial<VaultDocument>): VaultDocument {
  return {
    id: 'x',
    type: 'other',
    title: 'Doc',
    holderMemberId: null,
    issuer: null,
    documentNumber: null,
    documentNumberLast4: null,
    issuedOn: null,
    expiresOn: null,
    expiryState: 'none',
    notes: null,
    fileIds: [],
    tags: [],
    reminderLeadDays: [],
    visibility: 'household',
    sharedWith: null,
    ownerMemberId: 'm',
    ocrStatus: 'none',
    suggestions: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('vault expiry helpers', () => {
  const now = new Date(2026, 9, 25, 15, 30);
  it('counts days until a local date', () => {
    expect(daysUntil('2026-10-25', now)).toBe(0);
    expect(daysUntil('2026-11-24', now)).toBe(30);
    expect(daysUntil('2026-10-20', now)).toBe(-5);
  });
  it('formats local dates', () => {
    expect(toLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isLocalDate('2026-01-05')).toBe(true);
    expect(isLocalDate('05.01.2026')).toBe(false);
  });
  it('sorts expired and expiring documents first', () => {
    const list = [
      doc({ title: 'B', expiryState: 'valid', expiresOn: '2030-01-01' }),
      doc({ title: 'A', expiryState: 'none' }),
      doc({ title: 'C', expiryState: 'expired', expiresOn: '2025-01-01' }),
      doc({ title: 'D', expiryState: 'expiring', expiresOn: '2026-12-01' }),
      doc({ title: 'E', expiryState: 'valid', expiresOn: '2028-01-01' }),
    ].sort(compareDocuments);
    expect(list.map((d) => d.title)).toEqual(['C', 'D', 'E', 'B', 'A']);
  });
  it('parses tags', () => {
    expect(parseTags(' Reise, Auto ,, reise, Auto')).toEqual(['Reise', 'Auto', 'reise']);
  });
});

describe('reminder lead days', () => {
  it('detects the stored mode', () => {
    expect(reminderModeOf(null)).toBe('default');
    expect(reminderModeOf([7, 183, 30])).toBe('default');
    expect(reminderModeOf([])).toBe('none');
    expect(reminderModeOf([90, 14])).toBe('custom');
  });
  it('builds the API value', () => {
    expect(leadDaysFor('default', [1])).toBeNull();
    expect(leadDaysFor('none', [1])).toEqual([]);
    expect(leadDaysFor('custom', [7, 365, 7, 30, 1, 14, 90])).toEqual([365, 90, 30, 14, 7]);
  });
});
