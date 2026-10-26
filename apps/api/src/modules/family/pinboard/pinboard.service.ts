import { Injectable } from '@nestjs/common';
import type { apiContract, Poll as PollDto, Post as PostDto } from '@fp/contracts';
import {
  boardPosts,
  boardReactions,
  files,
  householdMembers,
  pollVotes,
  polls,
  type Transaction,
} from '@fp/db';
import { isPollOpen, tallyPoll, validateVoteSelection } from '@fp/domain/family';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, conflict, forbidden, notFound } from '../../../common/errors.js';
import { decodeCursor, toPage } from '../../../common/pagination.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { Db } from '../../../infra/database.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { excerpt, isAdult } from '../common.js';

type C = typeof apiContract.pinboard;
type PostRow = typeof boardPosts.$inferSelect;
type PollRow = typeof polls.$inferSelect;

@Injectable()
export class PinboardService {
  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private canModerate(ctx: HouseholdContext, authorMemberId: string): boolean {
    return authorMemberId === ctx.member.id || isAdult(ctx);
  }

  // ---------------------------------------------------------------- posts

  private async toPosts(
    tx: Transaction,
    ctx: HouseholdContext,
    rows: PostRow[],
  ): Promise<PostDto[]> {
    const ids = rows.map((r) => r.id);
    const reactions =
      ids.length === 0
        ? []
        : await tx
            .select()
            .from(boardReactions)
            .where(inArray(boardReactions.postId, ids))
            .orderBy(asc(boardReactions.createdAt));
    return rows.map((p) => {
      const byEmoji = new Map<string, string[]>();
      for (const r of reactions) {
        if (r.postId !== p.id) continue;
        byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.memberId]);
      }
      return {
        id: p.id,
        text: p.text,
        color: p.color as PostDto['color'],
        pinned: p.pinned,
        expiresAt: isoOrNull(p.expiresAt),
        attachmentFileIds: p.attachmentFileIds,
        authorMemberId: p.authorMemberId,
        reactions: [...byEmoji].map(([emoji, memberIds]) => ({
          emoji,
          count: memberIds.length,
          memberIds,
          mine: memberIds.includes(ctx.member.id),
        })),
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
      };
    });
  }

  private async loadPost(tx: Transaction, id: string): Promise<PostRow> {
    const [p] = await tx.select().from(boardPosts).where(eq(boardPosts.id, id));
    if (!p) throw notFound('Post');
    return p;
  }

  private async postDto(tx: Transaction, ctx: HouseholdContext, id: string): Promise<PostDto> {
    const [dto] = await this.toPosts(tx, ctx, [await this.loadPost(tx, id)]);
    return dto as PostDto;
  }

  private async assertFiles(
    tx: Transaction,
    ctx: HouseholdContext,
    ids: readonly string[] | undefined,
  ): Promise<void> {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return;
    const found = await tx
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          inArray(files.id, unique),
          isNull(files.deletedAt),
          visibleTo(ctx.member.id, { visibility: files.visibility, owner: files.ownerMemberId }),
        ),
      );
    if (found.length !== unique.length) throw badRequest('Unknown attachment', 'invalid_file');
  }

  async feed(ctx: HouseholdContext, input: In<C['feed']>): Promise<Out<C['feed']>> {
    const q = input.query;
    const cursor = decodeCursor(q.cursor);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      // UUIDv7 ids sort by creation time, so (pinned, id) is a stable keyset.
      const rows = await tx
        .select()
        .from(boardPosts)
        .where(
          and(
            or(isNull(boardPosts.expiresAt), gt(boardPosts.expiresAt, new Date())),
            cursor
              ? sql`(${boardPosts.pinned}, ${boardPosts.id}) < (${cursor.v === '1'}, ${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(boardPosts.pinned), desc(boardPosts.id))
        .limit(q.limit + 1);
      const page = toPage(
        rows,
        q.limit,
        (r) => ({ v: r.pinned ? '1' : '0', id: r.id }),
        (r) => r,
      );
      return { items: await this.toPosts(tx, ctx, page.items), nextCursor: page.nextCursor };
    });
  }

  async createPost(
    ctx: HouseholdContext,
    input: In<C['createPost']>,
  ): Promise<Out<C['createPost']>> {
    const b = input.body;
    if (b.pinned && !isAdult(ctx)) throw forbidden('Only adults can pin posts');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertFiles(tx, ctx, b.attachmentFileIds);
      const [row] = await tx
        .insert(boardPosts)
        .values({
          householdId: ctx.householdId,
          text: b.text,
          color: b.color,
          pinned: b.pinned,
          expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
          attachmentFileIds: [...new Set(b.attachmentFileIds)],
          authorMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('post', row.id, 'created');
      ev.emit('pinboard.post_created', { postId: row.id, text: excerpt(row.text) });
      return (await this.toPosts(tx, ctx, [row]))[0] as PostDto;
    });
  }

  async updatePost(
    ctx: HouseholdContext,
    input: In<C['updatePost']>,
  ): Promise<Out<C['updatePost']>> {
    const b = input.body;
    if (b.pinned !== undefined && !isAdult(ctx)) throw forbidden('Only adults can pin posts');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadPost(tx, input.params.postId);
      if (!this.canModerate(ctx, current.authorMemberId)) throw forbidden();
      await this.assertFiles(tx, ctx, b.attachmentFileIds);
      await tx
        .update(boardPosts)
        .set({
          ...(b.text !== undefined ? { text: b.text } : {}),
          ...(b.color !== undefined ? { color: b.color } : {}),
          ...(b.pinned !== undefined ? { pinned: b.pinned } : {}),
          ...(b.expiresAt !== undefined
            ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null }
            : {}),
          ...(b.attachmentFileIds !== undefined
            ? { attachmentFileIds: [...new Set(b.attachmentFileIds)] }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(boardPosts.id, current.id));
      ev.changed('post', current.id, 'updated');
      return this.postDto(tx, ctx, current.id);
    });
  }

  async removePost(
    ctx: HouseholdContext,
    input: In<C['removePost']>,
  ): Promise<Out<C['removePost']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.loadPost(tx, input.params.postId);
      if (!this.canModerate(ctx, current.authorMemberId)) throw forbidden();
      await tx.delete(boardPosts).where(eq(boardPosts.id, current.id));
      ev.changed('post', current.id, 'deleted');
      if (current.authorMemberId !== ctx.member.id)
        ev.audit('pinboard.post_removed', 'post', current.id, {
          author: current.authorMemberId,
        });
    });
    return OK;
  }

  async react(ctx: HouseholdContext, input: In<C['react']>): Promise<Out<C['react']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const post = await this.loadPost(tx, input.params.postId);
      await tx
        .insert(boardReactions)
        .values({
          householdId: ctx.householdId,
          postId: post.id,
          memberId: ctx.member.id,
          emoji: input.body.emoji,
        })
        .onConflictDoNothing();
      ev.changed('post', post.id, 'updated');
      return this.postDto(tx, ctx, post.id);
    });
  }

  async unreact(ctx: HouseholdContext, input: In<C['unreact']>): Promise<Out<C['unreact']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const post = await this.loadPost(tx, input.params.postId);
      await tx
        .delete(boardReactions)
        .where(
          and(
            eq(boardReactions.postId, post.id),
            eq(boardReactions.memberId, ctx.member.id),
            eq(boardReactions.emoji, input.query.emoji),
          ),
        );
      ev.changed('post', post.id, 'updated');
      return this.postDto(tx, ctx, post.id);
    });
  }

  // ---------------------------------------------------------------- polls

  private async toPolls(
    tx: Transaction,
    ctx: HouseholdContext,
    rows: PollRow[],
  ): Promise<PollDto[]> {
    const ids = rows.map((r) => r.id);
    const votes =
      ids.length === 0
        ? []
        : await tx
            .select({
              pollId: pollVotes.pollId,
              memberId: pollVotes.memberId,
              optionIndex: pollVotes.optionIndex,
            })
            .from(pollVotes)
            .where(inArray(pollVotes.pollId, ids))
            .orderBy(asc(pollVotes.createdAt));
    const now = new Date();
    return rows.map((p) => {
      const mine = votes.filter((v) => v.pollId === p.id);
      const results = tallyPoll(p.options.length, mine, p.anonymous);
      return {
        id: p.id,
        question: p.question,
        multiple: p.multiple,
        anonymous: p.anonymous,
        closesAt: isoOrNull(p.closesAt),
        closedAt: isoOrNull(p.closedAt),
        open: isPollOpen(p, now),
        options: results.options.map((o) => ({
          index: o.index,
          text: p.options[o.index] ?? '',
          votes: o.votes,
          voterMemberIds: o.memberIds,
        })),
        myVotes: mine.filter((v) => v.memberId === ctx.member.id).map((v) => v.optionIndex),
        totalVoters: results.totalVoters,
        authorMemberId: p.authorMemberId,
        createdAt: iso(p.createdAt),
      };
    });
  }

  private async loadPoll(tx: Transaction, id: string): Promise<PollRow> {
    const [p] = await tx.select().from(polls).where(eq(polls.id, id));
    if (!p) throw notFound('Poll');
    return p;
  }

  private async pollDto(tx: Transaction, ctx: HouseholdContext, id: string): Promise<PollDto> {
    const [dto] = await this.toPolls(tx, ctx, [await this.loadPoll(tx, id)]);
    return dto as PollDto;
  }

  async polls(ctx: HouseholdContext, input: In<C['polls']>): Promise<Out<C['polls']>> {
    const status = input.query.status;
    const now = new Date();
    const open = and(isNull(polls.closedAt), or(isNull(polls.closesAt), gt(polls.closesAt, now)));
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(polls)
        .where(
          status === 'open'
            ? open
            : status === 'closed'
              ? or(isNotNull(polls.closedAt), sql`${polls.closesAt} <= ${now.toISOString()}`)
              : undefined,
        )
        .orderBy(desc(polls.createdAt))
        .limit(200);
      return this.toPolls(tx, ctx, rows);
    });
  }

  async getPoll(ctx: HouseholdContext, input: In<C['getPoll']>): Promise<Out<C['getPoll']>> {
    return this.db.tenant(actorOf(ctx), (tx) => this.pollDto(tx, ctx, input.params.pollId));
  }

  async createPoll(
    ctx: HouseholdContext,
    input: In<C['createPoll']>,
  ): Promise<Out<C['createPoll']>> {
    const b = input.body;
    if (b.closesAt && new Date(b.closesAt) <= new Date())
      throw badRequest('closesAt must be in the future', 'invalid_close');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .insert(polls)
        .values({
          householdId: ctx.householdId,
          question: b.question,
          options: b.options,
          multiple: b.multiple,
          anonymous: b.anonymous,
          closesAt: b.closesAt ? new Date(b.closesAt) : null,
          authorMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('poll', row.id, 'created');
      ev.emit('pinboard.poll_created', { pollId: row.id, question: excerpt(row.question) });
      return (await this.toPolls(tx, ctx, [row]))[0] as PollDto;
    });
  }

  async vote(ctx: HouseholdContext, input: In<C['vote']>): Promise<Out<C['vote']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const poll = await this.loadPoll(tx, input.params.pollId);
      if (!isPollOpen(poll)) throw conflict('The poll is closed', 'poll_closed');
      const error = validateVoteSelection(
        input.body.optionIndexes,
        poll.options.length,
        poll.multiple,
      );
      if (error) throw badRequest(error, 'invalid_vote');
      await tx
        .delete(pollVotes)
        .where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.memberId, ctx.member.id)));
      await tx.insert(pollVotes).values(
        input.body.optionIndexes.map((optionIndex) => ({
          householdId: ctx.householdId,
          pollId: poll.id,
          memberId: ctx.member.id,
          optionIndex,
        })),
      );
      ev.changed('poll', poll.id, 'updated');
      return this.pollDto(tx, ctx, poll.id);
    });
  }

  async unvote(ctx: HouseholdContext, input: In<C['unvote']>): Promise<Out<C['unvote']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const poll = await this.loadPoll(tx, input.params.pollId);
      if (!isPollOpen(poll)) throw conflict('The poll is closed', 'poll_closed');
      await tx
        .delete(pollVotes)
        .where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.memberId, ctx.member.id)));
      ev.changed('poll', poll.id, 'updated');
      return this.pollDto(tx, ctx, poll.id);
    });
  }

  async closePoll(ctx: HouseholdContext, input: In<C['closePoll']>): Promise<Out<C['closePoll']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const poll = await this.loadPoll(tx, input.params.pollId);
      if (!this.canModerate(ctx, poll.authorMemberId)) throw forbidden();
      if (!poll.closedAt) {
        await tx.update(polls).set({ closedAt: new Date() }).where(eq(polls.id, poll.id));
        ev.changed('poll', poll.id, 'updated');
      }
      return this.pollDto(tx, ctx, poll.id);
    });
  }

  async removePoll(
    ctx: HouseholdContext,
    input: In<C['removePoll']>,
  ): Promise<Out<C['removePoll']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const poll = await this.loadPoll(tx, input.params.pollId);
      if (!this.canModerate(ctx, poll.authorMemberId)) throw forbidden();
      await tx.delete(polls).where(eq(polls.id, poll.id));
      ev.changed('poll', poll.id, 'deleted');
    });
    return OK;
  }

  // ---------------------------------------------------------------- notifications

  private async actorName(householdId: string, memberId: string | null): Promise<string> {
    if (!memberId) return 'Family Planer';
    const [m] = await this.db.system
      .select({ name: householdMembers.displayName })
      .from(householdMembers)
      .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)));
    return m?.name ?? 'Family Planer';
  }

  private async allMembers(householdId: string): Promise<string[]> {
    const rows = await this.db.system
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.householdId, householdId), isNull(householdMembers.removedAt)),
      );
    return rows.map((r) => r.id);
  }

  async notifyPost(e: {
    householdId: string;
    actorMemberId: string | null;
    postId: string;
    text: string;
  }): Promise<void> {
    await this.notifications.notify({
      householdId: e.householdId,
      memberIds: await this.allMembers(e.householdId),
      exceptMemberId: e.actorMemberId,
      type: 'pinboard.post',
      message: 'notifications.postCreated',
      vars: { actor: await this.actorName(e.householdId, e.actorMemberId), text: e.text },
      link: `/pinboard?post=${e.postId}`,
    });
  }

  async notifyPoll(e: {
    householdId: string;
    actorMemberId: string | null;
    pollId: string;
    question: string;
  }): Promise<void> {
    await this.notifications.notify({
      householdId: e.householdId,
      memberIds: await this.allMembers(e.householdId),
      exceptMemberId: e.actorMemberId,
      type: 'pinboard.poll',
      message: 'notifications.pollCreated',
      vars: { actor: await this.actorName(e.householdId, e.actorMemberId), question: e.question },
      link: `/pinboard?poll=${e.pollId}`,
    });
  }
}
