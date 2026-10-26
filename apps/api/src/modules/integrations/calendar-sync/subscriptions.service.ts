import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import type { apiContract, CalendarSubscription as SubscriptionDto } from '@fp/contracts';
import {
  calendars,
  calendarSubscriptionEvents,
  calendarSubscriptions,
  eventExceptions,
  events,
  households,
  type Transaction,
} from '@fp/db';
import { seriesEnd } from '@fp/domain/recurrence';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, forbidden, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { ENV, type Env } from '../../../config/env.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { type Actor, Db } from '../../../infra/database.js';
import { Queues } from '../../events/queues.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { eventHash, type ExternalEvent, IcsParseError, parseIcs } from './ics-import.js';
import {
  FetchError,
  type FetchPolicy,
  type FetchResult,
  normalizeFeedUrl,
  safeFetch,
  STRICT_POLICY,
} from './ssrf.js';

type C = typeof apiContract.calendarSync;
type SubscriptionRow = typeof calendarSubscriptions.$inferSelect;

export interface SyncStats {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

/** Failures in a row before members get a `calendar.sync_failed` notification. */
export const NOTIFY_AFTER_FAILURES = 3;
const REFRESH_JOB = 'calendar-subscriptions';
const MINUTE = 60_000;

/** Fetches feeds with SSRF protection. `policy` is relaxed in tests (local fixture server). */
@Injectable()
export class FeedFetcher {
  policy: FetchPolicy = STRICT_POLICY;

  fetch(url: string, headers: Record<string, string>): Promise<FetchResult> {
    return safeFetch(url, { policy: this.policy, headers });
  }
}

function seriesEndOf(e: ExternalEvent): Date | null {
  try {
    return seriesEnd({
      start: e.start,
      end: e.end,
      timeZone: e.timezone,
      allDay: e.allDay,
      rrule: e.rrule,
    });
  } catch {
    return e.end;
  }
}

/** EXDATEs and RECURRENCE-ID overrides as exception rows (an override wins over an EXDATE). */
function exceptionRows(e: ExternalEvent, householdId: string, eventId: string) {
  const rows = new Map<number, typeof eventExceptions.$inferInsert>();
  for (const d of e.exdates)
    rows.set(d.getTime(), { householdId, eventId, originalStart: d, cancelled: true });
  for (const o of e.overrides)
    rows.set(o.recurrenceId.getTime(), {
      householdId,
      eventId,
      originalStart: o.recurrenceId,
      cancelled: o.cancelled,
      startAt: o.cancelled ? null : o.start,
      endAt: o.cancelled ? null : o.end,
      overrides: o.cancelled
        ? null
        : { title: o.title, description: o.description, location: o.location },
    });
  return [...rows.values()];
}

@Injectable()
export class SubscriptionsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    private readonly queues: Queues,
    readonly fetcher: FeedFetcher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queues.on('maintenance', REFRESH_JOB, () => this.refreshDue());
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.RUN_WORKERS) await this.queues.schedule(REFRESH_JOB, 5 * MINUTE);
  }

  private toDto(s: SubscriptionRow): SubscriptionDto {
    return {
      id: s.id,
      calendarId: s.calendarId,
      name: s.name,
      urlHost: s.urlHost,
      refreshMinutes: s.refreshMinutes,
      status: s.status,
      lastError: s.lastError,
      lastFetchedAt: isoOrNull(s.lastFetchedAt),
      failureCount: s.failureCount,
      eventCount: s.eventCount,
      createdByMemberId: s.createdByMemberId,
      createdAt: iso(s.createdAt),
    };
  }

  async list(ctx: HouseholdContext): Promise<Out<C['listSubscriptions']>> {
    const rows = await this.db.tenant(actorOf(ctx), (tx) =>
      tx.select().from(calendarSubscriptions).orderBy(calendarSubscriptions.createdAt),
    );
    return rows.map((r) => this.toDto(r));
  }

  async create(
    ctx: HouseholdContext,
    input: In<C['createSubscription']>,
  ): Promise<Out<C['createSubscription']>> {
    const b = input.body;
    let url: URL;
    try {
      url = normalizeFeedUrl(b.url, this.fetcher.policy);
    } catch (e) {
      if (e instanceof FetchError) throw badRequest(e.message, 'invalid_feed_url');
      throw e;
    }
    const sub = await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [cal] = await tx
        .insert(calendars)
        .values({
          householdId: ctx.householdId,
          name: b.name,
          color: b.color,
          visibility: 'household',
          ownerMemberId: ctx.member.id,
        })
        .returning();
      if (!cal) throw new Error('insert failed');
      const [row] = await tx
        .insert(calendarSubscriptions)
        .values({
          householdId: ctx.householdId,
          calendarId: cal.id,
          name: b.name,
          urlEnc: this.crypto.encrypt(url.toString()),
          urlHost: url.host,
          refreshMinutes: b.refreshMinutes,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('calendar', cal.id, 'created');
      ev.changed('calendar_subscription', row.id, 'created');
      ev.audit('calendar_subscription.created', 'calendar_subscription', row.id, {
        name: b.name,
        host: url.host,
      });
      return row;
    });
    return this.refreshAndReport(sub, true);
  }

  private async load(ctx: HouseholdContext, id: string): Promise<SubscriptionRow> {
    const [row] = await this.db.tenant(actorOf(ctx), (tx) =>
      tx.select().from(calendarSubscriptions).where(eq(calendarSubscriptions.id, id)),
    );
    if (!row) throw notFound('Subscription');
    return row;
  }

  async remove(
    ctx: HouseholdContext,
    input: In<C['deleteSubscription']>,
  ): Promise<Out<C['deleteSubscription']>> {
    const sub = await this.load(ctx, input.params.subscriptionId);
    if (sub.createdByMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
      throw forbidden();
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      // Cascades to the subscription, its events and mappings.
      await tx.delete(calendars).where(eq(calendars.id, sub.calendarId));
      ev.changed('calendar', sub.calendarId, 'deleted');
      ev.changed('calendar_subscription', sub.id, 'deleted');
      ev.audit('calendar_subscription.deleted', 'calendar_subscription', sub.id, {
        name: sub.name,
      });
    });
    return OK;
  }

  async refreshNow(
    ctx: HouseholdContext,
    input: In<C['refreshSubscription']>,
  ): Promise<Out<C['refreshSubscription']>> {
    return this.refreshAndReport(await this.load(ctx, input.params.subscriptionId), true);
  }

  private async refreshAndReport(sub: SubscriptionRow, force: boolean) {
    const stats = await this.refreshOne(sub, force);
    const [row] = await this.db.system
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, sub.id));
    return { subscription: this.toDto(row ?? sub), stats };
  }

  /** Scheduled job: refreshes subscriptions whose `next_fetch_at` has passed. */
  async refreshDue(now = new Date()): Promise<number> {
    const due = await this.db.system
      .select()
      .from(calendarSubscriptions)
      .where(lte(calendarSubscriptions.nextFetchAt, now))
      .orderBy(calendarSubscriptions.nextFetchAt)
      .limit(50);
    for (const sub of due) await this.refreshOne(sub, false);
    return due.length;
  }

  /** Fetches and imports one feed. Returns null when the fetch failed (state is recorded). */
  async refreshOne(sub: SubscriptionRow, force: boolean): Promise<SyncStats | null> {
    const actor: Actor = {
      householdId: sub.householdId,
      memberId: sub.createdByMemberId,
      userId: null,
    };
    try {
      const url = this.crypto.decrypt(sub.urlEnc);
      const headers: Record<string, string> = { accept: 'text/calendar, */*;q=0.5' };
      if (!force && sub.etag) headers['if-none-match'] = sub.etag;
      if (!force && sub.lastModified) headers['if-modified-since'] = sub.lastModified;
      const res = await this.fetcher.fetch(url, headers);
      if (res.status === 304) {
        await this.markSuccess(actor, sub, { etag: sub.etag, lastModified: sub.lastModified });
        return { created: 0, updated: 0, deleted: 0, unchanged: sub.eventCount };
      }
      if (res.status < 200 || res.status >= 300)
        throw new FetchError('http', `Feed answered HTTP ${res.status}`);
      const [hh] = await this.db.system
        .select({ timezone: households.timezone })
        .from(households)
        .where(eq(households.id, sub.householdId));
      const feed = parseIcs(res.body, hh?.timezone ?? 'Europe/Berlin');
      const stats = await this.db.tenant(actor, (tx, ev) => {
        const result = this.importEvents(tx, sub, feed.events);
        return result.then((s) => {
          if (s.created + s.updated + s.deleted > 0)
            ev.changed('event', null, 'updated', sub.calendarId);
          return s;
        });
      });
      await this.markSuccess(actor, sub, {
        etag: res.headers.etag ?? null,
        lastModified: res.headers['last-modified'] ?? null,
        eventCount: feed.events.length,
      });
      return stats;
    } catch (e) {
      if (!(e instanceof FetchError) && !(e instanceof IcsParseError)) {
        this.logger.warn(`Subscription ${sub.id} failed: ${(e as Error).message}`);
      }
      await this.markFailure(actor, sub, e instanceof Error ? e.message : 'Unknown error');
      return null;
    }
  }

  private async importEvents(
    tx: Transaction,
    sub: SubscriptionRow,
    feed: ExternalEvent[],
  ): Promise<SyncStats> {
    const stats: SyncStats = { created: 0, updated: 0, deleted: 0, unchanged: 0 };
    const existing = new Map(
      (
        await tx
          .select()
          .from(calendarSubscriptionEvents)
          .where(eq(calendarSubscriptionEvents.subscriptionId, sub.id))
      ).map((m) => [m.uid, m]),
    );
    const seen = new Set<string>();
    for (const e of feed) {
      seen.add(e.uid);
      const hash = eventHash(e);
      const mapped = existing.get(e.uid);
      if (mapped?.hash === hash) {
        stats.unchanged++;
        continue;
      }
      const values = {
        title: e.title,
        description: e.description,
        location: e.location,
        startAt: e.start,
        endAt: e.end,
        allDay: e.allDay,
        timezone: e.timezone,
        rrule: e.rrule,
        seriesEndAt: seriesEndOf(e),
      };
      let eventId: string;
      if (mapped) {
        eventId = mapped.eventId;
        await tx
          .update(events)
          .set({ ...values, deletedAt: null })
          .where(eq(events.id, eventId));
        await tx.delete(eventExceptions).where(eq(eventExceptions.eventId, eventId));
        await tx
          .update(calendarSubscriptionEvents)
          .set({ hash })
          .where(
            and(
              eq(calendarSubscriptionEvents.subscriptionId, sub.id),
              eq(calendarSubscriptionEvents.uid, e.uid),
            ),
          );
        stats.updated++;
      } else {
        const [row] = await tx
          .insert(events)
          .values({
            householdId: sub.householdId,
            calendarId: sub.calendarId,
            ...values,
            createdByMemberId: sub.createdByMemberId,
          })
          .returning({ id: events.id });
        if (!row) throw new Error('insert failed');
        eventId = row.id;
        await tx.insert(calendarSubscriptionEvents).values({
          householdId: sub.householdId,
          subscriptionId: sub.id,
          uid: e.uid,
          eventId,
          hash,
        });
        stats.created++;
      }
      const exs = e.rrule ? exceptionRows(e, sub.householdId, eventId) : [];
      if (exs.length > 0) await tx.insert(eventExceptions).values(exs);
    }
    const removed = [...existing.values()].filter((m) => !seen.has(m.uid)).map((m) => m.eventId);
    if (removed.length > 0) {
      // Imported events are owned by the feed: hard delete (mappings cascade).
      await tx.delete(events).where(inArray(events.id, removed));
      stats.deleted = removed.length;
    }
    return stats;
  }

  private async markSuccess(
    actor: Actor,
    sub: SubscriptionRow,
    v: { etag: string | null; lastModified: string | null; eventCount?: number },
  ): Promise<void> {
    const now = new Date();
    await this.db.tenant(actor, async (tx, ev) => {
      await tx
        .update(calendarSubscriptions)
        .set({
          status: 'ok',
          lastError: null,
          failureCount: 0,
          failureNotifiedAt: null,
          etag: v.etag,
          lastModified: v.lastModified,
          lastFetchedAt: now,
          nextFetchAt: new Date(now.getTime() + sub.refreshMinutes * MINUTE),
          ...(v.eventCount !== undefined ? { eventCount: v.eventCount } : {}),
        })
        .where(eq(calendarSubscriptions.id, sub.id));
      ev.changed('calendar_subscription', sub.id, 'updated');
    });
  }

  private async markFailure(actor: Actor, sub: SubscriptionRow, message: string): Promise<void> {
    const now = new Date();
    const failures = sub.failureCount + 1;
    // Back off: retry sooner than the normal interval at first, never more often than 15 min.
    const retryMinutes = Math.min(sub.refreshMinutes, 15 * 2 ** Math.min(failures - 1, 6));
    const notify = failures >= NOTIFY_AFTER_FAILURES && !sub.failureNotifiedAt;
    await this.db.tenant(actor, async (tx, ev) => {
      await tx
        .update(calendarSubscriptions)
        .set({
          status: 'error',
          lastError: message.slice(0, 500),
          failureCount: failures,
          lastFetchedAt: now,
          nextFetchAt: new Date(now.getTime() + retryMinutes * MINUTE),
          ...(notify ? { failureNotifiedAt: now } : {}),
        })
        .where(eq(calendarSubscriptions.id, sub.id));
      ev.changed('calendar_subscription', sub.id, 'updated');
    });
    if (notify)
      await this.notifications
        .notify({
          householdId: sub.householdId,
          memberIds: [sub.createdByMemberId],
          type: 'calendar.sync_failed',
          message: 'notifications.calendarSyncFailed',
          vars: { name: sub.name },
          link: `/calendar?calendarId=${sub.calendarId}`,
        })
        .catch((e: unknown) => {
          this.logger.warn(`Could not notify about ${sub.id}: ${(e as Error).message}`);
        });
  }
}
