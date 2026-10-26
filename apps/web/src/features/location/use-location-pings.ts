'use client';

import { ApiError } from '@fp/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export type GeoStatus = 'idle' | 'waiting' | 'sending' | 'denied' | 'unsupported';

const MIN_INTERVAL_MS = 60_000;
const MIN_MOVE_M = 50;

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Posts browser geolocation fixes while `active` (= sharing is on and the page is open).
 * Throttled to one ping per minute unless the position moved noticeably.
 */
export function useLocationPings(householdId: string, active: boolean) {
  const t = useTranslations('location.share');
  const queryClient = useQueryClient();
  const [denied, setDenied] = React.useState(false);
  const [lastSentAt, setLastSentAt] = React.useState<Date | null>(null);
  const [lastFix, setLastFix] = React.useState<{ lat: number; lng: number } | null>(null);
  const last = React.useRef<{ lat: number; lng: number; at: number } | null>(null);
  const inFlight = React.useRef(false);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  React.useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;

    const send = async (pos: GeolocationPosition) => {
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLastFix(fix);
      const now = Date.now();
      const prev = last.current;
      if (prev && now - prev.at < MIN_INTERVAL_MS && distanceM(prev, fix) < MIN_MOVE_M) return;
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await api.location.ping({
          params: { householdId },
          body: {
            lat: fix.lat,
            lng: fix.lng,
            accuracyM: Math.min(100_000, Math.max(0, pos.coords.accuracy)),
            at: new Date(Math.min(pos.timestamp, now)).toISOString(),
          },
        });
        if (cancelled) return;
        last.current = { ...fix, at: now };
        setLastSentAt(new Date(now));
        for (const ev of res.events)
          toast.info(t(ev.event === 'arrived' ? 'arrived' : 'left', { place: ev.placeName }));
        void queryClient.invalidateQueries({ queryKey: ['location'] });
      } catch (err) {
        // Sharing ended elsewhere (expired / stopped on another device).
        if (
          err instanceof ApiError &&
          (err.status === 409 || err.status === 403 || err.status === 400)
        )
          void queryClient.invalidateQueries({ queryKey: ['location'] });
      } finally {
        inFlight.current = false;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => void send(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      last.current = null;
      setDenied(false);
      setLastSentAt(null);
    };
  }, [active, supported, householdId, queryClient, t]);

  const status: GeoStatus = !active
    ? 'idle'
    : !supported
      ? 'unsupported'
      : denied
        ? 'denied'
        : lastSentAt
          ? 'sending'
          : 'waiting';

  return { status, lastSentAt, lastFix };
}

/** One-shot current position (for "use my position" in the place dialog). */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  });
}
