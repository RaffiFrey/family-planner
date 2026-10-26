import { ApiError } from '@fp/api-client';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { clearSession, isExpired, loadSession } from './session';
import { clampAccuracy } from './share';

/**
 * Background location task. expo-task-manager requires `defineTask` at module scope, so this file
 * is imported once from the root layout (src/app/_layout.tsx). Not available on web.
 */
export const LOCATION_TASK = 'fp-location-sharing';

const nativeOnly = Platform.OS !== 'web';

async function stopIfRunning(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Task was never registered on this device.
  }
}

if (nativeOnly) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    LOCATION_TASK,
    async ({ data, error }) => {
      if (error) return;
      const session = await loadSession();
      if (!session || isExpired(session)) {
        await clearSession();
        await stopIfRunning();
        return;
      }
      const latest = data.locations?.at(-1);
      if (!latest) return;
      try {
        await api.location.ping({
          params: { householdId: session.householdId },
          body: {
            lat: latest.coords.latitude,
            lng: latest.coords.longitude,
            accuracyM: clampAccuracy(latest.coords.accuracy),
            at: new Date(Math.min(latest.timestamp, Date.now())).toISOString(),
          },
        });
      } catch (e) {
        // Sharing ended elsewhere (stopped on another device, expired, access revoked).
        if (e instanceof ApiError && [400, 403, 404, 409].includes(e.status)) {
          await clearSession();
          await stopIfRunning();
        }
      }
    },
  );
}

/** Whether background updates can work here (native, task manager available, OS supports it). */
export async function backgroundUpdatesSupported(): Promise<boolean> {
  if (!nativeOnly) return false;
  try {
    return (
      (await TaskManager.isAvailableAsync()) &&
      (await Location.isBackgroundLocationAvailableAsync())
    );
  } catch {
    return false;
  }
}

/**
 * Starts background updates if supported and the user grants "always" permission.
 * Returns whether background updates are running.
 */
export async function startBackgroundUpdates(notification: {
  title: string;
  body: string;
}): Promise<boolean> {
  if (!(await backgroundUpdatesSupported())) return false;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return false;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60_000,
      distanceInterval: 100,
      deferredUpdatesInterval: 5 * 60_000,
      deferredUpdatesDistance: 100,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: notification.title,
        notificationBody: notification.body,
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundUpdates(): Promise<void> {
  if (!nativeOnly) return;
  await stopIfRunning();
}

export async function backgroundUpdatesRunning(): Promise<boolean> {
  if (!nativeOnly) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
