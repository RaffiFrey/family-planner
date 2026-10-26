'use client';

import { ApiError } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { Film, ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/misc';
import { useHousehold } from '@/features/household/household-context';
import { fileUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';

/**
 * Signed download URLs expire, so they are cached briefly under their own key (not under
 * `photos`, which would refetch every image on each realtime change).
 */
export function useFileUrl(fileId: string | null, variant: 'thumb' | 'full', mimeType = 'image/') {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['fileUrl', householdId, fileId, variant],
    enabled: fileId !== null,
    staleTime: 4 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const id = fileId as string;
      if (variant === 'full') return fileUrl(householdId, id, false);
      try {
        return await fileUrl(householdId, id, true);
      } catch (err) {
        // No thumbnail (yet): images fall back to the original, videos to an icon.
        if (err instanceof ApiError && err.status === 404 && mimeType.startsWith('image/'))
          return fileUrl(householdId, id, false);
        throw err;
      }
    },
  });
}

export function PhotoThumb({
  fileId,
  mimeType,
  alt,
  className,
}: {
  fileId: string | null;
  mimeType?: string;
  alt: string;
  className?: string;
}) {
  const t = useTranslations('photos');
  const isVideo = mimeType?.startsWith('video/') ?? false;
  const url = useFileUrl(fileId, 'thumb', mimeType ?? 'image/');
  if (fileId === null || url.isError) {
    return (
      <div
        className={cn('flex items-center justify-center bg-surface-muted text-muted', className)}
        role="img"
        aria-label={alt}
      >
        {isVideo ? (
          <Film className="size-8" aria-hidden />
        ) : (
          <ImageOff className="size-8" aria-hidden />
        )}
      </div>
    );
  }
  if (url.isPending) {
    return (
      <div className={cn('relative', className)}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="sr-only">{t('loadingImage')}</span>
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden bg-surface-muted', className)}>
      {/* Signed object-storage URLs: next/image optimization does not apply. */}
      <img src={url.data} alt={alt} loading="lazy" className="size-full object-cover" />
      {isVideo ? (
        <Film className="absolute right-1.5 bottom-1.5 size-5 text-white drop-shadow" aria-hidden />
      ) : null}
    </div>
  );
}
