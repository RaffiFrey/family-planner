'use client';

import type { Post } from '@fp/contracts';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { MoreVertical, Pencil, Pin, PinOff, SmilePlus, StickyNote, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';

type PostColor = NonNullable<Post['color']>;
const COLORS: PostColor[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

/** Sticky-note tints that keep contrast in light and dark mode. */
const COLOR_CLASS: Record<PostColor, string> = {
  yellow: 'border-yellow-400/50 bg-yellow-100 dark:bg-yellow-400/15',
  pink: 'border-pink-400/50 bg-pink-100 dark:bg-pink-400/15',
  blue: 'border-sky-400/50 bg-sky-100 dark:bg-sky-400/15',
  green: 'border-green-400/50 bg-green-100 dark:bg-green-400/15',
  purple: 'border-purple-400/50 bg-purple-100 dark:bg-purple-400/15',
  orange: 'border-orange-400/50 bg-orange-100 dark:bg-orange-400/15',
};
const SWATCH_CLASS: Record<PostColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  blue: 'bg-sky-300',
  green: 'bg-green-300',
  purple: 'bg-purple-300',
  orange: 'bg-orange-300',
};

type Feed = InfiniteData<{ items: Post[]; nextCursor: string | null }, string | undefined>;

export function isAdultRole(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'adult';
}

function useFeedKey() {
  const { householdId } = useHousehold();
  return ['pinboard', 'feed', { householdId }] as const;
}

/** Replaces one post inside the cached infinite feed. */
function usePatchFeed() {
  const queryClient = useQueryClient();
  const key = useFeedKey();
  return React.useCallback(
    (postId: string, update: (p: Post) => Post | null) => {
      queryClient.setQueryData<Feed>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((pg) => ({
                ...pg,
                items: pg.items.flatMap((p) => {
                  if (p.id !== postId) return [p];
                  const next = update(p);
                  return next ? [next] : [];
                }),
              })),
            }
          : data,
      );
    },
    [queryClient, key],
  );
}

export function PostsFeed() {
  const t = useTranslations('pinboard.posts');
  const tu = useTranslations('ui');
  const { householdId, can } = useHousehold();
  const key = useFeedKey();
  const canWrite = can('pinboard.write');

  const feed = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      api.pinboard.feed({ params: { householdId }, query: { cursor: pageParam, limit: 30 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid gap-4">
      {canWrite ? <Composer /> : null}
      {feed.isPending ? (
        <LoadingState rows={3} />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState icon={<StickyNote />} title={t('empty')} description={t('emptyHint')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('composerLabel')}>
          {posts.map((p) => (
            <li key={p.id} className={cn(p.pinned && 'sm:col-span-2')}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
      {feed.hasNextPage ? (
        <Button
          variant="secondary"
          className="justify-self-center"
          loading={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {tu('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

function ColorChooser({
  value,
  onChange,
}: {
  value: PostColor | null;
  onChange: (c: PostColor | null) => void;
}) {
  const t = useTranslations('pinboard.posts');
  return (
    <div role="radiogroup" aria-label={t('color')} className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label={t('noColor')}
        title={t('noColor')}
        onClick={() => onChange(null)}
        className={cn(
          'size-6 rounded-full border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary',
          value === null && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
        )}
      />
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t(`colors.${c}`)}
          title={t(`colors.${c}`)}
          onClick={() => onChange(c)}
          className={cn(
            'size-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary',
            SWATCH_CLASS[c],
            value === c && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          )}
        />
      ))}
    </div>
  );
}

function Composer() {
  const t = useTranslations('pinboard.posts');
  const { householdId, member } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [text, setText] = React.useState('');
  const [color, setColor] = React.useState<PostColor | null>(null);
  const [pinned, setPinned] = React.useState(false);
  const canPin = isAdultRole(member.role);
  const id = React.useId();

  const create = useMutation({
    mutationFn: () =>
      api.pinboard.createPost({
        params: { householdId },
        body: { text: text.trim(), color, pinned: canPin && pinned },
      }),
    onSuccess: async () => {
      setText('');
      setColor(null);
      setPinned(false);
      toast.success(t('posted'));
      await queryClient.invalidateQueries({ queryKey: ['pinboard'] });
    },
    onError: toastError,
  });

  return (
    <form
      className={cn(
        'grid gap-3 rounded-lg border border-border bg-surface p-3',
        color && COLOR_CLASS[color],
      )}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) create.mutate();
      }}
    >
      <Label htmlFor={`${id}-text`} className="sr-only">
        {t('composerLabel')}
      </Label>
      <Textarea
        id={`${id}-text`}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('composerPlaceholder')}
        className="min-h-16 bg-background/70"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) create.mutate();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <ColorChooser value={color} onChange={setColor} />
          {canPin ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-pin`}
                checked={pinned}
                onCheckedChange={(v) => setPinned(v === true)}
              />
              <Label htmlFor={`${id}-pin`} className="font-normal">
                {t('pinOnCreate')}
              </Label>
            </div>
          ) : null}
        </div>
        <Button type="submit" loading={create.isPending} disabled={!text.trim()}>
          {t('post')}
        </Button>
      </div>
    </form>
  );
}

function PostCard({ post }: { post: Post }) {
  const t = useTranslations('pinboard.posts');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, member, memberById, can } = useHousehold();
  const queryClient = useQueryClient();
  const patchFeed = usePatchFeed();
  const toastError = useToastError();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const author = memberById(post.authorMemberId);
  const isAuthor = post.authorMemberId === member.id;
  const adult = isAdultRole(member.role);
  const canManage = can('pinboard.write') && (isAuthor || adult);
  const canReact = can('pinboard.write');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pinboard'] });

  const react = useMutation({
    mutationFn: ({ emoji, remove }: { emoji: string; remove: boolean }) =>
      remove
        ? api.pinboard.unreact({
            params: { householdId, postId: post.id },
            query: { emoji },
          })
        : api.pinboard.react({ params: { householdId, postId: post.id }, body: { emoji } }),
    onMutate: ({ emoji, remove }) => {
      // Optimistic toggle of the caller's reaction.
      patchFeed(post.id, (p) => {
        const existing = p.reactions.find((r) => r.emoji === emoji);
        let reactions = p.reactions;
        if (remove && existing) {
          reactions = p.reactions
            .map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: r.count - 1,
                    mine: false,
                    memberIds: r.memberIds.filter((m) => m !== member.id),
                  }
                : r,
            )
            .filter((r) => r.count > 0);
        } else if (!remove) {
          reactions = existing
            ? p.reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, mine: true, memberIds: [...r.memberIds, member.id] }
                  : r,
              )
            : [...p.reactions, { emoji, count: 1, mine: true, memberIds: [member.id] }];
        }
        return { ...p, reactions };
      });
    },
    onSuccess: (updated) => patchFeed(post.id, () => updated),
    onError: async (err) => {
      toastError(err);
      await refresh();
    },
  });

  const togglePin = useMutation({
    mutationFn: () =>
      api.pinboard.updatePost({
        params: { householdId, postId: post.id },
        body: { pinned: !post.pinned },
      }),
    onMutate: () => patchFeed(post.id, (p) => ({ ...p, pinned: !p.pinned })),
    onSettled: refresh,
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: () => api.pinboard.removePost({ params: { householdId, postId: post.id } }),
    onSuccess: async () => {
      setDeleting(false);
      patchFeed(post.id, () => null);
      toast.success(t('deleted'));
      await refresh();
    },
    onError: toastError,
  });

  const toggleReaction = (emoji: string) => {
    const mine = post.reactions.some((r) => r.emoji === emoji && r.mine);
    react.mutate({ emoji, remove: mine });
  };

  const names = (ids: string[]) =>
    ids.map((id) => memberById(id)?.displayName ?? t('unknownMember')).join(', ');

  return (
    <article
      aria-labelledby={`post-${post.id}`}
      className={cn(
        'flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs',
        post.color && COLOR_CLASS[post.color],
        post.pinned && 'border-l-4 border-l-primary',
      )}
    >
      <header className="flex items-start gap-2">
        {author ? <MemberAvatar member={author} size="sm" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {author?.displayName ?? t('unknownMember')}
          </p>
          <p className="text-xs text-muted">
            <time dateTime={post.createdAt}>{fmt.dateTime(post.createdAt)}</time>
            {post.updatedAt !== post.createdAt ? ` · ${t('edited')}` : null}
          </p>
        </div>
        {post.pinned ? (
          <Badge variant="secondary">
            <Pin aria-hidden />
            {t('pinned')}
          </Badge>
        ) : null}
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {adult ? (
                <DropdownMenuItem onSelect={() => togglePin.mutate()}>
                  {post.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                  {post.pinned ? t('unpin') : t('pin')}
                </DropdownMenuItem>
              ) : null}
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
        ) : null}
      </header>
      <p id={`post-${post.id}`} className="text-sm break-words whitespace-pre-wrap">
        {post.text}
      </p>
      {post.expiresAt ? (
        <p className="text-xs text-muted">{t('expires', { date: fmt.dateTime(post.expiresAt) })}</p>
      ) : null}
      <footer className="mt-auto flex flex-wrap items-center gap-1.5">
        {post.reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            disabled={!canReact}
            aria-pressed={r.mine}
            aria-label={
              r.mine ? t('removeReaction', { emoji: r.emoji }) : t('reactWith', { emoji: r.emoji })
            }
            title={names(r.memberIds)}
            onClick={() => toggleReaction(r.emoji)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary',
              r.mine
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background/70 hover:bg-surface-muted',
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {r.count}
          </button>
        ))}
        {canReact ? (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('react')}>
                <SmilePlus aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" align="start">
              <div className="flex gap-1">
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={t('reactWith', { emoji: e })}
                    className="rounded-md p-1.5 text-lg outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => {
                      setPickerOpen(false);
                      if (!post.reactions.some((r) => r.emoji === e && r.mine))
                        react.mutate({ emoji: e, remove: false });
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </footer>
      <EditPostDialog post={post} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </article>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditPostDialogBody({
  post,
  onOpenChange,
}: {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('pinboard.posts');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [text, setText] = React.useState(post.text);
  const [color, setColor] = React.useState<PostColor | null>(post.color);
  const [expires, setExpires] = React.useState(toLocalInput(post.expiresAt));

  const save = useMutation({
    mutationFn: () =>
      api.pinboard.updatePost({
        params: { householdId, postId: post.id },
        body: {
          text: text.trim(),
          color,
          expiresAt: expires ? new Date(expires).toISOString() : null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['pinboard'] });
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('edit')}</DialogTitle>
        <DialogDescription className="sr-only">{t('edit')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) save.mutate();
        }}
      >
        <Field label={t('composerLabel')}>
          {(p) => (
            <Textarea
              {...p}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('color')}</span>
          <ColorChooser value={color} onChange={setColor} />
        </div>
        <Field label={t('expiresAt')}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          )}
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!text.trim()}>
            {tc('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function EditPostDialog(props: React.ComponentProps<typeof EditPostDialogBody>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <EditPostDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
