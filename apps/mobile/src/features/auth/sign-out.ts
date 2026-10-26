import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearEmergencySummaries } from '@/features/contacts/offline-store';
import { unregisterPush } from '@/features/notifications/push';
import { useSettings } from '@/features/settings/settings-store';
import { authClient } from '@/lib/auth-client';
import { queryClient, queryPersister } from '@/lib/query-client';

/** Signs out and wipes every cached household data from the device. */
export async function signOut(): Promise<void> {
  await unregisterPush();
  try {
    await authClient.signOut();
  } catch {
    // Offline: the local session is dropped below anyway.
  }
  queryClient.clear();
  await queryPersister.removeClient();
  await clearEmergencySummaries(AsyncStorage).catch(() => undefined);
  useSettings.getState().setActiveHouseholdId(null);
}
