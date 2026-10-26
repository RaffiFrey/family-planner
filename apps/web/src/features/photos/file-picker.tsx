'use client';

import { apiQuery } from '@fp/api-client';
import type { StoredFile } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, FileText, Folder } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import { cn, formatBytes } from '@/lib/utils';
import { PhotoThumb } from './photo-thumb';

export const isMedia = (f: Pick<StoredFile, 'mimeType'>) => /^(image|video)\//.test(f.mimeType);

/**
 * Browse household storage and pick ready files. Mounted content resets on every open.
 * `filter` limits which files are offered (e.g. images and videos only).
 */
export function FilePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  emptyLabel,
  confirmLabel,
  filter,
  exclude = [],
  multiple = true,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  emptyLabel: string;
  confirmLabel: (count: number) => string;
  filter?: (file: StoredFile) => boolean;
  exclude?: readonly string[];
  multiple?: boolean;
  loading?: boolean;
  onConfirm: (files: StoredFile[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PickerBody
          emptyLabel={emptyLabel}
          confirmLabel={confirmLabel}
          filter={filter}
          exclude={exclude}
          multiple={multiple}
          loading={loading}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  emptyLabel,
  confirmLabel,
  filter,
  exclude,
  multiple,
  loading,
  onCancel,
  onConfirm,
}: {
  emptyLabel: string;
  confirmLabel: (count: number) => string;
  filter: ((file: StoredFile) => boolean) | undefined;
  exclude: readonly string[];
  multiple: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (files: StoredFile[]) => void;
}) {
  const t = useTranslations('photos');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const [folderId, setFolderId] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<Map<string, StoredFile>>(new Map());
  const query = useQuery(
    apiQuery(api, 'storage', 'browse', {
      params: { householdId },
      query: folderId ? { folderId } : {},
    }),
  );

  const toggle = (file: StoredFile) =>
    setSelected((prev) => {
      const next = new Map(multiple ? prev : []);
      if (prev.has(file.id)) next.delete(file.id);
      else next.set(file.id, file);
      return next;
    });

  const files = (query.data?.files ?? []).filter(
    (f) => f.status === 'ready' && !exclude.includes(f.id) && (!filter || filter(f)),
  );

  return (
    <div className="grid gap-3">
      <nav aria-label={t('rootFolder')} className="flex flex-wrap items-center gap-1 text-sm">
        <Button variant="link" size="sm" onClick={() => setFolderId(undefined)}>
          {t('rootFolder')}
        </Button>
        {query.data?.breadcrumbs.map((b) => (
          <React.Fragment key={b.id}>
            <ChevronRight className="size-3 text-muted" aria-hidden />
            <Button variant="link" size="sm" onClick={() => setFolderId(b.id)}>
              {b.name}
            </Button>
          </React.Fragment>
        ))}
      </nav>
      <div className="max-h-[50dvh] min-h-40 overflow-y-auto">
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.folders.length === 0 && files.length === 0 ? (
          <EmptyState title={emptyLabel} />
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {query.data.folders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setFolderId(f.id)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-border p-2 text-xs outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Folder className="size-8 text-primary" aria-hidden />
                  <span className="line-clamp-2 break-all">{f.name}</span>
                </button>
              </li>
            ))}
            {files.map((f) => {
              const active = selected.has(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(f)}
                    title={`${f.name} · ${formatBytes(f.sizeBytes, locale)}`}
                    className={cn(
                      'relative block aspect-square w-full overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active ? 'border-primary' : 'border-transparent',
                    )}
                  >
                    {isMedia(f) ? (
                      <PhotoThumb
                        fileId={f.id}
                        mimeType={f.mimeType}
                        alt={f.name}
                        className="size-full"
                      />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-1 bg-surface-muted p-2 text-xs">
                        <FileText className="size-8 text-muted" aria-hidden />
                        <span className="line-clamp-2 break-all">{f.name}</span>
                      </span>
                    )}
                    {active ? (
                      <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" aria-hidden />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {tc('cancel')}
        </Button>
        <Button
          disabled={selected.size === 0}
          loading={loading}
          onClick={() => onConfirm([...selected.values()])}
        >
          {confirmLabel(selected.size)}
        </Button>
      </DialogFooter>
    </div>
  );
}
