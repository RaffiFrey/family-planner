import { ApiError, apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';

export function useAlbums() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'photos', 'list', { params: { householdId } }));
}

export function useAlbum(albumId: string) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'photos', 'get', { params: { householdId, albumId } }));
}

export function useMemories() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'photos', 'memories', { params: { householdId } }));
}

/**
 * Short-lived signed URL of a file (thumbnail falls back to the original for images).
 * Cached briefly under its own key so realtime `photos` invalidations don't refetch every image.
 */
export function useFileUrl(fileId: string | null, variant: 'thumb' | 'full') {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['fileUrl', householdId, fileId, variant],
    enabled: fileId !== null,
    staleTime: 4 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const id = fileId as string;
      const get = (thumbnail: boolean) =>
        api.storage
          .download({
            params: { householdId, fileId: id },
            query: { thumbnail: thumbnail ? 'true' : 'false' },
          })
          .then((l) => l.url);
      if (variant === 'full') return get(false);
      try {
        return await get(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return get(false);
        throw err;
      }
    },
  });
}
