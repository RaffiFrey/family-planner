import { apiQuery, type Input } from '@fp/api-client';
import type { Poll, Post } from '@fp/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const;

export const POST_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'] as const;
export type PostColor = (typeof POST_COLORS)[number];

/** Sticky-note tints that stay readable in light and dark mode (text uses `text-text`). */
export const POST_COLOR_HEX: Record<PostColor, string> = {
  yellow: '#facc15',
  pink: '#f472b6',
  blue: '#60a5fa',
  green: '#4ade80',
  purple: '#a78bfa',
  orange: '#fb923c',
};

export function isAdultRole(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'adult';
}

const PAGE = 30;

export function useFeed() {
  const { householdId } = useHousehold();
  return useInfiniteQuery({
    queryKey: ['pinboard', 'feed', { householdId }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.pinboard.feed({
        params: { householdId },
        query: { limit: PAGE, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePolls() {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'pinboard', 'polls', { params: { householdId } }));
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['pinboard'] });
}

export function usePostMutations() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const onError = (e: unknown) => {
    showError(e, t);
  };

  const create = useMutation({
    mutationFn: (body: Input<'pinboard', 'createPost'>['body']) =>
      api.pinboard.createPost({ params: { householdId }, body }),
    onSettled: invalidate,
    onError,
  });
  const update = useMutation({
    mutationFn: ({ post, body }: { post: Post; body: Input<'pinboard', 'updatePost'>['body'] }) =>
      api.pinboard.updatePost({ params: { householdId, postId: post.id }, body }),
    onSettled: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: (post: Post) =>
      api.pinboard.removePost({ params: { householdId, postId: post.id } }),
    onSettled: invalidate,
    onError,
  });
  const toggleReaction = useMutation({
    mutationFn: ({ post, emoji }: { post: Post; emoji: string }) => {
      const mine = post.reactions.some((r) => r.emoji === emoji && r.mine);
      return mine
        ? api.pinboard.unreact({ params: { householdId, postId: post.id }, query: { emoji } })
        : api.pinboard.react({ params: { householdId, postId: post.id }, body: { emoji } });
    },
    onSettled: invalidate,
    onError,
  });
  return { create, update, remove, toggleReaction };
}

export function usePollMutations() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const onError = (e: unknown) => {
    showError(e, t);
  };
  const create = useMutation({
    mutationFn: (body: Input<'pinboard', 'createPoll'>['body']) =>
      api.pinboard.createPoll({ params: { householdId }, body }),
    onSettled: invalidate,
    onError,
  });
  const vote = useMutation({
    mutationFn: ({ poll, optionIndexes }: { poll: Poll; optionIndexes: number[] }) =>
      api.pinboard.vote({ params: { householdId, pollId: poll.id }, body: { optionIndexes } }),
    onSettled: invalidate,
    onError,
  });
  const unvote = useMutation({
    mutationFn: (poll: Poll) => api.pinboard.unvote({ params: { householdId, pollId: poll.id } }),
    onSettled: invalidate,
    onError,
  });
  const close = useMutation({
    mutationFn: (poll: Poll) =>
      api.pinboard.closePoll({ params: { householdId, pollId: poll.id } }),
    onSettled: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: (poll: Poll) =>
      api.pinboard.removePoll({ params: { householdId, pollId: poll.id } }),
    onSettled: invalidate,
    onError,
  });
  return { create, vote, unvote, close, remove };
}

/** Poll option share in whole percent (0 when nobody voted). */
export function optionPercent(votes: number, totalVotes: number): number {
  if (totalVotes <= 0) return 0;
  return Math.round((votes / totalVotes) * 100);
}

/** Trimmed, non-empty, case-insensitively unique options (in input order). */
export function cleanPollOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options) {
    const o = raw.trim();
    if (!o || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
  }
  return out;
}
