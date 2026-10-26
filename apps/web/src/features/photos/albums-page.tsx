'use client';

import { apiQuery } from '@fp/api-client';
import type { Album } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { History, Images, Lock, Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { AlbumDialog } from './album-dialog';
import { PhotoThumb } from './photo-thumb';

export function AlbumsPage() {
  return (
    <ModuleGate action="photos.read">
      <AlbumsInner />
    </ModuleGate>
  );
}

function AlbumsInner() {
  const t = useTranslations('photos');
  const { householdId, can } = useHousehold();
  const canWrite = can('photos.write');
  const [creating, setCreating] = React.useState(false);
  const query = useQuery(apiQuery(api, 'photos', 'list', { params: { householdId } }));

  const addButton = canWrite ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} actions={addButton} />
      <Memories />
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<Images />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {query.data.map((album) => (
            <li key={album.id}>
              <AlbumCard album={album} />
            </li>
          ))}
        </ul>
      )}
      <AlbumDialog open={creating} onOpenChange={setCreating} album={null} />
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const t = useTranslations('photos');
  const tv = useTranslations('visibility');
  return (
    <Card className="relative overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-primary hover:bg-surface-muted/50">
      <PhotoThumb fileId={album.coverFileId} alt="" className="aspect-[4/3] w-full" />
      <div className="p-3">
        <h2 className="truncate font-medium">
          <Link href={`/photos/${album.id}`} className="outline-none after:absolute after:inset-0">
            {album.title}
          </Link>
        </h2>
        <p className="flex items-center gap-1 text-xs text-muted">
          {t('items', { count: album.itemCount })}
          {album.visibility !== 'household' ? (
            <span className="inline-flex items-center gap-1" title={tv(album.visibility)}>
              ·{' '}
              {album.visibility === 'private' ? (
                <Lock className="size-3" aria-hidden />
              ) : (
                <Users className="size-3" aria-hidden />
              )}
              <span className="sr-only">{tv(album.visibility)}</span>
            </span>
          ) : null}
        </p>
      </div>
    </Card>
  );
}

function Memories() {
  const t = useTranslations('photos.memories');
  const { householdId } = useHousehold();
  const query = useQuery(apiQuery(api, 'photos', 'memories', { params: { householdId } }));
  if (query.isPending || query.isError) return null;
  const memories = query.data.filter((m) => m.items.length > 0);
  if (memories.length === 0) return null;
  return (
    <section aria-labelledby="memories-heading" className="mb-6">
      <h2 id="memories-heading" className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <History className="size-5 text-primary" aria-hidden />
        {t('title')}
      </h2>
      <div className="grid gap-3">
        {memories.map((m) => (
          <div key={m.year}>
            <h3 className="mb-1 text-sm font-medium text-muted">
              {t('yearsAgo', { count: m.yearsAgo })} · {m.year}
            </h3>
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {m.items.map((item) => (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={`/photos/${item.albumId}`}
                    className="block overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <PhotoThumb
                      fileId={item.fileId}
                      mimeType={item.mimeType}
                      alt={item.caption ?? item.fileName}
                      className="size-28"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
