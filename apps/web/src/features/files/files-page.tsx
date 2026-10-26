'use client';

import { apiQuery } from '@fp/api-client';
import type { Folder, StoredFile } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  FolderInput,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/misc';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn, formatBytes } from '@/lib/utils';
import { FileIcon, FolderIcon } from './file-icon';
import { MoveDialog } from './move-dialog';
import { NameDialog } from './name-dialog';
import { UsageBar } from './usage-bar';
import { useUploads } from './use-uploads';

type Target = { type: 'folder'; item: Folder } | { type: 'file'; item: StoredFile };
type DialogState =
  | { kind: 'newFolder' }
  | { kind: 'rename'; target: Target }
  | { kind: 'move'; target: Target }
  | { kind: 'delete'; target: Target }
  | null;

const STATUS_VARIANT = {
  pending_upload: 'secondary',
  scanning: 'warning',
  ready: 'success',
  infected: 'danger',
  failed: 'danger',
} as const;

export function FilesPage() {
  const t = useTranslations('files');
  const tc = useTranslations('common');
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');
  const { householdId, can } = useHousehold();
  const canWrite = can('storage.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const { items: uploads, upload, clearFinished } = useUploads(folderId);

  const browse = useQuery(
    apiQuery(api, 'storage', 'browse', {
      params: { householdId },
      query: folderId ? { folderId } : {},
    }),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['storage'] });
  const close = () => setDialog(null);

  const createFolder = useMutation({
    mutationFn: (name: string) =>
      api.storage.createFolder({ params: { householdId }, body: { name, parentId: folderId } }),
    onSuccess: () => {
      close();
      return invalidate();
    },
    onError: toastError,
  });

  const updateTarget = useMutation({
    mutationFn: async ({
      target,
      name,
      parentId,
    }: {
      target: Target;
      name?: string;
      parentId?: string | null;
    }) => {
      if (target.type === 'folder') {
        await api.storage.updateFolder({
          params: { householdId, folderId: target.item.id },
          body: { ...(name ? { name } : {}), ...(parentId !== undefined ? { parentId } : {}) },
        });
      } else {
        await api.storage.updateFile({
          params: { householdId, fileId: target.item.id },
          body: {
            ...(name ? { name } : {}),
            ...(parentId !== undefined ? { folderId: parentId } : {}),
          },
        });
      }
    },
    onSuccess: () => {
      close();
      return invalidate();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (target: Target) =>
      target.type === 'folder'
        ? api.storage.deleteFolder({ params: { householdId, folderId: target.item.id } })
        : api.storage.deleteFile({ params: { householdId, fileId: target.item.id } }),
    onSuccess: () => {
      close();
      return invalidate();
    },
    onError: toastError,
  });

  const download = useMutation({
    mutationFn: (file: StoredFile) =>
      api.storage.download({ params: { householdId, fileId: file.id } }),
    onSuccess: (link) => {
      window.open(link.url, '_blank', 'noopener');
    },
    onError: toastError,
  });

  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void upload(Array.from(list));
  };

  const dropProps = canWrite
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (e.currentTarget === e.target) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        },
      }
    : {};

  const targetName = dialog && dialog.kind !== 'newFolder' ? dialog.target.item.name : '';

  return (
    <div {...dropProps} className="relative">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setDialog({ kind: 'newFolder' })}>
                <FolderPlus aria-hidden />
                {t('newFolder')}
              </Button>
              <Button onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden />
                {t('upload')}
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          ) : null
        }
      />

      <UsageBar className="mb-4" />

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-lg font-medium text-primary">
          {t('dropActive')}
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <section
          aria-label={t('uploading')}
          className="mb-4 rounded-lg border border-border bg-surface p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('uploading')}</h2>
            <Button variant="ghost" size="icon-sm" aria-label={tc('close')} onClick={clearFinished}>
              <X aria-hidden />
            </Button>
          </div>
          <ul className="grid gap-2">
            {uploads.map((u) => (
              <li key={u.key} className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{u.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      u.status === 'error' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {u.status === 'done'
                      ? t('uploadDone')
                      : u.status === 'error'
                        ? t('uploadFailed')
                        : `${u.progress}%`}
                  </span>
                </div>
                <Progress
                  value={u.progress}
                  tone={u.status === 'error' ? 'exceeded' : u.status === 'done' ? 'ok' : 'default'}
                  aria-label={u.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {browse.isPending ? (
        <LoadingState rows={5} />
      ) : browse.isError ? (
        <ErrorState error={browse.error} onRetry={() => void browse.refetch()} />
      ) : (
        <>
          <nav aria-label={t('breadcrumbs')} className="mb-3">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              <li>
                {browse.data.breadcrumbs.length === 0 ? (
                  <span aria-current="page" className="font-medium">
                    {t('root')}
                  </span>
                ) : (
                  <Link href="/files" className="text-primary hover:underline">
                    {t('root')}
                  </Link>
                )}
              </li>
              {browse.data.breadcrumbs.map((b, i) => {
                const last = i === browse.data.breadcrumbs.length - 1;
                return (
                  <li key={b.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3 text-muted" aria-hidden />
                    {last ? (
                      <span aria-current="page" className="font-medium">
                        {b.name}
                      </span>
                    ) : (
                      <Link href={`/files?folder=${b.id}`} className="text-primary hover:underline">
                        {b.name}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {browse.data.folders.length === 0 && browse.data.files.length === 0 ? (
            <EmptyState
              title={t('empty')}
              description={canWrite ? t('emptyHint') : undefined}
              action={
                canWrite ? (
                  <p className="text-sm text-muted">
                    {t('dropHere')}{' '}
                    <Button variant="link" onClick={() => fileInput.current?.click()}>
                      {t('chooseFiles')}
                    </Button>
                  </p>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {browse.data.folders.map((f) => (
                <ItemRow
                  key={f.id}
                  icon={<FolderIcon />}
                  name={
                    <Link
                      href={`/files?folder=${f.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {f.name}
                    </Link>
                  }
                  meta={t('folder')}
                  actions={
                    canWrite ? (
                      <RowActions
                        name={f.name}
                        onRename={() =>
                          setDialog({ kind: 'rename', target: { type: 'folder', item: f } })
                        }
                        onMove={() =>
                          setDialog({ kind: 'move', target: { type: 'folder', item: f } })
                        }
                        onDelete={() =>
                          setDialog({ kind: 'delete', target: { type: 'folder', item: f } })
                        }
                      />
                    ) : null
                  }
                />
              ))}
              {browse.data.files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  canWrite={canWrite}
                  onDownload={() => download.mutate(f)}
                  onRename={() => setDialog({ kind: 'rename', target: { type: 'file', item: f } })}
                  onMove={() => setDialog({ kind: 'move', target: { type: 'file', item: f } })}
                  onDelete={() => setDialog({ kind: 'delete', target: { type: 'file', item: f } })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <NameDialog
        open={dialog?.kind === 'newFolder'}
        onOpenChange={(o) => !o && close()}
        title={t('newFolder')}
        label={t('folderName')}
        submitLabel={tc('create')}
        loading={createFolder.isPending}
        onSubmit={(name) => createFolder.mutate(name)}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        onOpenChange={(o) => !o && close()}
        title={t('rename')}
        label={t('name')}
        initialValue={targetName}
        submitLabel={tc('save')}
        loading={updateTarget.isPending}
        onSubmit={(name) =>
          dialog?.kind === 'rename' && updateTarget.mutate({ target: dialog.target, name })
        }
      />
      <MoveDialog
        open={dialog?.kind === 'move'}
        onOpenChange={(o) => !o && close()}
        itemName={targetName}
        excludeFolderId={
          dialog?.kind === 'move' && dialog.target.type === 'folder'
            ? dialog.target.item.id
            : undefined
        }
        startFolderId={folderId}
        loading={updateTarget.isPending}
        onMove={(parentId) =>
          dialog?.kind === 'move' && updateTarget.mutate({ target: dialog.target, parentId })
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(o) => !o && close()}
        title={
          dialog?.kind === 'delete' && dialog.target.type === 'folder'
            ? t('deleteFolderTitle', { name: targetName })
            : t('deleteFileTitle', { name: targetName })
        }
        description={
          dialog?.kind === 'delete' && dialog.target.type === 'folder'
            ? t('deleteFolderBody')
            : t('deleteFileBody')
        }
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => dialog?.kind === 'delete' && remove.mutate(dialog.target)}
      />
    </div>
  );
}

function ItemRow({
  icon,
  name,
  meta,
  badge,
  actions,
}: {
  icon: React.ReactNode;
  name: React.ReactNode;
  meta: React.ReactNode;
  badge?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2">
      <span className="shrink-0">{icon}</span>
      <div className="grid min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {name}
          {badge}
        </div>
        <span className="truncate text-xs text-muted">{meta}</span>
      </div>
      {actions}
    </li>
  );
}

function FileRow({
  file,
  canWrite,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  file: StoredFile;
  canWrite: boolean;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('files');
  const locale = useLocale();
  const fmt = useFormat();
  const ready = file.status === 'ready';
  return (
    <ItemRow
      icon={<FileIcon mime={file.mimeType} />}
      name={
        ready ? (
          <button
            type="button"
            onClick={onDownload}
            className="truncate text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {file.name}
          </button>
        ) : (
          <span className="truncate font-medium">{file.name}</span>
        )
      }
      badge={
        ready ? null : (
          <Badge variant={STATUS_VARIANT[file.status]}>{t(`status.${file.status}`)}</Badge>
        )
      }
      meta={`${formatBytes(file.sizeBytes, locale)} · ${fmt.date(file.createdAt)}`}
      actions={
        <RowActions
          name={file.name}
          onDownload={ready ? onDownload : undefined}
          onRename={canWrite ? onRename : undefined}
          onMove={canWrite ? onMove : undefined}
          onDelete={canWrite ? onDelete : undefined}
        />
      }
    />
  );
}

function RowActions({
  name,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  name: string;
  onDownload?: (() => void) | undefined;
  onRename?: (() => void) | undefined;
  onMove?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}) {
  const t = useTranslations('files');
  const tc = useTranslations('common');
  if (!onDownload && !onRename && !onMove && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('itemActions', { name })}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onDownload ? (
          <DropdownMenuItem onSelect={onDownload}>
            <Download aria-hidden />
            {t('download')}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil aria-hidden />
            {t('rename')}
          </DropdownMenuItem>
        ) : null}
        {onMove ? (
          <DropdownMenuItem onSelect={onMove}>
            <FolderInput aria-hidden />
            {t('move')}
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden />
              {tc('delete')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
