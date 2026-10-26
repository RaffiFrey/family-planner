import { z } from 'zod';
import {
  CursorQuery,
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  Ok,
  page,
  withHousehold,
} from '../core.js';

export const Emoji = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine((s) => !/[\s<>]/.test(s), 'Invalid emoji');

export const PostColor = z.enum(['yellow', 'pink', 'blue', 'green', 'purple', 'orange']);

export const ReactionSummary = z.object({
  emoji: z.string(),
  count: z.number().int(),
  memberIds: z.array(Id),
  mine: z.boolean(),
});

export const Post = z.object({
  id: Id,
  text: z.string(),
  color: PostColor.nullable(),
  pinned: z.boolean(),
  expiresAt: IsoDateTime.nullable(),
  attachmentFileIds: z.array(Id),
  authorMemberId: Id,
  reactions: z.array(ReactionSummary),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Post = z.infer<typeof Post>;

const PostBase = z.object({
  text: z.string().trim().min(1).max(2000),
  color: PostColor.nullable(),
  pinned: z.boolean(),
  expiresAt: IsoDateTime.nullable(),
  attachmentFileIds: z.array(Id).max(10),
});
export const CreatePostBody = PostBase.extend({
  color: PostBase.shape.color.default(null),
  pinned: PostBase.shape.pinned.default(false),
  expiresAt: PostBase.shape.expiresAt.default(null),
  attachmentFileIds: PostBase.shape.attachmentFileIds.default([]),
});
export const UpdatePostBody = PostBase.partial();

export const FeedQuery = CursorQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const ReactBody = z.object({ emoji: Emoji });
export const UnreactQuery = z.object({ emoji: Emoji });

export const PollOption = z.object({
  index: z.number().int(),
  text: z.string(),
  votes: z.number().int(),
  /** Empty for anonymous polls. */
  voterMemberIds: z.array(Id),
});

export const Poll = z.object({
  id: Id,
  question: z.string(),
  multiple: z.boolean(),
  anonymous: z.boolean(),
  closesAt: IsoDateTime.nullable(),
  closedAt: IsoDateTime.nullable(),
  open: z.boolean(),
  options: z.array(PollOption),
  myVotes: z.array(z.number().int()),
  totalVoters: z.number().int(),
  authorMemberId: Id,
  createdAt: IsoDateTime,
});
export type Poll = z.infer<typeof Poll>;

export const CreatePollBody = z.object({
  question: z.string().trim().min(1).max(300),
  options: z
    .array(z.string().trim().min(1).max(120))
    .min(2)
    .max(12)
    .refine((o) => new Set(o.map((s) => s.toLowerCase())).size === o.length, 'Duplicate options'),
  multiple: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  closesAt: IsoDateTime.nullable().default(null),
});

export const PollListQuery = z.object({
  status: z.enum(['open', 'closed', 'all']).default('all'),
});
export const VoteBody = z.object({
  /** Replaces the caller's votes on this poll. */
  optionIndexes: z.array(z.number().int().min(0)).min(1).max(12),
});

const tags = ['pinboard'];
const PostParams = withHousehold({ postId: Id });
const PollParams = withHousehold({ pollId: Id });

export const pinboardContract = {
  feed: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/pinboard/posts',
    summary: 'Pinboard feed (pinned first, newest first)',
    tags,
    params: HouseholdParams,
    query: FeedQuery,
    response: page(Post),
  }),
  createPost: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/pinboard/posts',
    summary: 'Post a note',
    tags,
    params: HouseholdParams,
    body: CreatePostBody,
    response: Post,
  }),
  updatePost: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/pinboard/posts/:postId',
    summary: 'Edit or pin a note (author or adults)',
    tags,
    params: PostParams,
    body: UpdatePostBody,
    response: Post,
  }),
  removePost: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/pinboard/posts/:postId',
    summary: 'Delete a note (author or adults)',
    tags,
    params: PostParams,
    response: Ok,
  }),
  react: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/pinboard/posts/:postId/reactions',
    summary: 'React with an emoji',
    tags,
    params: PostParams,
    body: ReactBody,
    response: Post,
    status: 200,
  }),
  unreact: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/pinboard/posts/:postId/reactions',
    summary: 'Remove an own reaction',
    tags,
    params: PostParams,
    query: UnreactQuery,
    response: Post,
  }),
  polls: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/pinboard/polls',
    summary: 'Polls',
    tags,
    params: HouseholdParams,
    query: PollListQuery,
    response: z.array(Poll),
  }),
  getPoll: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/pinboard/polls/:pollId',
    summary: 'Poll with results',
    tags,
    params: PollParams,
    response: Poll,
  }),
  createPoll: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/pinboard/polls',
    summary: 'Start a poll',
    tags,
    params: HouseholdParams,
    body: CreatePollBody,
    response: Poll,
  }),
  vote: defineEndpoint({
    method: 'PUT',
    path: '/v1/households/:householdId/pinboard/polls/:pollId/vote',
    summary: 'Vote (replaces own votes)',
    tags,
    params: PollParams,
    body: VoteBody,
    response: Poll,
  }),
  unvote: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/pinboard/polls/:pollId/vote',
    summary: 'Withdraw own votes',
    tags,
    params: PollParams,
    response: Poll,
  }),
  closePoll: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/pinboard/polls/:pollId/close',
    summary: 'Close a poll (author or adults)',
    tags,
    params: PollParams,
    response: Poll,
    status: 200,
  }),
  removePoll: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/pinboard/polls/:pollId',
    summary: 'Delete a poll (author or adults)',
    tags,
    params: PollParams,
    response: Ok,
  }),
} as const;
