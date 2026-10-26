import { ApiError, apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import { useNow } from '@/lib/use-now';
import {
  backgroundUpdatesRunning,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from './background-task';
import { clearSession, loadSession, saveSession } from './session';
import { clampAccuracy, type LatLng, shouldSendPing } from './share';

export function useMyShare() {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'location', 'myShare', { params: { householdId } }),
    refetchInterval: 60_000,
  });
}

/** Whether my share is currently active (and not past its end). */
export function useIsSharing(): boolean {
  const share = useMyShare();
  const now = useNow(30_000);
  const data = share.data;
  return !!data && data.active && new Date(data.until).getTime() > now.getTime();
}

export function useMemberLocations(enabled = true) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'location', 'latest', { params: { householdId } }),
    enabled,
    refetchInterval: 30_000,
  });
}

export function usePlaces() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['location', 'places', { householdId }],
    queryFn: () => api.location.places.list({ params: { householdId } }),
  });
}

export function useStartSharing() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      durationMinutes: number;
      sharedWith: string[] | null;
      background: boolean;
    }) => {
      const share = await api.location.startSharing({
        params: { householdId },
        body: { durationMinutes: input.durationMinutes, sharedWith: input.sharedWith },
      });
      let background = false;
      await saveSession({ householdId, until: share.until, background: false });
      if (input.background) {
        background = await startBackgroundUpdates({
          title: t('m.location.serviceTitle'),
          body: t('m.location.serviceBody'),
        });
        await saveSession({ householdId, until: share.until, background });
      }
      return { share, background };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['location'] }),
  });
}

export function useStopSharing() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await stopBackgroundUpdates();
      await clearSession();
      return api.location.stopSharing({ params: { householdId } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['location'] }),
  });
}

export type PingStatus = 'idle' | 'waiting' | 'sending' | 'denied' | 'unavailable';

/**
 * While `active` (sharing on, app in the foreground), watches the device position and posts
 * throttled pings. Geofence events from the API are shown as a notice.
 */
export function useForegroundPings(active: boolean): {
  status: PingStatus;
  lastSentAt: Date | null;
  lastFix: LatLng | null;
} {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PingStatus>('waiting');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [lastFix, setLastFix] = useState<LatLng | null>(null);
  const last = useRef<(LatLng & { at: number }) | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) return;
    // Object so the async callbacks see updates made by the cleanup.
    const run = { cancelled: false };
    const isCancelled = () => run.cancelled;
    let subscription: Location.LocationSubscription | null = null;

    const send = async (pos: Location.LocationObject) => {
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLastFix(fix);
      const now = Date.now();
      if (!shouldSendPing(last.current, fix, now) || inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await api.location.ping({
          params: { householdId },
          body: {
            ...fix,
            accuracyM: clampAccuracy(pos.coords.accuracy),
            at: new Date(Math.min(pos.timestamp, now)).toISOString(),
          },
        });
        if (isCancelled()) return;
        last.current = { ...fix, at: now };
        setLastSentAt(new Date(now));
        setStatus('sending');
        for (const ev of res.events)
          notify(
            ev.event === 'arrived'
              ? t('m.location.arrived', { place: ev.placeName })
              : t('m.location.left', { place: ev.placeName }),
          );
        void queryClient.invalidateQueries({ queryKey: ['location', 'latest'] });
      } catch (e) {
        if (e instanceof ApiError && [400, 403, 409].includes(e.status))
          void queryClient.invalidateQueries({ queryKey: ['location'] });
      } finally {
        inFlight.current = false;
      }
    };

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (isCancelled()) return;
        if (!permission.granted) {
          setStatus('denied');
          return;
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 25 },
          (pos) => void send(pos),
          () => {
            setStatus('unavailable');
          },
        );
        if (isCancelled()) subscription.remove();
      } catch {
        if (!isCancelled()) setStatus('unavailable');
      }
    })();

    return () => {
      run.cancelled = true;
      subscription?.remove();
      last.current = null;
      setStatus('waiting');
    };
  }, [active, householdId, queryClient, t]);

  return { status: active ? status : 'idle', lastSentAt, lastFix };
}

/**
 * Keeps device state consistent with the server: stops the background task and drops the
 * persisted session when sharing ended (expired or stopped on another device).
 */
export function useSharingSessionSync(): { backgroundRunning: boolean } {
  const share = useMyShare();
  const sharing = useIsSharing();
  const [backgroundRunning, setBackgroundRunning] = useState(false);
  useEffect(() => {
    if (share.isPending || share.isError) return;
    void (async () => {
      if (!sharing) {
        const session = await loadSession();
        if (session) {
          await stopBackgroundUpdates();
          await clearSession();
        }
      }
      setBackgroundRunning(await backgroundUpdatesRunning());
    })();
  }, [sharing, share.isPending, share.isError, share.dataUpdatedAt]);
  return { backgroundRunning };
}

/** Foreground pings + session sync; mount once while the app (or the location section) is open. */
export function useLocationSharing() {
  const sharing = useIsSharing();
  const { backgroundRunning } = useSharingSessionSync();
  const pings = useForegroundPings(sharing);
  return { sharing, backgroundRunning, ...pings };
}

/** One-shot current position (for "use my position" when adding a place). */
export async function currentPosition(): Promise<LatLng | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Last 24 hours of a member who shares with me (oldest first for drawing). */
export function useLocationHistory(memberId: string) {
  const { householdId } = useHousehold();
  return useQuery({
    ...apiQuery(api, 'location', 'history', { params: { householdId, memberId } }),
    refetchInterval: 60_000,
    select: (points) => [...points].sort((a, b) => a.at.localeCompare(b.at)),
  });
}

/** My arrival/departure subscriptions. */
export function usePlaceSubscriptions() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['location', 'subscriptions', { householdId }],
    queryFn: () => api.location.subscriptions.list({ params: { householdId } }),
  });
}

export function useSubscriptionMutations() {
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: ['location', 'subscriptions'] });
  const subscribe = useMutation({
    mutationFn: (input: { placeId: string; targetMemberId: string | null }) =>
      api.location.subscriptions.create({
        params: { householdId, placeId: input.placeId },
        body: { targetMemberId: input.targetMemberId },
      }),
    onSettled: settle,
  });
  const unsubscribe = useMutation({
    mutationFn: (subscriptionId: string) =>
      api.location.subscriptions.remove({ params: { householdId, subscriptionId } }),
    onSettled: settle,
  });
  return { subscribe, unsubscribe };
}
