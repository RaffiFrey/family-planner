import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The active sharing session, persisted so the background location task (which runs without any
 * mounted React tree) knows which household to post to and when to stop.
 */
export interface SharingSession {
  householdId: string;
  /** ISO end of the sharing period (from the API's `until`). */
  until: string;
  /** Whether the user allowed updates while the app is in the background. */
  background: boolean;
}

const KEY = 'fp-location-session-v1';

export async function loadSession(): Promise<SharingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SharingSession>;
    if (typeof parsed.householdId !== 'string' || typeof parsed.until !== 'string') return null;
    return {
      householdId: parsed.householdId,
      until: parsed.until,
      background: parsed.background === true,
    };
  } catch {
    return null;
  }
}

export async function saveSession(session: SharingSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function isExpired(session: Pick<SharingSession, 'until'>, now: Date = new Date()): boolean {
  return new Date(session.until).getTime() <= now.getTime();
}
