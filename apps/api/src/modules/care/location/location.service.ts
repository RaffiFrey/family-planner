import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  apiContract,
  GeoPlace as GeoPlaceDto,
  LocationShare as LocationShareDto,
} from '@fp/contracts';
import {
  householdMembers,
  locationPings,
  locationShares,
  placePresence,
  places,
  placeSubscriptions,
  type Transaction,
} from '@fp/db';
import { evaluateGeofence } from '@fp/domain/care';
import { can, type Module } from '@fp/domain/permissions';
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { type In, iso, OK, type Out } from '../../../common/contract.js';
import { badRequest, conflict, forbidden, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { Db } from '../../../infra/database.js';
import { Queues } from '../../events/queues.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { assertMembers } from '../shared.js';

type C = typeof apiContract.location;
type ShareRow = typeof locationShares.$inferSelect;
type PlaceRow = typeof places.$inferSelect;

const HISTORY_MS = 24 * 3600_000;
const MAX_PING_AGE_MS = 3600_000;
const FUTURE_TOLERANCE_MS = 2 * 60_000;

export interface GeofenceEvent {
  householdId: string;
  memberId: string;
  placeId: string;
  event: 'arrived' | 'left';
}

function isActive(s: ShareRow | undefined | null, now = new Date()): s is ShareRow {
  return !!s && s.active && s.until > now;
}

/** "Everyone" excludes children: adults have to share with a child explicitly. */
function sharesWith(s: ShareRow, viewer: { id: string; role: string }): boolean {
  if (s.memberId === viewer.id) return true;
  if (s.sharedWith) return s.sharedWith.includes(viewer.id);
  return viewer.role !== 'child';
}

function toShare(s: ShareRow, now = new Date()): LocationShareDto {
  return {
    memberId: s.memberId,
    active: isActive(s, now),
    sharedWith: s.sharedWith,
    startedAt: iso(s.startedAt),
    until: iso(s.until),
  };
}

function toPlace(p: PlaceRow): GeoPlaceDto {
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    radiusM: p.radiusM,
    createdByMemberId: p.createdByMemberId,
    createdAt: iso(p.createdAt),
  };
}

@Injectable()
export class LocationService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly queues: Queues,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.queues.on('events', 'location.geofence', (job) =>
      this.handleGeofenceEvent(job.data as GeofenceEvent),
    );
  }

  private async myShare(tx: Transaction, memberId: string): Promise<ShareRow | undefined> {
    const [s] = await tx.select().from(locationShares).where(eq(locationShares.memberId, memberId));
    return s;
  }

  /** Active shares visible to the viewer. */
  private async visibleShares(
    tx: Transaction,
    viewer: { id: string; role: string },
  ): Promise<ShareRow[]> {
    const now = new Date();
    const rows = await tx
      .select()
      .from(locationShares)
      .where(and(eq(locationShares.active, true), gt(locationShares.until, now)));
    return rows.filter((s) => sharesWith(s, viewer));
  }

  // ------------------------------------------------------------------ sharing

  async getMyShare(ctx: HouseholdContext): Promise<Out<C['myShare']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const s = await this.myShare(tx, ctx.member.id);
      return s ? toShare(s) : null;
    });
  }

  async startSharing(
    ctx: HouseholdContext,
    input: In<C['startSharing']>,
  ): Promise<Out<C['startSharing']>> {
    const b = input.body;
    const now = new Date();
    const until = new Date(now.getTime() + b.durationMinutes * 60_000);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, b.sharedWith ?? []);
      const sharedWith = b.sharedWith ? [...new Set(b.sharedWith)] : null;
      const [s] = await tx
        .insert(locationShares)
        .values({
          householdId: ctx.householdId,
          memberId: ctx.member.id,
          sharedWith,
          startedAt: now,
          until,
          active: true,
        })
        .onConflictDoUpdate({
          target: [locationShares.householdId, locationShares.memberId],
          set: { sharedWith, startedAt: now, until, active: true },
        })
        .returning();
      if (!s) throw new Error('upsert failed');
      ev.changed('location', ctx.member.id, 'updated');
      ev.audit('location.sharing_started', 'location', ctx.member.id, {
        until: iso(until),
        sharedWith,
      });
      return toShare(s, now);
    });
  }

  async stopSharing(ctx: HouseholdContext): Promise<Out<C['stopSharing']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx
        .update(locationShares)
        .set({ active: false })
        .where(eq(locationShares.memberId, ctx.member.id));
      await tx.delete(locationPings).where(eq(locationPings.memberId, ctx.member.id));
      await tx.delete(placePresence).where(eq(placePresence.memberId, ctx.member.id));
      ev.changed('location', ctx.member.id, 'deleted');
      ev.audit('location.sharing_stopped', 'location', ctx.member.id);
    });
    return OK;
  }

  async ping(ctx: HouseholdContext, input: In<C['ping']>): Promise<Out<C['ping']>> {
    const b = input.body;
    const now = new Date();
    const at = b.at ? new Date(b.at) : now;
    if (
      at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ||
      at.getTime() < now.getTime() - MAX_PING_AGE_MS
    )
      throw badRequest('The fix is too old or in the future', 'invalid_fix_time');
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const share = await this.myShare(tx, ctx.member.id);
      if (!isActive(share, now))
        throw conflict('Location sharing is not active', 'location_not_shared');
      await tx.insert(locationPings).values({
        householdId: ctx.householdId,
        memberId: ctx.member.id,
        lat: b.lat,
        lng: b.lng,
        accuracyM: b.accuracyM,
        at,
      });
      const placeRows = await tx.select().from(places);
      const presence = await tx
        .select()
        .from(placePresence)
        .where(eq(placePresence.memberId, ctx.member.id));
      const state = new Map(presence.map((p) => [p.placeId, p.state]));
      const events: { placeId: string; placeName: string; event: 'arrived' | 'left' }[] = [];
      for (const place of placeRows) {
        const prev = state.get(place.id) ?? null;
        const result = evaluateGeofence(prev, place, {
          lat: b.lat,
          lng: b.lng,
          accuracyM: b.accuracyM,
        });
        if (result.state && result.state !== prev) {
          await tx
            .insert(placePresence)
            .values({
              householdId: ctx.householdId,
              placeId: place.id,
              memberId: ctx.member.id,
              state: result.state,
              changedAt: at,
            })
            .onConflictDoUpdate({
              target: [placePresence.placeId, placePresence.memberId],
              set: { state: result.state, changedAt: at },
            });
        }
        if (result.event) {
          events.push({ placeId: place.id, placeName: place.name, event: result.event });
          ev.emit('location.geofence', {
            memberId: ctx.member.id,
            placeId: place.id,
            event: result.event,
          });
        }
      }
      ev.changed('location', ctx.member.id, 'updated');
      return { ok: true as const, events };
    });
  }

  async latest(ctx: HouseholdContext): Promise<Out<C['latest']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const shares = await this.visibleShares(tx, ctx.member);
      if (shares.length === 0) return [];
      const ids = shares.map((s) => s.memberId);
      const since = new Date(Date.now() - HISTORY_MS);
      const pings = await tx
        .selectDistinctOn([locationPings.memberId])
        .from(locationPings)
        .where(and(inArray(locationPings.memberId, ids), gt(locationPings.at, since)))
        .orderBy(locationPings.memberId, desc(locationPings.at));
      const inside = await tx
        .select()
        .from(placePresence)
        .where(and(inArray(placePresence.memberId, ids), eq(placePresence.state, 'inside')));
      return pings.map((p) => {
        const share = shares.find((s) => s.memberId === p.memberId) as ShareRow;
        return {
          memberId: p.memberId,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          at: iso(p.at),
          until: iso(share.until),
          placeIds: inside.filter((i) => i.memberId === p.memberId).map((i) => i.placeId),
        };
      });
    });
  }

  async history(ctx: HouseholdContext, input: In<C['history']>): Promise<Out<C['history']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const shares = await this.visibleShares(tx, ctx.member);
      if (!shares.some((s) => s.memberId === input.params.memberId)) throw notFound('Location');
      const rows = await tx
        .select()
        .from(locationPings)
        .where(
          and(
            eq(locationPings.memberId, input.params.memberId),
            gt(locationPings.at, new Date(Date.now() - HISTORY_MS)),
          ),
        )
        .orderBy(asc(locationPings.at));
      return rows.map((p) => ({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, at: iso(p.at) }));
    });
  }

  // ------------------------------------------------------------------ places

  private assertCanManagePlaces(ctx: HouseholdContext): void {
    if (ctx.member.role === 'child') throw forbidden('Children cannot manage places');
  }

  async listPlaces(ctx: HouseholdContext): Promise<Out<C['places']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx.select().from(places).orderBy(asc(places.name));
      return rows.map(toPlace);
    });
  }

  async createPlace(
    ctx: HouseholdContext,
    input: In<C['places']['create']>,
  ): Promise<Out<C['places']['create']>> {
    this.assertCanManagePlaces(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [p] = await tx
        .insert(places)
        .values({ householdId: ctx.householdId, ...input.body, createdByMemberId: ctx.member.id })
        .returning();
      if (!p) throw new Error('insert failed');
      ev.changed('place', p.id, 'created');
      return toPlace(p);
    });
  }

  async updatePlace(
    ctx: HouseholdContext,
    input: In<C['places']['update']>,
  ): Promise<Out<C['places']['update']>> {
    this.assertCanManagePlaces(ctx);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [p] = await tx
        .update(places)
        .set(input.body)
        .where(eq(places.id, input.params.placeId))
        .returning();
      if (!p) throw notFound('Place');
      // Geometry changed: re-learn presence silently from the next fixes.
      if (
        input.body.lat !== undefined ||
        input.body.lng !== undefined ||
        input.body.radiusM !== undefined
      )
        await tx.delete(placePresence).where(eq(placePresence.placeId, p.id));
      ev.changed('place', p.id, 'updated');
      return toPlace(p);
    });
  }

  async removePlace(
    ctx: HouseholdContext,
    input: In<C['places']['remove']>,
  ): Promise<Out<C['places']['remove']>> {
    this.assertCanManagePlaces(ctx);
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [p] = await tx.delete(places).where(eq(places.id, input.params.placeId)).returning();
      if (!p) throw notFound('Place');
      ev.changed('place', p.id, 'deleted');
    });
    return OK;
  }

  // ------------------------------------------------------------------ subscriptions

  async listSubscriptions(ctx: HouseholdContext): Promise<Out<C['subscriptions']['list']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(placeSubscriptions)
        .where(eq(placeSubscriptions.subscriberMemberId, ctx.member.id))
        .orderBy(asc(placeSubscriptions.createdAt));
      return rows.map((s) => ({
        id: s.id,
        placeId: s.placeId,
        targetMemberId: s.targetMemberId,
        createdAt: iso(s.createdAt),
      }));
    });
  }

  async subscribe(
    ctx: HouseholdContext,
    input: In<C['subscriptions']['create']>,
  ): Promise<Out<C['subscriptions']['create']>> {
    const target = input.body.targetMemberId;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [place] = await tx.select().from(places).where(eq(places.id, input.params.placeId));
      if (!place) throw notFound('Place');
      await assertMembers(tx, [target]);
      const [existing] = await tx
        .select()
        .from(placeSubscriptions)
        .where(
          and(
            eq(placeSubscriptions.placeId, place.id),
            eq(placeSubscriptions.subscriberMemberId, ctx.member.id),
            target
              ? eq(placeSubscriptions.targetMemberId, target)
              : isNull(placeSubscriptions.targetMemberId),
          ),
        );
      const [s] = existing
        ? [existing]
        : await tx
            .insert(placeSubscriptions)
            .values({
              householdId: ctx.householdId,
              placeId: place.id,
              subscriberMemberId: ctx.member.id,
              targetMemberId: target,
            })
            .returning();
      if (!s) throw new Error('insert failed');
      ev.changed('place', place.id, 'updated');
      return {
        id: s.id,
        placeId: s.placeId,
        targetMemberId: s.targetMemberId,
        createdAt: iso(s.createdAt),
      };
    });
  }

  async unsubscribe(
    ctx: HouseholdContext,
    input: In<C['subscriptions']['remove']>,
  ): Promise<Out<C['subscriptions']['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [s] = await tx
        .delete(placeSubscriptions)
        .where(
          and(
            eq(placeSubscriptions.id, input.params.subscriptionId),
            eq(placeSubscriptions.subscriberMemberId, ctx.member.id),
          ),
        )
        .returning();
      if (!s) throw notFound('Subscription');
      ev.changed('place', s.placeId, 'updated');
    });
    return OK;
  }

  // ------------------------------------------------------------------ workers

  /** Notifies subscribers that may see the member's location about an arrival/departure. */
  async handleGeofenceEvent(e: GeofenceEvent): Promise<number> {
    const [place] = await this.db.system
      .select()
      .from(places)
      .where(and(eq(places.id, e.placeId), eq(places.householdId, e.householdId)));
    if (!place) return 0;
    const [share] = await this.db.system
      .select()
      .from(locationShares)
      .where(
        and(eq(locationShares.householdId, e.householdId), eq(locationShares.memberId, e.memberId)),
      );
    if (!share) return 0;
    const subs = await this.db.system
      .select()
      .from(placeSubscriptions)
      .where(
        and(
          eq(placeSubscriptions.placeId, place.id),
          ne(placeSubscriptions.subscriberMemberId, e.memberId),
          or(
            isNull(placeSubscriptions.targetMemberId),
            eq(placeSubscriptions.targetMemberId, e.memberId),
          ),
        ),
      );
    if (subs.length === 0) return 0;
    const members = await this.db.system
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, e.householdId),
          isNull(householdMembers.removedAt),
          inArray(householdMembers.id, [e.memberId, ...subs.map((s) => s.subscriberMemberId)]),
        ),
      );
    const subject = members.find((m) => m.id === e.memberId);
    if (!subject) return 0;
    const recipients = members.filter(
      (m) =>
        m.id !== e.memberId &&
        sharesWith(share, m) &&
        can(
          {
            memberId: m.id,
            role: m.role,
            grantedModules: m.grantedModules as Module[] | null,
            accessUntil: m.accessUntil,
          },
          'location.read',
        ),
    );
    if (recipients.length === 0) return 0;
    const arrived = e.event === 'arrived';
    await this.notifications.notify({
      householdId: e.householdId,
      memberIds: recipients.map((m) => m.id),
      type: arrived ? 'location.arrived' : 'location.left',
      message: arrived ? 'notifications.placeArrived' : 'notifications.placeLeft',
      vars: { member: subject.displayName, place: place.name },
      link: '/location',
    });
    return recipients.length;
  }

  /**
   * Retention: ends expired shares, deletes history of inactive shares and pings older than
   * 24 h (keeping only the latest fix of members still sharing).
   */
  async retention(now = new Date()): Promise<void> {
    await this.db.system
      .update(locationShares)
      .set({ active: false })
      .where(and(eq(locationShares.active, true), lte(locationShares.until, now)));
    await this.db.system.execute(sql`
      delete from ${placePresence} pp
      where not exists (
        select 1 from ${locationShares} s
        where s.member_id = pp.member_id and s.household_id = pp.household_id and s.active
      )`);
    await this.db.system.execute(sql`
      delete from ${locationPings} p
      where not exists (
        select 1 from ${locationShares} s
        where s.member_id = p.member_id and s.household_id = p.household_id and s.active
      )`);
    const cutoff = new Date(now.getTime() - HISTORY_MS);
    await this.db.system.execute(sql`
      delete from ${locationPings} p
      where p.at < ${cutoff}
        and exists (
          select 1 from ${locationPings} newer
          where newer.member_id = p.member_id and newer.household_id = p.household_id
            and newer.at > p.at
        )`);
  }
}
