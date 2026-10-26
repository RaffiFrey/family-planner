import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@fp/api-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep data long enough to be persisted and shown offline.
      gcTime: 7 * DAY,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return count < 2;
      },
    },
  },
});

/**
 * The query cache is persisted to AsyncStorage so the app opens with data offline.
 * (MMKV would be faster but needs a development build; AsyncStorage also works in Expo Go.)
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'fp-query-cache-v1',
  throttleTime: 2000,
});

export const PERSIST_MAX_AGE = 7 * DAY;
/** Bump when cached shapes change incompatibly. */
export const PERSIST_BUSTER = 'v1';
