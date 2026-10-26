'use client';

import { connectRealtime, invalidationKeys } from '@fp/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_URL } from '@/lib/env';

/** Joins the household's Socket.IO room and invalidates affected queries on every change event. */
export function useRealtime(householdId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    let connectedBefore = false;
    const connection = connectRealtime({
      url: API_URL,
      onEntityChanged: (change) => {
        if (change.householdId !== householdId) return;
        for (const queryKey of invalidationKeys(change))
          void queryClient.invalidateQueries({ queryKey });
      },
      onNotification: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      onConnectionChange: (connected) => {
        if (!connected) return;
        // Catch up on anything missed while disconnected.
        if (connectedBefore) void queryClient.invalidateQueries();
        connectedBefore = true;
      },
    });
    connection.subscribe(householdId);
    return () => connection.close();
  }, [householdId, queryClient]);
}
