import { createContext, type ReactNode, use } from 'react';
import { type PingStatus, useLocationSharing } from './hooks';
import type { LatLng } from './share';

interface SharingState {
  sharing: boolean;
  backgroundRunning: boolean;
  status: PingStatus;
  lastSentAt: Date | null;
  lastFix: LatLng | null;
}

const SharingContext = createContext<SharingState | null>(null);

/**
 * Runs the foreground location pings exactly once for everything below it.
 * Mounted by the location stack; can also be mounted app-wide (inside HouseholdProvider).
 */
export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const parent = use(SharingContext);
  if (parent) return <>{children}</>;
  return <Runner>{children}</Runner>;
}

function Runner({ children }: { children: ReactNode }) {
  const state = useLocationSharing();
  return <SharingContext value={state}>{children}</SharingContext>;
}

export function useSharingState(): SharingState {
  const ctx = use(SharingContext);
  if (!ctx) throw new Error('useSharingState must be used inside LocationSharingProvider');
  return ctx;
}
