import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import type { apiContract, GoogleCalendarConnection as ConnectionDto } from '@fp/contracts';
import {
  calendars,
  calendarSubscriptions,
  eventExceptions,
  events,
  googleCalendarConnections,
  googleEventLinks,
  households,
  type Transaction,
} from '@fp/db';
import { seriesEnd } from '@fp/domain/recurrence';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { ENV, type Env } from '../../../config/env.js';
import { CryptoService } from '../../../infra/crypto.service.js';
import { type Actor, Db, type UnitEvents } from '../../../infra/database.js';
import { REDIS } from '../../../infra/infra.module.js';
import { Queues } from '../../events/queues.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import {
  GOOGLE_CALENDAR_API,
  GoogleApiError,
  type GoogleCalendarApi,
  type GoogleEvent,
  GoogleSyncTokenExpired,
} from './google-api.js';
import {
  decide,
  exceptionsHash,
  googleTime,
  googleToLocal,
  localToGoogle,
  type MappedGoogleEvent,
  type OccurrenceOverride,
  overrideToGoogle,
} from './google-mapping.js';
import { NOTIFY_AFTER_FAILURES, type SyncStats } from './subscriptions.service.js';

type C = typeof apiContract.calendarSync;
type ConnectionRow = typeof googleCalendarConnections.$inferSelect;
type EventRow = typeof events.$inferSelect;
type LinkRow = typeof googleEventLinks.$inferSelect;
type ExceptionRow = typeof eventExceptions.$inferSelect;

/** Moved/retitled occurrences (not cancelled ones) of a local series. */
function overridesOf(exs: readonly ExceptionRow[]): OccurrenceOverride[] {
  return exs
    .filter((x) => !x.cancelled && x.startAt && x.endAt)
    .map((x) => ({
      originalStart: x.originalStart,
      start: x.startAt as Date,
      end: x.endAt as Date,
      title: x.overrides?.title,
      description: x.overrides?.description,
      location: x.overrides?.location,
    }));
}

/** Title/description/location an occurrence actually shows (override or series value). */
function effective(
  o: ExceptionRow['overrides'] | undefined,
  master: EventRow | undefined,
): [string | null, string | null, string | null] | null {
  if (!o) return null;
  return [
    o.title ?? master?.title ?? null,
    o.description !== undefined ? o.description : (master?.description ?? null),
    o.location !== undefined ? o.location : (master?.location ?? null),
  ];
}

function hashOf(exs: readonly ExceptionRow[]): string {
  return exceptionsHash(
    exs.filter((x) => x.cancelled).map((x) => x.originalStart),
    overridesOf(exs),
  );
}

const SYNC_JOB = 'google-calendar-sync';
const STATE_TTL_SECONDS = 600;
const MINUTE = 60_000;

const emptyStats = (): SyncStats => ({ created: 0, updated: 0, deleted: 0, unchanged: 0 });

interface OAuthState {
  householdId: string;
  memberId: string;
  calendarId: string;
  googleCalendarId: string;
}

export interface GoogleSyncOutcome {
  pulled: SyncStats;
  pushed: SyncStats;
}

function seriesEndOf(e: MappedGoogleEvent): Date | null {
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

/**
 * Two-way sync between one household calendar and one Google calendar.
 * Pull: incremental `events.list` with a sync token. Push: local events whose `updated_at` is
 * newer than at the last sync. Conflicts: last writer wins (see `decide`).
 */
@Injectable()
export class GoogleSyncService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(GoogleSyncService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    private readonly queues: Queues,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GOOGLE_CALENDAR_API) private api: GoogleCalendarApi,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Swaps the Google API client (tests use a fake). */
  useApi(api: GoogleCalendarApi): void {
    this.api = api;
  }

  onModuleInit(): void {
    this.queues.on('maintenance', SYNC_JOB, () => this.syncAll());
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.RUN_WORKERS) await this.queues.schedule(SYNC_JOB, 10 * MINUTE);
  }

  get redirectUri(): string {
    return `${this.env.WEB_URL}/settings/integrations/google/callback`;
  }

  private toDto(c: ConnectionRow): ConnectionDto {
    return {
      id: c.id,
      calendarId: c.calendarId,
      googleCalendarId: c.googleCalendarId,
      status: c.status,
      lastError: c.lastError,
      lastSyncedAt: isoOrNull(c.lastSyncedAt),
      connectedByMemberId: c.memberId,
      createdAt: iso(c.createdAt),
    };
  }

  async list(ctx: HouseholdContext): Promise<Out<C['listGoogle']>> {
    const rows = await this.db.tenant(actorOf(ctx), (tx) =>
      tx.select().from(googleCalendarConnections).orderBy(googleCalendarConnections.createdAt),
    );
    return rows.map((r) => this.toDto(r));
  }

  // ------------------------------------------------------------ OAuth

  async connect(
    ctx: HouseholdContext,
    input: In<C['connectGoogle']>,
  ): Promise<Out<C['connectGoogle']>> {
    const b = input.body;
    await this.db.tenant(actorOf(ctx), async (tx) => {
      const [cal] = await tx
        .select()
        .from(calendars)
        .where(
          and(
            eq(calendars.id, b.calendarId),
            visibleTo(ctx.member.id, {
              visibility: calendars.visibility,
              owner: calendars.ownerMemberId,
              sharedWith: calendars.sharedWith,
            }),
          ),
        );
      if (!cal) throw notFound('Calendar');
      if (cal.ownerMemberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
        throw forbidden('Only the calendar owner or an admin can connect it');
      const [sub] = await tx
        .select({ id: calendarSubscriptions.id })
        .from(calendarSubscriptions)
        .where(eq(calendarSubscriptions.calendarId, cal.id));
      if (sub) throw badRequest('Subscribed calendars are read-only', 'calendar_read_only');
      const [existing] = await tx
        .select({ id: googleCalendarConnections.id })
        .from(googleCalendarConnections)
        .where(eq(googleCalendarConnections.calendarId, cal.id));
      if (existing) throw conflict('This calendar is already connected', 'already_connected');
    });
    const state = CryptoService.token(24);
    const payload: OAuthState = {
      householdId: ctx.householdId,
      memberId: ctx.member.id,
      calendarId: b.calendarId,
      googleCalendarId: b.googleCalendarId,
    };
    let authUrl: string;
    try {
      authUrl = this.api.authUrl({ redirectUri: this.redirectUri, state });
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 503) throw unavailable(e.message);
      throw e;
    }
    await this.redis.set(`gcal:oauth:${state}`, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);
    return { authUrl, state };
  }

  async callback(
    ctx: HouseholdContext,
    input: In<C['googleCallback']>,
  ): Promise<Out<C['googleCallback']>> {
    const raw = await this.redis.getdel(`gcal:oauth:${input.body.state}`);
    const state = raw ? (JSON.parse(raw) as OAuthState) : null;
    if (!state || state.householdId !== ctx.householdId || state.memberId !== ctx.member.id)
      throw badRequest('Invalid or expired authorization state', 'invalid_oauth_state');
    let tokens;
    try {
      tokens = await this.api.exchangeCode(input.body.code, this.redirectUri);
    } catch (e) {
      if (e instanceof GoogleApiError)
        throw badRequest('Google authorization failed', 'oauth_failed');
      throw e;
    }
    if (!tokens.refreshToken)
      throw badRequest('Google did not grant offline access', 'oauth_no_refresh_token');
    const conn = await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .insert(googleCalendarConnections)
        .values({
          householdId: ctx.householdId,
          calendarId: state.calendarId,
          googleCalendarId: state.googleCalendarId,
          memberId: ctx.member.id,
          refreshTokenEnc: this.crypto.encrypt(tokens.refreshToken as string),
          accessTokenEnc: this.crypto.encrypt(tokens.accessToken),
          accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        })
        .onConflictDoNothing()
        .returning();
      if (!row) throw conflict('This calendar is already connected', 'already_connected');
      ev.changed('calendar_subscription', row.id, 'created');
      ev.audit('google_calendar.connected', 'calendar', row.calendarId, {
        googleCalendarId: row.googleCalendarId,
      });
      return row;
    });
    return this.syncAndReport(conn);
  }

  private async loadConnection(ctx: HouseholdContext, id: string): Promise<ConnectionRow> {
    const [row] = await this.db.tenant(actorOf(ctx), (tx) =>
      tx.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.id, id)),
    );
    if (!row) throw notFound('Connection');
    return row;
  }

  async disconnect(
    ctx: HouseholdContext,
    input: In<C['disconnectGoogle']>,
  ): Promise<Out<C['disconnectGoogle']>> {
    const conn = await this.loadConnection(ctx, input.params.connectionId);
    if (conn.memberId !== ctx.member.id && !['owner', 'admin'].includes(ctx.member.role))
      throw forbidden();
    await this.api.revoke(this.crypto.decrypt(conn.refreshTokenEnc)).catch((e: unknown) => {
      this.logger.warn(`Token revocation failed: ${(e as Error).message}`);
    });
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx.delete(googleCalendarConnections).where(eq(googleCalendarConnections.id, conn.id));
      ev.changed('calendar_subscription', conn.id, 'deleted');
      ev.audit('google_calendar.disconnected', 'calendar', conn.calendarId);
    });
    return OK;
  }

  async syncNow(ctx: HouseholdContext, input: In<C['syncGoogle']>): Promise<Out<C['syncGoogle']>> {
    return this.syncAndReport(await this.loadConnection(ctx, input.params.connectionId));
  }

  private async syncAndReport(conn: ConnectionRow) {
    let outcome: GoogleSyncOutcome = { pulled: emptyStats(), pushed: emptyStats() };
    try {
      outcome = await this.sync(conn);
    } catch {
      // Recorded on the connection (status/lastError); the client shows it.
    }
    const [row] = await this.db.system
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.id, conn.id));
    return { connection: this.toDto(row ?? conn), ...outcome };
  }

  /** Scheduled job: syncs every connection that isn't revoked. */
  async syncAll(): Promise<number> {
    const rows = await this.db.system
      .select()
      .from(googleCalendarConnections)
      .where(ne(googleCalendarConnections.status, 'revoked'));
    for (const conn of rows) await this.sync(conn).catch(() => undefined);
    return rows.length;
  }

  // ------------------------------------------------------------ sync

  private async accessToken(conn: ConnectionRow): Promise<string> {
    if (
      conn.accessTokenEnc &&
      conn.accessTokenExpiresAt &&
      conn.accessTokenExpiresAt.getTime() > Date.now() + MINUTE
    )
      return this.crypto.decrypt(conn.accessTokenEnc);
    const tokens = await this.api.refreshAccessToken(this.crypto.decrypt(conn.refreshTokenEnc));
    await this.db.system
      .update(googleCalendarConnections)
      .set({
        accessTokenEnc: this.crypto.encrypt(tokens.accessToken),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        ...(tokens.refreshToken
          ? { refreshTokenEnc: this.crypto.encrypt(tokens.refreshToken) }
          : {}),
      })
      .where(eq(googleCalendarConnections.id, conn.id));
    return tokens.accessToken;
  }

  /** Runs one two-way sync; failures are recorded on the connection and rethrown. */
  async sync(conn: ConnectionRow): Promise<GoogleSyncOutcome> {
    if (this.running.has(conn.id)) return { pulled: emptyStats(), pushed: emptyStats() };
    this.running.add(conn.id);
    const actor: Actor = { householdId: conn.householdId, memberId: conn.memberId, userId: null };
    try {
      const token = await this.accessToken(conn);
      const [hh] = await this.db.system
        .select({ timezone: households.timezone })
        .from(households)
        .where(eq(households.id, conn.householdId));
      const tz = hh?.timezone ?? 'Europe/Berlin';
      const { items, syncToken } = await this.fetchChanges(conn, token);
      const pulled = await this.db.tenant(actor, (tx, ev) => this.pull(tx, ev, conn, items, tz));
      const pushed = await this.push(actor, conn, token);
      await this.db.tenant(actor, async (tx, ev) => {
        await tx
          .update(googleCalendarConnections)
          .set({
            syncToken,
            status: 'active',
            lastError: null,
            failureCount: 0,
            failureNotifiedAt: null,
            lastSyncedAt: new Date(),
          })
          .where(eq(googleCalendarConnections.id, conn.id));
        ev.changed('calendar_subscription', conn.id, 'updated');
      });
      return { pulled, pushed };
    } catch (e) {
      await this.markFailure(actor, conn, e);
      throw e;
    } finally {
      this.running.delete(conn.id);
    }
  }

  private async fetchChanges(conn: ConnectionRow, token: string) {
    const run = async (syncToken: string | null) => {
      const items: GoogleEvent[] = [];
      let pageToken: string | null = null;
      let next: string | null = null;
      for (let page = 0; page < 100; page++) {
        const res = await this.api.listEvents(token, conn.googleCalendarId, {
          syncToken,
          pageToken,
        });
        items.push(...res.items);
        pageToken = res.nextPageToken ?? null;
        next = res.nextSyncToken ?? next;
        if (!pageToken) break;
      }
      return { items, syncToken: next };
    };
    try {
      return await run(conn.syncToken);
    } catch (e) {
      if (!(e instanceof GoogleSyncTokenExpired) || !conn.syncToken) throw e;
      return run(null); // token expired → full sync; links keep it idempotent
    }
  }

  private async pull(
    tx: Transaction,
    ev: UnitEvents,
    conn: ConnectionRow,
    items: GoogleEvent[],
    tz: string,
  ): Promise<SyncStats> {
    const stats = emptyStats();
    const links = new Map(
      (
        await tx.select().from(googleEventLinks).where(eq(googleEventLinks.connectionId, conn.id))
      ).map((l) => [l.googleEventId, l]),
    );
    const localRows = links.size
      ? await tx
          .select()
          .from(events)
          .where(
            inArray(
              events.id,
              [...links.values()].map((l) => l.eventId),
            ),
          )
      : [];
    const locals = new Map(localRows.map((e) => [e.id, e]));
    let changed = false;
    const touchedMasters = new Set<string>();

    for (const g of items.filter((i) => !i.recurringEventId)) {
      const link = links.get(g.id);
      const local = link ? locals.get(link.eventId) : undefined;
      const remoteUpdatedAt = g.updated ? new Date(g.updated) : new Date();
      const remoteChanged = !link || remoteUpdatedAt.getTime() > link.googleUpdatedAt.getTime();
      const localChanged =
        !!link &&
        !!local &&
        (local.updatedAt.getTime() > link.localUpdatedAt.getTime() || !!local.deletedAt);
      if (link && local) {
        const decision = decide({
          localChanged,
          remoteChanged,
          localUpdatedAt: local.updatedAt,
          remoteUpdatedAt,
        });
        if (decision !== 'pull') {
          if (decision === 'none') stats.unchanged++;
          // Local wins: if Google deleted it, drop the link so the push re-creates it.
          if (decision === 'push' && g.status === 'cancelled')
            await tx
              .delete(googleEventLinks)
              .where(
                and(
                  eq(googleEventLinks.connectionId, conn.id),
                  eq(googleEventLinks.eventId, local.id),
                ),
              );
          continue;
        }
      }
      const mapped = googleToLocal(g, tz);
      if (!mapped) {
        // Deleted (or unusable) on Google.
        if (link && local && !local.deletedAt) {
          await tx.update(events).set({ deletedAt: new Date() }).where(eq(events.id, local.id));
          stats.deleted++;
          changed = true;
        }
        if (link)
          await tx
            .delete(googleEventLinks)
            .where(
              and(
                eq(googleEventLinks.connectionId, conn.id),
                eq(googleEventLinks.googleEventId, g.id),
              ),
            );
        continue;
      }
      const values = {
        title: mapped.title,
        description: mapped.description,
        location: mapped.location,
        startAt: mapped.start,
        endAt: mapped.end,
        allDay: mapped.allDay,
        timezone: mapped.timezone,
        rrule: mapped.rrule,
        seriesEndAt: seriesEndOf(mapped),
        deletedAt: null,
      };
      let row: EventRow | undefined;
      if (link && local) {
        [row] = await tx.update(events).set(values).where(eq(events.id, local.id)).returning();
        // Cancelled occurrences mirror Google's EXDATEs; moved occurrences stay.
        await tx
          .delete(eventExceptions)
          .where(and(eq(eventExceptions.eventId, local.id), eq(eventExceptions.cancelled, true)));
        stats.updated++;
      } else {
        [row] = await tx
          .insert(events)
          .values({
            householdId: conn.householdId,
            calendarId: conn.calendarId,
            ...values,
            createdByMemberId: conn.memberId,
          })
          .returning();
        stats.created++;
      }
      if (!row) throw new Error('event write failed');
      if (mapped.exdates.length > 0)
        await tx
          .insert(eventExceptions)
          .values(
            mapped.exdates.map((d) => ({
              householdId: conn.householdId,
              eventId: row.id,
              originalStart: d,
              cancelled: true,
            })),
          )
          .onConflictDoUpdate({
            target: [eventExceptions.eventId, eventExceptions.originalStart],
            set: { cancelled: true },
          });
      const linkValues = {
        etag: g.etag ?? null,
        googleUpdatedAt: remoteUpdatedAt,
        localUpdatedAt: row.updatedAt,
        exceptionsHash: exceptionsHash(mapped.exdates),
      };
      await tx
        .insert(googleEventLinks)
        .values({
          householdId: conn.householdId,
          connectionId: conn.id,
          eventId: row.id,
          googleEventId: g.id,
          ...linkValues,
        })
        .onConflictDoUpdate({
          target: [googleEventLinks.connectionId, googleEventLinks.eventId],
          set: linkValues,
        });
      links.set(g.id, {
        ...linkValues,
        householdId: conn.householdId,
        connectionId: conn.id,
        eventId: row.id,
        googleEventId: g.id,
      });
      locals.set(row.id, row);
      touchedMasters.add(row.id);
      changed = true;
    }

    // Changed single occurrences of recurring events → exceptions of the local series.
    for (const g of items.filter((i) => i.recurringEventId)) {
      const master = links.get(g.recurringEventId as string);
      const original = googleTime(g.originalStartTime);
      if (!master || !original) continue;
      const mapped = googleToLocal(g, tz);
      const values = mapped
        ? {
            cancelled: false,
            startAt: mapped.start,
            endAt: mapped.end,
            overrides: {
              title: mapped.title,
              description: mapped.description,
              location: mapped.location,
            },
          }
        : { cancelled: true, startAt: null, endAt: null, overrides: null };
      const [current] = await tx
        .select()
        .from(eventExceptions)
        .where(
          and(
            eq(eventExceptions.eventId, master.eventId),
            eq(eventExceptions.originalStart, original.date),
          ),
        );
      const same =
        current?.cancelled === values.cancelled &&
        (current.startAt?.getTime() ?? null) === (values.startAt?.getTime() ?? null) &&
        (current.endAt?.getTime() ?? null) === (values.endAt?.getTime() ?? null) &&
        JSON.stringify(effective(current.overrides, locals.get(master.eventId))) ===
          JSON.stringify(effective(values.overrides, locals.get(master.eventId)));
      if (same) {
        stats.unchanged++;
        continue;
      }
      await tx
        .insert(eventExceptions)
        .values({
          householdId: conn.householdId,
          eventId: master.eventId,
          originalStart: original.date,
          ...values,
        })
        .onConflictDoUpdate({
          target: [eventExceptions.eventId, eventExceptions.originalStart],
          set: values,
        });
      touchedMasters.add(master.eventId);
      stats.updated++;
      changed = true;
    }
    // Pulled exceptions now match Google: record them so the push doesn't echo them back.
    for (const eventId of touchedMasters) {
      const exs = await tx
        .select()
        .from(eventExceptions)
        .where(eq(eventExceptions.eventId, eventId));
      await tx
        .update(googleEventLinks)
        .set({ exceptionsHash: hashOf(exs) })
        .where(
          and(eq(googleEventLinks.connectionId, conn.id), eq(googleEventLinks.eventId, eventId)),
        );
    }
    if (changed) ev.changed('event', null, 'updated', conn.calendarId);
    return stats;
  }

  private async push(actor: Actor, conn: ConnectionRow, token: string): Promise<SyncStats> {
    const stats = emptyStats();
    const { rows, links, exceptions } = await this.db.tenant(actor, async (tx) => {
      const rows = await tx.select().from(events).where(eq(events.calendarId, conn.calendarId));
      const links = await tx
        .select()
        .from(googleEventLinks)
        .where(eq(googleEventLinks.connectionId, conn.id));
      const ids = rows.map((r) => r.id);
      const exceptions = ids.length
        ? await tx.select().from(eventExceptions).where(inArray(eventExceptions.eventId, ids))
        : [];
      return { rows, links, exceptions };
    });
    const linkByEvent = new Map(links.map((l) => [l.eventId, l]));
    const exceptionsBy = new Map<string, ExceptionRow[]>();
    for (const x of exceptions)
      exceptionsBy.set(x.eventId, [...(exceptionsBy.get(x.eventId) ?? []), x]);

    for (const e of rows) {
      const link = linkByEvent.get(e.id);
      const exs = e.rrule ? (exceptionsBy.get(e.id) ?? []) : [];
      const exdates = exs.filter((x) => x.cancelled).map((x) => x.originalStart);
      const overrides = overridesOf(exs);
      const hash = hashOf(exs);
      if (e.deletedAt) {
        if (!link) continue;
        await this.api.deleteEvent(token, conn.googleCalendarId, link.googleEventId);
        await this.saveLink(actor, conn, e, null, link);
        stats.deleted++;
        continue;
      }
      const synced = {
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        start: e.startAt,
        end: e.endAt,
        allDay: e.allDay,
        timezone: e.timezone,
        rrule: e.rrule,
      };
      // Moved/retitled occurrences become Google instance exceptions (PUTs are idempotent).
      const pushOverrides = async (googleEventId: string) => {
        for (const o of overrides) {
          const { originalStart, body } = overrideToGoogle(synced, o);
          await this.api.updateInstance(
            token,
            conn.googleCalendarId,
            googleEventId,
            originalStart,
            body,
          );
        }
      };
      const body = localToGoogle(synced, exdates);
      if (!link) {
        const g = await this.api.insertEvent(token, conn.googleCalendarId, body);
        await pushOverrides(g.id);
        await this.saveLink(actor, conn, e, { g, hash }, null);
        stats.created++;
      } else if (
        e.updatedAt.getTime() > link.localUpdatedAt.getTime() ||
        link.exceptionsHash !== hash
      ) {
        const g = await this.api.updateEvent(
          token,
          conn.googleCalendarId,
          link.googleEventId,
          body,
        );
        await pushOverrides(link.googleEventId);
        await this.saveLink(actor, conn, e, { g, hash }, link);
        stats.updated++;
      } else stats.unchanged++;
    }
    return stats;
  }

  private async saveLink(
    actor: Actor,
    conn: ConnectionRow,
    e: EventRow,
    pushed: { g: GoogleEvent; hash: string } | null,
    link: LinkRow | null,
  ): Promise<void> {
    await this.db.tenant(actor, async (tx) => {
      if (!pushed) {
        await tx
          .delete(googleEventLinks)
          .where(
            and(eq(googleEventLinks.connectionId, conn.id), eq(googleEventLinks.eventId, e.id)),
          );
        return;
      }
      const values = {
        googleEventId: pushed.g.id,
        etag: pushed.g.etag ?? null,
        googleUpdatedAt: pushed.g.updated ? new Date(pushed.g.updated) : new Date(),
        localUpdatedAt: e.updatedAt,
        exceptionsHash: pushed.hash,
      };
      if (link)
        await tx
          .update(googleEventLinks)
          .set(values)
          .where(
            and(eq(googleEventLinks.connectionId, conn.id), eq(googleEventLinks.eventId, e.id)),
          );
      else
        await tx.insert(googleEventLinks).values({
          householdId: conn.householdId,
          connectionId: conn.id,
          eventId: e.id,
          ...values,
        });
    });
  }

  private async markFailure(actor: Actor, conn: ConnectionRow, e: unknown): Promise<void> {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const revoked = e instanceof GoogleApiError && (e.status === 400 || e.status === 401);
    const failures = conn.failureCount + 1;
    const notify = (revoked || failures >= NOTIFY_AFTER_FAILURES) && !conn.failureNotifiedAt;
    if (!(e instanceof GoogleApiError) && !(e instanceof GoogleSyncTokenExpired))
      this.logger.warn(`Google sync ${conn.id} failed: ${message}`);
    await this.db
      .tenant(actor, async (tx, ev) => {
        await tx
          .update(googleCalendarConnections)
          .set({
            status: revoked ? 'revoked' : 'error',
            lastError: message.slice(0, 500),
            failureCount: failures,
            ...(notify ? { failureNotifiedAt: new Date() } : {}),
          })
          .where(eq(googleCalendarConnections.id, conn.id));
        ev.changed('calendar_subscription', conn.id, 'updated');
      })
      .catch(() => undefined);
    if (!notify) return;
    const [cal] = await this.db.system
      .select({ name: calendars.name })
      .from(calendars)
      .where(eq(calendars.id, conn.calendarId));
    await this.notifications
      .notify({
        householdId: conn.householdId,
        memberIds: [conn.memberId],
        type: 'calendar.sync_failed',
        message: 'notifications.calendarSyncFailed',
        vars: { name: cal?.name ?? 'Google Calendar' },
        link: `/calendar?calendarId=${conn.calendarId}`,
      })
      .catch(() => undefined);
  }
}
