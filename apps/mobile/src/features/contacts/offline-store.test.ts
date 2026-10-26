import type { EmergencySummary } from '@fp/contracts';
import {
  clearEmergencySummaries,
  emergencyStorageKey,
  isStale,
  type KeyValueStorage,
  loadEmergencySummary,
  saveEmergencySummary,
} from './offline-store';
import { telUrl } from './call';
import { splitList } from './text';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => Promise.resolve(data.get(k) ?? null),
    setItem: (k, v) => {
      data.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k) => {
      data.delete(k);
      return Promise.resolve();
    },
    getAllKeys: () => Promise.resolve([...data.keys()]),
  };
}

const summary = {
  member: { id: 'm1', displayName: 'Mia', birthday: '2018-04-02', color: '#ff0000' },
  card: null,
  doctor: null,
  emergencyContacts: [],
  generatedAt: '2026-10-25T10:00:00.000Z',
  version: 'abc',
  maxAgeSeconds: 3600,
} as EmergencySummary;

describe('offline emergency store', () => {
  it('saves per household and member and loads it back', async () => {
    const storage = memoryStorage();
    const now = new Date('2026-10-25T10:05:00.000Z');
    await saveEmergencySummary(storage, 'h1', summary, now);
    expect(storage.data.has(emergencyStorageKey('h1', 'm1'))).toBe(true);
    const loaded = await loadEmergencySummary(storage, 'h1', 'm1');
    expect(loaded?.savedAt).toBe(now.toISOString());
    expect(loaded?.summary.member.displayName).toBe('Mia');
    expect(await loadEmergencySummary(storage, 'h2', 'm1')).toBeNull();
  });

  it('ignores corrupt entries and clears only its own keys', async () => {
    const storage = memoryStorage();
    await storage.setItem(emergencyStorageKey('h1', 'm1'), '{nope');
    expect(await loadEmergencySummary(storage, 'h1', 'm1')).toBeNull();
    await storage.setItem('other', 'x');
    await saveEmergencySummary(storage, 'h1', summary);
    await clearEmergencySummaries(storage);
    expect([...storage.data.keys()]).toEqual(['other']);
  });

  it('detects stale copies from maxAgeSeconds', () => {
    const stored = { summary, savedAt: '2026-10-25T10:00:00.000Z' };
    expect(isStale(stored, new Date('2026-10-25T10:30:00.000Z'))).toBe(false);
    expect(isStale(stored, new Date('2026-10-25T11:30:00.000Z'))).toBe(true);
  });
});

describe('contact helpers', () => {
  it('builds dialable tel: URLs', () => {
    expect(telUrl('+49 (0)30 123-45 67')).toBe('tel:+490301234567');
    expect(telUrl('030 / 112')).toBe('tel:030112');
    expect(telUrl('12')).toBeNull();
  });

  it('splits comma lists', () => {
    expect(splitList('Nüsse, Penicillin; nüsse\nBienen, ')).toEqual([
      'Nüsse',
      'Penicillin',
      'Bienen',
    ]);
  });
});
