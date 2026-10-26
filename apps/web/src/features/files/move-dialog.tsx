'use client';

import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { FolderIcon } from './file-icon';

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  /** When moving a folder: it cannot be moved into itself. */
  excludeFolderId?: string;
  startFolderId: string | null;
  loading?: boolean;
  onMove: (targetFolderId: string | null) => void;
}

export function MoveDialog({
  open,
  onOpenChange,
  itemName,
  excludeFolderId,
  startFolderId,
  loading,
  onMove,
}: MoveDialogProps) {
  const t = useTranslations('files');
  const { householdId } = useHousehold();
  const [current, setCurrent] = React.useState<string | null>(startFolderId);

  const query = useQuery({
    ...apiQuery(api, 'storage', 'browse', {
      params: { householdId },
      query: current ? { folderId: current } : {},
    }),
    enabled: open,
  });

  const handleOpenChange = (next: boolean) => {
    if (next) setCurrent(startFolderId);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('moveTo')}</DialogTitle>
          <DialogDescription>{itemName}</DialogDescription>
        </DialogHeader>
        <nav aria-label={t('breadcrumbs')}>
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              <button
                type="button"
                className="rounded px-1 hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => setCurrent(null)}
              >
                {t('root')}
              </button>
            </li>
            {query.data?.breadcrumbs.map((b) => (
              <li key={b.id} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-muted" aria-hidden />
                <button
                  type="button"
                  className="rounded px-1 hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  onClick={() => setCurrent(b.id)}
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-h-72 min-h-32 overflow-y-auto rounded-md border border-border p-1">
          {query.isPending ? (
            <LoadingState rows={3} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.data.folders.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">{t('empty')}</p>
          ) : (
            <ul>
              {query.data.folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={f.id === excludeFolderId}
                    onClick={() => setCurrent(f.id)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                  >
                    <FolderIcon className="size-4 text-primary" />
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button loading={loading} disabled={query.isPending} onClick={() => onMove(current)}>
            {t('moveHere')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
