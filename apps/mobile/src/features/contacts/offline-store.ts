import type { EmergencySummary } from '@fp/contracts';

/** Minimal async key/value storage (AsyncStorage in the app, an in-memory map in tests). */
export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  getAllKeys?: () => Promise<readonly string[]>;
}

/** An emergency summary as persisted on the device, with the time it was saved. */
export interface StoredEmergencySummary {
  summary: EmergencySummary;
  /** When the device stored this copy (ISO). */
  savedAt: string;
}

const PREFIX = 'fp-emergency-v1';

export function emergencyStorageKey(householdId: string, memberId: string): string {
  return `${PREFIX}:${householdId}:${memberId}`;
}

function isStored(v: unknown): v is StoredEmergencySummary {
  if (!v || typeof v !== 'object') return false;
  const o = v as { summary?: { member?: { id?: unknown } }; savedAt?: unknown };
  return typeof o.savedAt === 'string' && typeof o.summary?.member?.id === 'string';
}

export async function loadEmergencySummary(
  storage: KeyValueStorage,
  householdId: string,
  memberId: string,
): Promise<StoredEmergencySummary | null> {
  try {
    const raw = await storage.getItem(emergencyStorageKey(householdId, memberId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persists a freshly fetched summary. Unchanged content (same `version`) keeps the existing copy
 * but refreshes `savedAt`, because the data was confirmed current at that moment.
 */
export async function saveEmergencySummary(
  storage: KeyValueStorage,
  householdId: string,
  summary: EmergencySummary,
  now: Date = new Date(),
): Promise<StoredEmergencySummary> {
  const stored: StoredEmergencySummary = { summary, savedAt: now.toISOString() };
  await storage.setItem(
    emergencyStorageKey(householdId, summary.member.id),
    JSON.stringify(stored),
  );
  return stored;
}

/** Removes every persisted card (sign out / leaving a household). */
export async function clearEmergencySummaries(storage: KeyValueStorage): Promise<void> {
  if (!storage.getAllKeys) return;
  const keys = await storage.getAllKeys();
  await Promise.all(
    keys.filter((k) => k.startsWith(`${PREFIX}:`)).map((k) => storage.removeItem(k)),
  );
}

/** True when the offline copy is older than the server's suggested max age. */
export function isStale(stored: StoredEmergencySummary, now: Date = new Date()): boolean {
  const age = (now.getTime() - new Date(stored.savedAt).getTime()) / 1000;
  return age > stored.summary.maxAgeSeconds;
}
