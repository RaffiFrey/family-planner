import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';

interface ConnectivityState {
  /** False after a request failed at the network level, until the API answers again. */
  online: boolean;
  realtimeConnected: boolean;
  setOnline: (online: boolean) => void;
  setRealtimeConnected: (connected: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>((set, get) => ({
  online: true,
  realtimeConnected: false,
  setOnline: (online) => {
    if (get().online === online) return;
    set({ online });
    onlineManager.setOnline(online);
  },
  setRealtimeConnected: (realtimeConnected) => {
    set({ realtimeConnected });
    if (realtimeConnected) get().setOnline(true);
  },
}));

/** True for fetch failures that mean "no connection" rather than an HTTP error. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && /network|fetch|connect|timed? ?out/i.test(e.message);
}

/** fetch that records connectivity as a side effect. */
export const trackedFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    useConnectivity.getState().setOnline(true);
    return res;
  } catch (e) {
    if (isNetworkError(e)) useConnectivity.getState().setOnline(false);
    throw e;
  }
};
