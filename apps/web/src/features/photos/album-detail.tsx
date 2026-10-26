'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { ApiError, apiQuery, type Output } from '@fp/api-client';
import type { AlbumItem, StoredFile } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImagePlus,
  Images,
  MoreVertical,
  Pencil,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { uploadToStorage } from '@/lib/upload';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { AlbumDialog } from './album-dialog';
import { FilePickerDialog, isMedia } from './file-picker';
import { PhotoThumb, useFileUrl } from './photo-thumb';
import { waitUntilReady } from './wait-ready';

type Detail = Output<'photos', 'get'>;

export function AlbumDetail({ albumId }: { albumId: string }) {
  return (
    <ModuleGate action="photos.read">
      <AlbumDetailInner albumId={albumId} />
    </ModuleGate>
  );
}

function AlbumDetailInner({ albumId }: { albumId: string }) {
  const t = useTranslations('photos');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { householdId, can } = useHousehold();
  const canWrite = can('photos.write');
  const detailQuery = apiQuery(api, 'photos', 'get', { params: { householdId, albumId } });
  const query = useQuery(detailQuery);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [reordering, setReordering] = React.useState(false);
  const [viewIndex, setViewIndex] = React.useState<number | null>(null);
  const [upload, setUpload] = React.useState<{ done: number; total: number } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['photos'] });

  const addItems = useMutation({
    mutationFn: (fileIds: string[]) =>
      api.photos.addItems({
        params: { householdId, albumId },
        body: { items: fileIds.map((fileId) => ({ fileId, caption: null, takenAt: null })) },
      }),
    onSuccess: async (items) => {
      setPicking(false);
      toast.success(t('uploaded', { count: items.length }));
      await invalidate();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: () => api.photos.remove({ params: { householdId, albumId } }),
    onSuccess: async () => {
      toast.success(t('deleted'));
      router.push('/photos');
      await invalidate();
    },
    onError: toastError,
  });

  const reorder = useMutation({
    mutationFn: (itemIds: string[]) =>
      api.photos.reorder({ params: { householdId, albumId }, body: { itemIds } }),
    onMutate: async (itemIds) => {
      await queryClient.cancelQueries({ queryKey: detailQuery.queryKey });
      const prev = queryClient.getQueryData<Detail>(detailQuery.queryKey);
      queryClient.setQueryData<Detail>(detailQuery.queryKey, (old) => {
        if (!old) return old;
        const byId = new Map(old.items.map((i) => [i.id, i]));
        return {
          ...old,
          items: itemIds.map((id) => byId.get(id)).filter((i): i is AlbumItem => Boolean(i)),
        };
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(detailQuery.queryKey, ctx.prev);
      toastError(err);
    },
    onSettled: () => invalidate(),
  });

  const onFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.size > 0);
    if (files.length === 0) return;
    setUpload({ done: 0, total: files.length });
    const ids: string[] = [];
    for (const file of files) {
      try {
        const stored = await uploadToStorage(householdId, file);
        ids.push(stored.id);
      } catch (err) {
        toastError(err);
      }
      setUpload((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    try {
      if (ids.length > 0) {
        const ready = await waitUntilReady(householdId, ids);
        if (ready.length > 0) await addItems.mutateAsync(ready);
        if (ready.length < ids.length) toast.info(t('processing'));
      }
    } catch {
      // addItems already reported the error.
    } finally {
      setUpload(null);
      await queryClient.invalidateQueries({ queryKey: ['storage'] });
    }
  };

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title={t('notFound')}
          action={
            <Button asChild variant="secondary">
              <Link href="/photos">{t('back')}</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const album = query.data;
  const items = album.items;

  return (
    <div>
      <Link
        href="/photos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>
      <PageHeader
        title={album.title}
        description={
          <>
            {album.description ? <span className="block">{album.description}</span> : null}
            <span>{t('items', { count: items.length })}</span>
          </>
        }
        actions={
          canWrite ? (
            <>
              {reordering ? (
                <Button onClick={() => setReordering(false)}>
                  <Check aria-hidden />
                  {t('reorderDone')}
                </Button>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      void onFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    onClick={() => fileInput.current?.click()}
                    loading={upload !== null}
                    disabled={upload !== null}
                  >
                    <Upload aria-hidden />
                    {upload
                      ? t('uploading', { done: upload.done, total: upload.total })
                      : t('upload')}
                  </Button>
                  <Button variant="secondary" onClick={() => setPicking(true)}>
                    <FolderOpen aria-hidden />
                    {t('fromFiles')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="icon" aria-label={tu('actions')}>
                        <MoreVertical aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={items.length < 2}
                        onSelect={() => setReordering(true)}
                      >
                        <ArrowDownUp aria-hidden />
                        {t('reorder')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing(true)}>
                        <Pencil aria-hidden />
                        {tc('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                        <Trash2 aria-hidden />
                        {tc('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </>
          ) : null
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Images />}
          title={t('albumEmpty')}
          action={
            canWrite ? (
              <Button onClick={() => setPicking(true)}>
                <ImagePlus aria-hidden />
                {t('addPhotos')}
              </Button>
            ) : null
          }
        />
      ) : reordering ? (
        <SortableGrid items={items} onReorder={(ids) => reorder.mutate(ids)} />
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setViewIndex(index)}
                aria-label={t('open', { name: item.caption ?? item.fileName })}
                className="block w-full overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PhotoThumb
                  fileId={item.fileId}
                  mimeType={item.mimeType}
                  alt=""
                  className="aspect-square w-full"
                />
              </button>
            </li>
          ))}
          {upload
            ? Array.from({ length: upload.total - upload.done }, (_, i) => (
                <li key={`pending-${i}`}>
                  <Skeleton className="aspect-square w-full" />
                </li>
              ))
            : null}
        </ul>
      )}

      <Lightbox album={album} index={viewIndex} onIndexChange={setViewIndex} canWrite={canWrite} />
      <AlbumDialog open={editing} onOpenChange={setEditing} album={album} />
      <FilePickerDialog
        open={picking}
        onOpenChange={setPicking}
        title={t('pickerTitle')}
        description={t('pickerHint')}
        emptyLabel={t('pickerEmpty')}
        confirmLabel={(count) => t('addSelected', { count })}
        filter={isMedia}
        exclude={items.map((i) => i.fileId)}
        loading={addItems.isPending}
        onConfirm={(files: StoredFile[]) => addItems.mutate(files.map((f) => f.id))}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function SortableGrid({
  items,
  onReorder,
}: {
  items: AlbumItem[];
  onReorder: (ids: string[]) => void;
}) {
  const t = useTranslations('photos');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{t('reorderHint')}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
            {items.map((item, index) => (
              <SortableTile
                key={item.id}
                item={item}
                onMoveBefore={index > 0 ? () => move(index, index - 1) : undefined}
                onMoveAfter={index < items.length - 1 ? () => move(index, index + 1) : undefined}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableTile({
  item,
  onMoveBefore,
  onMoveAfter,
}: {
  item: AlbumItem;
  onMoveBefore: (() => void) | undefined;
  onMoveAfter: (() => void) | undefined;
}) {
  const t = useTranslations('photos');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
          : undefined,
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        className="block w-full cursor-grab touch-none overflow-hidden rounded-md ring-2 ring-primary/40 outline-none focus-visible:ring-primary active:cursor-grabbing"
        aria-label={t('dragHandle', { name: item.caption ?? item.fileName })}
        {...attributes}
        {...listeners}
      >
        <PhotoThumb
          fileId={item.fileId}
          mimeType={item.mimeType}
          alt=""
          className="aspect-square w-full"
        />
      </button>
      <div className="absolute inset-x-1 bottom-1 flex justify-between">
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('moveBefore')}
          disabled={!onMoveBefore}
          onClick={onMoveBefore}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('moveAfter')}
          disabled={!onMoveAfter}
          onClick={onMoveAfter}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function Lightbox({
  album,
  index,
  onIndexChange,
  canWrite,
}: {
  album: Detail;
  index: number | null;
  onIndexChange: (i: number | null) => void;
  canWrite: boolean;
}) {
  const t = useTranslations('photos');
  const item = index !== null ? album.items[index] : undefined;
  const count = album.items.length;
  const go = React.useCallback(
    (delta: number) => {
      if (index === null || count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  return (
    <Dialog open={item !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="max-w-4xl"
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return;
          if (e.key === 'ArrowLeft') go(-1);
          if (e.key === 'ArrowRight') go(1);
        }}
      >
        {item ? (
          <LightboxBody
            key={item.id}
            album={album}
            item={item}
            canWrite={canWrite}
            onPrev={count > 1 ? () => go(-1) : undefined}
            onNext={count > 1 ? () => go(1) : undefined}
            onRemoved={() => onIndexChange(null)}
          />
        ) : (
          <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LightboxBody({
  album,
  item,
  canWrite,
  onPrev,
  onNext,
  onRemoved,
}: {
  album: Detail;
  item: AlbumItem;
  canWrite: boolean;
  onPrev: (() => void) | undefined;
  onNext: (() => void) | undefined;
  onRemoved: () => void;
}) {
  const t = useTranslations('photos');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { householdId } = useHousehold();
  const url = useFileUrl(item.fileId, 'full', item.mimeType);
  const [caption, setCaption] = React.useState(item.caption ?? '');
  const [editingCaption, setEditingCaption] = React.useState(false);
  const isVideo = item.mimeType.startsWith('video/');
  const params = { householdId, albumId: album.id, itemId: item.id };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['photos'] });

  const saveCaption = useMutation({
    mutationFn: () => api.photos.updateItem({ params, body: { caption: caption.trim() || null } }),
    onSuccess: async () => {
      setEditingCaption(false);
      await invalidate();
    },
    onError: toastError,
  });
  const setCover = useMutation({
    mutationFn: () =>
      api.photos.update({
        params: { householdId, albumId: album.id },
        body: { coverFileId: item.fileId },
      }),
    onSuccess: async () => {
      toast.success(t('coverSet'));
      await invalidate();
    },
    onError: toastError,
  });
  const removeItem = useMutation({
    mutationFn: () => api.photos.removeItem({ params }),
    onSuccess: async () => {
      toast.success(t('removed'));
      onRemoved();
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{item.caption ?? item.fileName}</DialogTitle>
        <DialogDescription>
          {item.takenAt ? fmt.dateTime(item.takenAt) : fmt.dateTime(item.createdAt)}
        </DialogDescription>
      </DialogHeader>
      <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-md bg-black">
        {url.isPending ? (
          <Skeleton className="aspect-video w-full" />
        ) : url.isError ? (
          <ErrorState error={url.error} />
        ) : isVideo ? (
          <video src={url.data} controls className="max-h-[65dvh] w-full">
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={url.data}
            alt={item.caption ?? item.fileName}
            className="max-h-[65dvh] w-auto object-contain"
          />
        )}
        {onPrev ? (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1/2 left-2 -translate-y-1/2 opacity-90"
            aria-label={t('previous')}
            onClick={onPrev}
          >
            <ChevronLeft aria-hidden />
          </Button>
        ) : null}
        {onNext ? (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1/2 right-2 -translate-y-1/2 opacity-90"
            aria-label={t('next')}
            onClick={onNext}
          >
            <ChevronRight aria-hidden />
          </Button>
        ) : null}
      </div>
      {canWrite ? (
        editingCaption ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveCaption.mutate();
            }}
          >
            <Input
              aria-label={t('caption')}
              value={caption}
              maxLength={500}
              autoFocus
              onChange={(e) => setCaption(e.target.value)}
            />
            <Button type="submit" loading={saveCaption.isPending}>
              {tc('save')}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditingCaption(true)}>
              <Pencil aria-hidden />
              {t('editCaption')}
            </Button>
            {!isVideo && album.coverFileId !== item.fileId ? (
              <Button
                variant="secondary"
                size="sm"
                loading={setCover.isPending}
                onClick={() => setCover.mutate()}
              >
                <Star aria-hidden />
                {t('setCover')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              loading={removeItem.isPending}
              onClick={() => removeItem.mutate()}
            >
              <Trash2 aria-hidden />
              {t('remove')}
            </Button>
          </div>
        )
      ) : null}
    </>
  );
}
