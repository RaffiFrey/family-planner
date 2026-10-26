import { connectRealtime, invalidationKeys } from '@fp/api-client';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { sessionCookie } from './auth-client';
import { useConnectivity } from './connectivity';
import { API_URL } from './env';

/** Refetch stale queries when the app returns to the foreground (TanStack's "window focus"). */
export function useAppFocusManager(): void {
  useEffect(() => {
    focusManager.setEventListener((handleFocus) => {
      const sub = AppState.addEventListener('change', (state) => {
        handleFocus(state === 'active');
      });
      return () => {
        sub.remove();
      };
    });
  }, []);
}

/**
 * While offline, ping the health endpoint so we notice when the API is reachable again
 * (paused queries and mutations then resume automatically).
 */
export function useConnectivityMonitor(): void {
  const online = useConnectivity((s) => s.online);
  useEffect(() => {
    if (online) return;
    let stopped = false;
    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/health`, { method: 'GET' });
        if (!stopped && res.status < 500) useConnectivity.getState().setOnline(true);
      } catch {
        // still offline
      }
    };
    const timer = setInterval(() => void ping(), 10_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ping();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [online]);
}

/** Socket.IO connection for the active household; change events invalidate the matching queries. */
export function useRealtime(householdId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let closed = false;
    let close: (() => void) | undefined;
    void sessionCookie().then((cookie) => {
      if (closed) return;
      const connection = connectRealtime({
        url: API_URL,
        ...(cookie ? { headers: { cookie } } : {}),
        onEntityChanged: (change) => {
          if (change.householdId !== householdId && change.entity !== 'notification') return;
          for (const key of invalidationKeys(change))
            void queryClient.invalidateQueries({ queryKey: key });
        },
        onNotification: () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
        onConnectionChange: (connected) => {
          useConnectivity.getState().setRealtimeConnected(connected);
        },
      });
      connection.subscribe(householdId);
      close = connection.close;
    });
    return () => {
      closed = true;
      close?.();
      useConnectivity.getState().setRealtimeConnected(false);
    };
  }, [householdId, queryClient]);
}
