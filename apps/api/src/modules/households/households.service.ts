import { Injectable } from '@nestjs/common';
import type { apiContract } from '@fp/contracts';
import {
  auditLog,
  calendars,
  gdprRequests,
  householdMembers,
  households,
  invitations,
  lists,
  subscriptions,
  supportAccessGrants,
  user,
} from '@fp/db';
import { assignableRoles, type MemberRole } from '@fp/domain/permissions';
import { isValidTimeZone } from '@fp/domain/time';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import { badRequest, conflict, forbidden, notFound, planLimit } from '../../common/errors.js';
import { decodeCursor, toPage } from '../../common/pagination.js';
import { actorOf, type HouseholdContext, type UserContext } from '../../common/request-context.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db } from '../../infra/database.js';
import { entitlementsFor } from '../billing/entitlements.js';
import { MEMBER_COLORS, toHousehold, toMember } from './mappers.js';

type C = typeof apiContract.households;
const INVITE_TTL_DAYS = 14;

@Injectable()
export class HouseholdsService {
  constructor(private readonly db: Db) {}

  async me(u: UserContext): Promise<Out<C['me']>> {
    const [row] = await this.db.system.select().from(user).where(eq(user.id, u.userId)).limit(1);
    if (!row) throw notFound('User');
    const memberships = await this.db.system
      .select({ member: householdMembers, household: households })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(
        and(
          eq(householdMembers.userId, u.userId),
          isNull(householdMembers.removedAt),
          isNull(households.deletedAt),
        ),
      )
      .orderBy(householdMembers.joinedAt);
    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        locale: row.locale === 'en' ? 'en' : 'de',
        image: row.image,
      },
      memberships: memberships.map((m) => ({
        household: toHousehold(m.household),
        member: toMember(m.member),
      })),
    };
  }

  async updateMe(u: UserContext, input: In<C['updateMe']>): Promise<Out<C['updateMe']>> {
    const [row] = await this.db.system
      .update(user)
      .set({ ...input.body, updatedAt: new Date() })
      .where(eq(user.id, u.userId))
      .returning();
    if (!row) throw notFound('User');
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      locale: row.locale === 'en' ? 'en' : 'de',
      image: row.image,
    };
  }

  async requestExport(u: UserContext): Promise<Out<C['exportMyData']>> {
    const [pending] = await this.db.system
      .select({ id: gdprRequests.id })
      .from(gdprRequests)
      .where(
        and(
          eq(gdprRequests.userId, u.userId),
          eq(gdprRequests.type, 'export'),
          eq(gdprRequests.status, 'pending'),
        ),
      )
      .limit(1);
    if (!pending)
      await this.db.system.insert(gdprRequests).values({ userId: u.userId, type: 'export' });
    return OK;
  }

  /** Account deletion with a 30-day grace period; a daily job performs it (GDPR Art. 17). */
  async scheduleDeletion(u: UserContext): Promise<Out<C['deleteMe']>> {
    const owned = await this.db.system
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, u.userId),
          eq(householdMembers.role, 'owner'),
          isNull(householdMembers.removedAt),
        ),
      );
    for (const { householdId } of owned) {
      const [other] = await this.db.system
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            isNull(householdMembers.removedAt),
            sql`${householdMembers.userId} is not null and ${householdMembers.userId} <> ${u.userId}`,
          ),
        )
        .limit(1);
      if (other) {
        throw conflict(
          'Transfer ownership of your households before deleting your account',
          'owner_must_transfer',
        );
      }
    }
    const at = new Date(Date.now() + 30 * 86_400_000);
    await this.db.system.update(user).set({ deletionScheduledAt: at }).where(eq(user.id, u.userId));
    await this.db.system.insert(gdprRequests).values({ userId: u.userId, type: 'deletion' });
    return { deletionScheduledAt: iso(at) };
  }

  async create(u: UserContext, input: In<C['create']>): Promise<Out<C['create']>> {
    const b = input.body;
    if (!isValidTimeZone(b.timezone)) throw badRequest('Unknown time zone', 'invalid_timezone');
    const householdId = uuidv7();
    const memberId = uuidv7();
    const actor = { householdId, memberId, userId: u.userId };
    await this.db.tenant(actor, async (tx, events) => {
      await tx.insert(households).values({
        id: householdId,
        name: b.name,
        timezone: b.timezone,
        currency: b.currency,
        locale: b.locale,
      });
      await tx.insert(householdMembers).values({
        id: memberId,
        householdId,
        userId: u.userId,
        displayName: b.displayName,
        role: 'owner',
        color: b.color ?? MEMBER_COLORS[5] ?? '#3b82f6',
      });
      await tx.insert(subscriptions).values({ householdId });
      // Sensible defaults so the app isn't empty on first open.
      await tx.insert(calendars).values({
        householdId,
        name: b.locale === 'en' ? 'Family' : 'Familie',
        color: '#3b82f6',
        ownerMemberId: memberId,
      });
      await tx.insert(lists).values({
        householdId,
        name: b.locale === 'en' ? 'Groceries' : 'Einkauf',
        kind: 'shopping',
        ownerMemberId: memberId,
      });
      events.audit('household.created', 'household', householdId, { name: b.name });
    });
    return this.detail(actor, memberId);
  }

  async get(ctx: HouseholdContext): Promise<Out<C['get']>> {
    return this.detail(actorOf(ctx), ctx.member.id);
  }

  private async detail(
    actor: { householdId: string; memberId: string; userId: string },
    meId: string,
  ) {
    return this.db.tenant(actor, async (tx) => {
      const [h] = await tx.select().from(households).where(eq(households.id, actor.householdId));
      if (!h) throw notFound('Household');
      const members = await tx
        .select()
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, actor.householdId),
            isNull(householdMembers.removedAt),
          ),
        )
        .orderBy(householdMembers.joinedAt);
      const me = members.find((m) => m.id === meId);
      if (!me) throw notFound('Member');
      return { household: toHousehold(h), members: members.map(toMember), me: toMember(me) };
    });
  }

  async update(ctx: HouseholdContext, input: In<C['update']>): Promise<Out<C['update']>> {
    if (input.body.timezone && !isValidTimeZone(input.body.timezone))
      throw badRequest('Unknown time zone', 'invalid_timezone');
    return this.db.tenant(actorOf(ctx), async (tx, events) => {
      const [h] = await tx
        .update(households)
        .set(input.body)
        .where(eq(households.id, ctx.householdId))
        .returning();
      if (!h) throw notFound('Household');
      events.changed('household', h.id, 'updated');
      events.audit('household.updated', 'household', h.id, input.body);
      return toHousehold(h);
    });
  }

  async remove(ctx: HouseholdContext): Promise<Out<C['remove']>> {
    await this.db.tenant(actorOf(ctx), async (tx, events) => {
      await tx
        .update(households)
        .set({ deletedAt: new Date() })
        .where(eq(households.id, ctx.householdId));
      events.changed('household', ctx.householdId, 'deleted');
      events.audit('household.deleted', 'household', ctx.householdId);
      events.emit('household.deleted', {});
    });
    return OK;
  }

  async updateMember(
    ctx: HouseholdContext,
    input: In<C['updateMember']>,
  ): Promise<Out<C['updateMember']>> {
    const { memberId } = input.params;
    const b = input.body;
    const isSelf = memberId === ctx.member.id;
    const managing =
      b.role !== undefined || b.grantedModules !== undefined || b.accessUntil !== undefined;
    const canManage = ['owner', 'admin'].includes(ctx.member.role);
    if (!isSelf && !canManage) throw forbidden();
    if (managing && !canManage) throw forbidden('Only admins can change roles and access');
    return this.db.tenant(actorOf(ctx), async (tx, events) => {
      const [target] = await tx
        .select()
        .from(householdMembers)
        .where(and(eq(householdMembers.id, memberId), isNull(householdMembers.removedAt)));
      if (!target) throw notFound('Member');
      if (b.role !== undefined && b.role !== target.role) {
        if (target.role === 'owner') throw forbidden('The owner role cannot be changed here');
        if (!assignableRoles(ctx.member.role).includes(b.role))
          throw forbidden('You cannot assign this role');
        if (target.userId === null && !['child', 'teen'].includes(b.role))
          throw badRequest('Managed profiles can only be child or teen');
      }
      const [row] = await tx
        .update(householdMembers)
        .set({
          ...(b.displayName !== undefined ? { displayName: b.displayName } : {}),
          ...(b.role !== undefined ? { role: b.role } : {}),
          ...(b.color !== undefined ? { color: b.color } : {}),
          ...(b.birthday !== undefined ? { birthday: b.birthday } : {}),
          ...(b.grantedModules !== undefined ? { grantedModules: b.grantedModules } : {}),
          ...(b.accessUntil !== undefined
            ? { accessUntil: b.accessUntil ? new Date(b.accessUntil) : null }
            : {}),
        })
        .where(eq(householdMembers.id, memberId))
        .returning();
      if (!row) throw notFound('Member');
      events.changed('member', row.id, 'updated');
      events.audit('member.updated', 'member', row.id, b);
      return toMember(row);
    });
  }

  async removeMember(
    ctx: HouseholdContext,
    input: In<C['removeMember']>,
  ): Promise<Out<C['removeMember']>> {
    const { memberId } = input.params;
    const isSelf = memberId === ctx.member.id;
    if (!isSelf && !['owner', 'admin'].includes(ctx.member.role)) throw forbidden();
    await this.db.tenant(actorOf(ctx), async (tx, events) => {
      const [target] = await tx
        .select()
        .from(householdMembers)
        .where(and(eq(householdMembers.id, memberId), isNull(householdMembers.removedAt)));
      if (!target) throw notFound('Member');
      if (target.role === 'owner')
        throw conflict(
          'The owner cannot leave; transfer ownership or delete the household',
          'owner_cannot_leave',
        );
      if (!isSelf && target.role === 'admin' && ctx.member.role !== 'owner')
        throw forbidden('Only the owner can remove admins');
      await tx
        .update(householdMembers)
        .set({ removedAt: new Date() })
        .where(eq(householdMembers.id, memberId));
      events.changed('member', memberId, 'deleted');
      events.audit(isSelf ? 'member.left' : 'member.removed', 'member', memberId, {
        displayName: target.displayName,
      });
    });
    return OK;
  }

  async createManagedMember(
    ctx: HouseholdContext,
    input: In<C['createManagedMember']>,
  ): Promise<Out<C['createManagedMember']>> {
    return this.db.tenant(actorOf(ctx), async (tx, events) => {
      await this.assertMemberLimit(tx, ctx);
      const [row] = await tx
        .insert(householdMembers)
        .values({
          householdId: ctx.householdId,
          userId: null,
          displayName: input.body.displayName,
          role: input.body.role,
          color: input.body.color ?? MEMBER_COLORS[2] ?? '#eab308',
          isManaged: true,
          birthday: input.body.birthday ?? null,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      events.changed('member', row.id, 'created');
      events.audit('member.managed_created', 'member', row.id, { displayName: row.displayName });
      return toMember(row);
    });
  }

  private async assertMemberLimit(
    tx: Parameters<Parameters<Db['tenant']>[1]>[0],
    ctx: HouseholdContext,
  ): Promise<void> {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.householdId, ctx.householdId), isNull(householdMembers.removedAt)),
      );
    const max = entitlementsFor(ctx.household.plan).maxMembers;
    if ((count?.n ?? 0) >= max) throw planLimit(`Your plan allows ${max} members`);
  }

  async listInvitations(ctx: HouseholdContext): Promise<Out<C['listInvitations']>> {
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(invitations)
        .where(
          and(
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invitations.createdAt));
      return rows.map(toInvitation);
    });
  }

  async createInvitation(
    ctx: HouseholdContext,
    input: In<C['createInvitation']>,
  ): Promise<Out<C['createInvitation']>> {
    const b = input.body;
    if (!assignableRoles(ctx.member.role).includes(b.role))
      throw forbidden('You cannot invite with this role');
    if (b.role === 'caregiver' && (!b.grantedModules || b.grantedModules.length === 0)) {
      throw badRequest('Caregiver invitations need at least one module', 'modules_required');
    }
    return this.db.tenant(actorOf(ctx), async (tx, events) => {
      await this.assertMemberLimit(tx, ctx);
      const [row] = await tx
        .insert(invitations)
        .values({
          householdId: ctx.householdId,
          token: CryptoService.token(24),
          role: b.role,
          email: b.email ?? null,
          grantedModules: b.grantedModules ?? null,
          accessUntil: b.accessUntil ? new Date(b.accessUntil) : null,
          invitedByMemberId: ctx.member.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        })
        .returning();
      if (!row) throw new Error('insert failed');
      events.audit('invitation.created', 'invitation', row.id, {
        role: b.role,
        email: b.email ?? null,
      });
      if (b.email)
        events.emit('invitation.created', {
          invitationId: row.id,
          email: b.email,
          inviter: ctx.member.displayName,
        });
      return toInvitation(row);
    });
  }

  async revokeInvitation(
    ctx: HouseholdContext,
    input: In<C['revokeInvitation']>,
  ): Promise<Out<C['revokeInvitation']>> {
    await this.db.tenant(actorOf(ctx), async (tx, events) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, input.params.invitationId), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      if (!row) throw notFound('Invitation');
      events.audit('invitation.revoked', 'invitation', row.id);
    });
    return OK;
  }

  private async findValidInvitation(token: string) {
    const [row] = await this.db.system
      .select({
        invitation: invitations,
        household: households,
        inviter: householdMembers.displayName,
      })
      .from(invitations)
      .innerJoin(households, eq(households.id, invitations.householdId))
      .innerJoin(householdMembers, eq(householdMembers.id, invitations.invitedByMemberId))
      .where(eq(invitations.token, token))
      .limit(1);
    const inv = row?.invitation;
    if (
      !row ||
      !inv ||
      inv.revokedAt ||
      inv.acceptedAt ||
      inv.expiresAt <= new Date() ||
      row.household.deletedAt
    ) {
      throw notFound('Invitation');
    }
    return row;
  }

  async previewInvitation(input: In<C['previewInvitation']>): Promise<Out<C['previewInvitation']>> {
    const row = await this.findValidInvitation(input.params.token);
    return {
      householdName: row.household.name,
      invitedBy: row.inviter,
      role: row.invitation.role,
      expiresAt: iso(row.invitation.expiresAt),
    };
  }

  async acceptInvitation(
    u: UserContext,
    input: In<C['acceptInvitation']>,
  ): Promise<Out<C['acceptInvitation']>> {
    const row = await this.findValidInvitation(input.params.token);
    const inv = row.invitation;
    const memberId = uuidv7();
    const actor = { householdId: inv.householdId, memberId, userId: u.userId };
    await this.db.tenant(actor, async (tx, events) => {
      const [existing] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(and(eq(householdMembers.userId, u.userId), isNull(householdMembers.removedAt)));
      if (existing) throw conflict('You are already a member of this household', 'already_member');
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(householdMembers)
        .where(isNull(householdMembers.removedAt));
      if ((count?.n ?? 0) >= entitlementsFor(row.household.plan).maxMembers)
        throw planLimit('This household is full');
      const used = await tx
        .select({ color: householdMembers.color })
        .from(householdMembers)
        .where(isNull(householdMembers.removedAt));
      const color = MEMBER_COLORS.find((c) => !used.some((x) => x.color === c)) ?? '#64748b';
      await tx.insert(householdMembers).values({
        id: memberId,
        householdId: inv.householdId,
        userId: u.userId,
        displayName: input.body.displayName,
        role: inv.role as MemberRole,
        color,
        grantedModules: inv.grantedModules,
        accessUntil: inv.accessUntil,
      });
      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, inv.id));
      events.changed('member', memberId, 'created');
      events.audit('member.joined', 'member', memberId, {
        displayName: input.body.displayName,
        role: inv.role,
      });
      events.emit('household.member_joined', { memberId, displayName: input.body.displayName });
    });
    return this.detail(actor, memberId);
  }

  async audit(ctx: HouseholdContext, input: In<C['audit']>): Promise<Out<C['audit']>> {
    const cursor = decodeCursor(input.query.cursor);
    const limit = input.query.limit;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(auditLog)
        .where(
          cursor
            ? or(
                lt(auditLog.createdAt, new Date(cursor.v)),
                and(eq(auditLog.createdAt, new Date(cursor.v)), lt(auditLog.id, cursor.id)),
              )
            : undefined,
        )
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit + 1);
      return toPage(
        rows,
        limit,
        (r) => ({ v: iso(r.createdAt), id: r.id }),
        (r) => ({
          id: r.id,
          actorMemberId: r.actorMemberId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          data: r.data ?? null,
          createdAt: iso(r.createdAt),
        }),
      );
    });
  }

  private async currentGrant(tx: Parameters<Parameters<Db['tenant']>[1]>[0]) {
    const [g] = await tx
      .select()
      .from(supportAccessGrants)
      .where(
        and(isNull(supportAccessGrants.revokedAt), gt(supportAccessGrants.expiresAt, new Date())),
      )
      .orderBy(desc(supportAccessGrants.expiresAt))
      .limit(1);
    return {
      active: !!g,
      expiresAt: isoOrNull(g?.expiresAt ?? null),
      grantedByMemberId: g?.grantedByMemberId ?? null,
      reason: g?.reason ?? null,
    };
  }

  async getSupportAccess(ctx: HouseholdContext): Promise<Out<C['getSupportAccess']>> {
    return this.db.tenant(actorOf(ctx), (tx) => this.currentGrant(tx));
  }

  /** Customer consent for the support team; replaces any active grant. */
  async grantSupportAccess(
    ctx: HouseholdContext,
    input: In<C['grantSupportAccess']>,
  ): Promise<Out<C['grantSupportAccess']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx
        .update(supportAccessGrants)
        .set({ revokedAt: new Date() })
        .where(isNull(supportAccessGrants.revokedAt));
      const expiresAt = new Date(Date.now() + input.body.hours * 3_600_000);
      await tx.insert(supportAccessGrants).values({
        householdId: ctx.householdId,
        grantedByMemberId: ctx.member.id,
        reason: input.body.reason ?? null,
        expiresAt,
      });
      ev.audit('support_access.granted', 'household', ctx.householdId, { hours: input.body.hours });
      return this.currentGrant(tx);
    });
  }

  async revokeSupportAccess(ctx: HouseholdContext): Promise<Out<C['revokeSupportAccess']>> {
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await tx
        .update(supportAccessGrants)
        .set({ revokedAt: new Date() })
        .where(isNull(supportAccessGrants.revokedAt));
      ev.audit('support_access.revoked', 'household', ctx.householdId);
      return this.currentGrant(tx);
    });
  }
}

function toInvitation(r: typeof invitations.$inferSelect) {
  return {
    id: r.id,
    householdId: r.householdId,
    role: r.role,
    email: r.email,
    token: r.token,
    expiresAt: iso(r.expiresAt),
    createdAt: iso(r.createdAt),
    acceptedAt: isoOrNull(r.acceptedAt),
  };
}
