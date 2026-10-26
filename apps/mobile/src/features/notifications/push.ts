import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { notificationLinkToRoute } from '@/lib/links';

if (Platform.OS !== 'web')
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
  });

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const eas = (Constants as { easConfig?: { projectId?: string } | null }).easConfig;
  return extra?.eas?.projectId ?? eas?.projectId ?? undefined;
}

let registeredToken: string | null = null;

/**
 * Asks for permission and registers the Expo push token with the API.
 * Silently does nothing on simulators, without an EAS project id or when permission is denied.
 */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS === 'web') return null;
  const id = projectId();
  if (!id) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Family Planer',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== Notifications.PermissionStatus.GRANTED) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== Notifications.PermissionStatus.GRANTED) return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.notifications.registerDevice({
    body: {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceName: Device.deviceName ?? undefined,
    },
  });
  registeredToken = token;
  return token;
}

/** Removes this device's push token (called on sign out). */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  try {
    await api.notifications.unregisterDevice({ params: { token } });
  } catch {
    // The token expires server-side anyway.
  }
}

export function usePushRegistration(): void {
  useEffect(() => {
    registerForPush().catch(() => {
      // Expo Go / missing credentials: push is optional.
    });
  }, []);
}

/** Opens the screen behind a tapped notification (also for the tap that launched the app). */
function useNativeNotificationDeepLinks(): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data as { link?: unknown } | null;
    const link = typeof data?.link === 'string' ? data.link : null;
    router.push(notificationLinkToRoute(link));
  }, [response]);
}

/** Push notifications do not exist in the web build (Expo web is used for testing only). */
export const useNotificationDeepLinks: () => void =
  Platform.OS === 'web' ? () => undefined : useNativeNotificationDeepLinks;
