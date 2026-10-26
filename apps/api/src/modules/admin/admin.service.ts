import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { adminApiContract } from '@fp/contracts';
import {
  announcements,
  auditLog,
  invitations,
  outbox,
  supportAccessGrants,
  events,
  featureFlags,
  files,
  finAccounts,
  finCategories,
  finRules,
  finTransactions,
  gdprRequests,
  householdMembers,
  households,
  lists,
  seedGlobals,
  session,
  staffAuditLog,
  staffSessions,
  staffUsers,
  subscriptions,
  tasks,
  user,
} from '@fp/db';
import { CSV_PRESETS, isValidRegex } from '@fp/domain/finance';
import { hash, verify } from '@node-rs/argon2';
import { and, count, desc, eq, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
  unavailable,
} from '../../common/errors.js';
import { decodeCursor, toPage } from '../../common/pagination.js';
import type { StaffContext } from '../../common/request-context.js';
import { ENV, type Env } from '../../config/env.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db } from '../../infra/database.js';
import { REDIS } from '../../infra/infra.module.js';
import { BillingService } from '../billing/billing.service.js';
import { QUEUE_NAMES, Queues } from '../events/queues.js';
import { toHousehold } from '../households/mappers.js';

type C = typeof adminApiContract.admin;
const SESSION_HOURS = 8;
type StaffRow = typeof staffUsers.$inferSelect;

function toStaff(s: StaffRow) {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    roles: s.roles as ('support' | 'billing' | 'ops' | 'superadmin')[],
    totpEnabled: s.totpEnabled,
    lastLoginAt: isoOrNull(s.lastLoginAt),
  };
}

function search(q: string | undefined): string | null {
  return q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
}

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly db: Db,
    private readonly billing: BillingService,
    private readonly queues: Queues,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Creates the first superadmin from env when no staff exists yet. */
  async onApplicationBootstrap(): Promise<void> {
    const { ADMIN_BOOTSTRAP_EMAIL: email, ADMIN_BOOTSTRAP_PASSWORD: password } = this.env;
    if (!email || !password) return;
    try {
      const [existing] = await this.db.system.select({ n: count() }).from(staffUsers);
      if ((existing?.n ?? 0) > 0) return;
      await this.db.system
        .insert(staffUsers)
        .values({
          email: email.toLowerCase(),
          name: 'Bootstrap Admin',
          passwordHash: await hash(password),
          roles: ['superadmin'],
        })
        .onConflictDoNothing();
      this.logger.warn(`Bootstrapped superadmin ${email}; set up TOTP on first login`);
    } catch (e) {
      this.logger.warn(`Admin bootstrap skipped: ${(e as Error).message}`);
    }
  }

  async audit(
    staff: StaffContext,
    action: string,
    targetType: string,
    targetId: string | null,
    reason: string | null,
    data?: Record<string, unknown>,
  ) {
    await this.db.system
      .insert(staffAuditLog)
      .values({ staffId: staff.staffId, action, targetType, targetId, reason, data: data ?? null });
  }

  // ------------------------------------------------------------ auth

  async login(input: In<C['login']>, ip: string): Promise<Out<C['login']>> {
    const email = input.body.email.toLowerCase();
    const key = `admin-login:${email}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) await this.redis.expire(key, 15 * 60);
    if (attempts > 10)
      throw new AppError(429, 'rate_limited', 'Too Many Requests', 'Too many login attempts');
    const [staff] = await this.db.system
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.email, email));
    if (!staff || staff.disabled || !(await verify(staff.passwordHash, input.body.password))) {
      throw new AppError(401, 'invalid_credentials', 'Unauthorized', 'Invalid email or password');
    }
    if (staff.totpEnabled) {
      if (!input.body.totp)
        throw new AppError(401, 'totp_required', 'Unauthorized', 'Authenticator code required');
      const result = await verifyTotp({
        secret: staff.totpSecret ?? '',
        token: input.body.totp,
        epochTolerance: 30,
      });
      if (!result.valid)
        throw new AppError(401, 'totp_invalid', 'Unauthorized', 'Invalid authenticator code');
    }
    await this.redis.del(key);
    const token = CryptoService.token(32);
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await this.db.system.insert(staffSessions).values({
      staffId: staff.id,
      tokenHash: CryptoService.sha256(token),
      expiresAt,
      ipAddress: ip,
    });
    await this.db.system
      .update(staffUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(staffUsers.id, staff.id));
    await this.db.system.insert(staffAuditLog).values({
      staffId: staff.id,
      action: 'staff.login',
      targetType: 'staff',
      targetId: staff.id,
      reason: null,
      data: { ip },
    });
    return {
      staff: toStaff(staff),
      token,
      expiresAt: iso(expiresAt),
      totpSetupRequired: !staff.totpEnabled,
    };
  }

  private async loadStaff(id: string): Promise<StaffRow> {
    const [s] = await this.db.system.select().from(staffUsers).where(eq(staffUsers.id, id));
    if (!s) throw unauthorized();
    return s;
  }

  async me(staff: StaffContext): Promise<Out<C['me']>> {
    return toStaff(await this.loadStaff(staff.staffId));
  }

  async setupTotp(staff: StaffContext): Promise<Out<C['setupTotp']>> {
    const s = await this.loadStaff(staff.staffId);
    if (s.totpEnabled)
      throw conflict('Two-factor authentication is already enabled', 'totp_enabled');
    const secret = generateSecret();
    await this.db.system
      .update(staffUsers)
      .set({ totpSecret: secret })
      .where(eq(staffUsers.id, s.id));
    return {
      secret,
      otpauthUrl: generateURI({ issuer: 'Family Planer Admin', label: s.email, secret }),
    };
  }

  async confirmTotp(
    staff: StaffContext,
    input: In<C['confirmTotp']>,
  ): Promise<Out<C['confirmTotp']>> {
    const s = await this.loadStaff(staff.staffId);
    if (!s.totpSecret) throw badRequest('Start the setup first', 'totp_not_started');
    const result = await verifyTotp({
      secret: s.totpSecret,
      token: input.body.code,
      epochTolerance: 30,
    });
    if (!result.valid) throw badRequest('Invalid code', 'totp_invalid');
    await this.db.system
      .update(staffUsers)
      .set({ totpEnabled: true })
      .where(eq(staffUsers.id, s.id));
    await this.audit(staff, 'staff.totp_enabled', 'staff', s.id, null);
    return OK;
  }

  async logout(staff: StaffContext): Promise<Out<C['logout']>> {
    await this.db.system.delete(staffSessions).where(eq(staffSessions.id, staff.sessionId));
    return OK;
  }

  // ------------------------------------------------------------ dashboards

  async kpis(): Promise<Out<C['kpis']>> {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const since7 = new Date(Date.now() - 7 * 86_400_000);
    const [[u], [h], [active], [signups], paying, [storage]] = await Promise.all([
      this.db.system.select({ n: count() }).from(user),
      this.db.system.select({ n: count() }).from(households).where(isNull(households.deletedAt)),
      this.db.system
        .select({ n: sql<number>`count(distinct ${householdMembers.householdId})::int` })
        .from(householdMembers)
        .innerJoin(session, eq(session.userId, householdMembers.userId))
        .where(gte(session.updatedAt, since30)),
      this.db.system.select({ n: count() }).from(user).where(gte(user.createdAt, since7)),
      this.db.system
        .select({ plan: households.plan, n: count() })
        .from(households)
        .where(and(isNull(households.deletedAt), sql`${households.plan} <> 'free'`))
        .groupBy(households.plan),
      this.db.system
        .select({ b: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint` })
        .from(files)
        .where(isNull(files.deletedAt)),
    ]);
    return {
      users: u?.n ?? 0,
      households: h?.n ?? 0,
      activeHouseholds30d: active?.n ?? 0,
      signups7d: signups?.n ?? 0,
      paying: Object.fromEntries(paying.map((p) => [p.plan, p.n])),
      storageBytes: storage?.b ?? 0,
    };
  }

  async users(input: In<C['users']>): Promise<Out<C['users']>> {
    const q = search(input.query.q);
    const cursor = decodeCursor(input.query.cursor);
    const rows = await this.db.system
      .select({
        u: user,
        households: sql<number>`(select count(*)::int from household_members m where m.user_id = "user"."id" and m.removed_at is null)`,
      })
      .from(user)
      .where(
        and(
          q ? or(ilike(user.email, q), ilike(user.name, q)) : undefined,
          cursor
            ? or(
                lt(user.createdAt, new Date(cursor.v)),
                and(eq(user.createdAt, new Date(cursor.v)), lt(user.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(input.query.limit + 1);
    return toPage(
      rows,
      input.query.limit,
      (r) => ({ v: iso(r.u.createdAt), id: r.u.id }),
      (r) => ({
        id: r.u.id,
        email: r.u.email,
        name: r.u.name,
        createdAt: iso(r.u.createdAt),
        households: r.households,
        deletionScheduledAt: isoOrNull(r.u.deletionScheduledAt),
        banned: r.u.banned,
      }),
    );
  }

  async banUser(staff: StaffContext, input: In<C['banUser']>): Promise<Out<C['banUser']>> {
    const [u] = await this.db.system
      .update(user)
      .set({ banned: input.body.banned })
      .where(eq(user.id, input.params.userId))
      .returning({ id: user.id });
    if (!u) throw notFound('User');
    if (input.body.banned) await this.db.system.delete(session).where(eq(session.userId, u.id));
    await this.audit(
      staff,
      input.body.banned ? 'user.banned' : 'user.unbanned',
      'user',
      u.id,
      input.body.reason,
    );
    return OK;
  }

  private householdRowSelect() {
    return {
      h: households,
      memberCount: sql<number>`(select count(*)::int from household_members m where m.household_id = "households"."id" and m.removed_at is null)`,
      storageBytes: sql<number>`(select coalesce(sum(f.size_bytes), 0)::bigint from files f where f.household_id = "households"."id" and f.deleted_at is null)`,
    };
  }

  async households(input: In<C['households']>): Promise<Out<C['households']>> {
    const q = search(input.query.q);
    const cursor = decodeCursor(input.query.cursor);
    const rows = await this.db.system
      .select(this.householdRowSelect())
      .from(households)
      .where(
        and(
          isNull(households.deletedAt),
          q ? ilike(households.name, q) : undefined,
          cursor
            ? or(
                lt(households.createdAt, new Date(cursor.v)),
                and(eq(households.createdAt, new Date(cursor.v)), lt(households.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(households.createdAt), desc(households.id))
      .limit(input.query.limit + 1);
    return toPage(
      rows,
      input.query.limit,
      (r) => ({ v: iso(r.h.createdAt), id: r.h.id }),
      (r) => ({ ...toHousehold(r.h), memberCount: r.memberCount, storageBytes: r.storageBytes }),
    );
  }

  /** Support view: counts only, never finance or document contents (ADR-0008). */
  async household(staff: StaffContext, input: In<C['household']>): Promise<Out<C['household']>> {
    const id = input.params.householdId;
    const [row] = await this.db.system
      .select(this.householdRowSelect())
      .from(households)
      .where(eq(households.id, id));
    if (!row) throw notFound('Household');
    const members = await this.db.system
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, id), isNull(householdMembers.removedAt)));
    const countOf = async (
      table:
        | typeof events
        | typeof tasks
        | typeof lists
        | typeof finAccounts
        | typeof finTransactions
        | typeof files,
    ) => {
      const [r] = await this.db.system
        .select({ n: count() })
        .from(table)
        .where(eq(table.householdId, id));
      return r?.n ?? 0;
    };
    const [sub] = await this.db.system
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.householdId, id));
    await this.audit(staff, 'household.viewed', 'household', id, null);
    return {
      household: {
        ...toHousehold(row.h),
        memberCount: row.memberCount,
        storageBytes: row.storageBytes,
      },
      members: members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        role: m.role,
        isManaged: m.isManaged,
        joinedAt: iso(m.joinedAt),
      })),
      counts: {
        events: await countOf(events),
        tasks: await countOf(tasks),
        lists: await countOf(lists),
        accounts: await countOf(finAccounts),
        transactions: await countOf(finTransactions),
        files: await countOf(files),
      },
      subscription: {
        plan: row.h.plan,
        status: sub?.status ?? 'none',
        provider: sub?.provider ?? null,
        compUntil: isoOrNull(sub?.compUntil ?? null),
      },
      supportAccessUntil: isoOrNull((await this.activeGrant(id))?.expiresAt ?? null),
    };
  }

  async compPlan(staff: StaffContext, input: In<C['compPlan']>): Promise<Out<C['compPlan']>> {
    const id = input.params.householdId;
    const [h] = await this.db.system
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, id));
    if (!h) throw notFound('Household');
    await this.billing.applyPlan(id, {
      plan: input.body.plan,
      status: input.body.plan === 'free' ? 'none' : 'active',
      provider: input.body.plan === 'free' ? null : 'comp',
    });
    await this.db.system
      .update(subscriptions)
      .set({ compUntil: input.body.until ? new Date(input.body.until) : null })
      .where(eq(subscriptions.householdId, id));
    await this.audit(staff, 'household.comp', 'household', id, input.body.reason, {
      plan: input.body.plan,
      until: input.body.until,
    });
    return OK;
  }

  // ------------------------------------------------------------ flags & announcements

  async flags(): Promise<Out<C['flags']>> {
    const rows = await this.db.system.select().from(featureFlags).orderBy(featureFlags.key);
    return rows.map((f) => ({ ...f, updatedAt: iso(f.updatedAt) }));
  }

  async upsertFlag(
    staff: StaffContext,
    input: In<C['upsertFlag']>,
    reason: string | null,
  ): Promise<Out<C['upsertFlag']>> {
    const values = {
      ...(input.body.description !== undefined ? { description: input.body.description } : {}),
      ...(input.body.enabled !== undefined ? { enabled: input.body.enabled } : {}),
      ...(input.body.rolloutPercent !== undefined
        ? { rolloutPercent: input.body.rolloutPercent }
        : {}),
      ...(input.body.householdAllowlist !== undefined
        ? { householdAllowlist: input.body.householdAllowlist }
        : {}),
    };
    const [f] = await this.db.system
      .insert(featureFlags)
      .values({ key: input.params.key, ...values })
      .onConflictDoUpdate({ target: featureFlags.key, set: { ...values, updatedAt: new Date() } })
      .returning();
    if (!f) throw new Error('upsert failed');
    await this.audit(staff, 'flag.upserted', 'flag', f.key, reason, values);
    return { ...f, updatedAt: iso(f.updatedAt) };
  }

  async announcements(): Promise<Out<C['announcements']>> {
    const rows = await this.db.system
      .select()
      .from(announcements)
      .orderBy(desc(announcements.startsAt));
    return rows.map((a) => ({
      ...a,
      startsAt: iso(a.startsAt),
      endsAt: isoOrNull(a.endsAt),
      createdAt: iso(a.createdAt),
    }));
  }

  async createAnnouncement(
    staff: StaffContext,
    input: In<C['createAnnouncement']>,
    reason: string | null,
  ): Promise<Out<C['createAnnouncement']>> {
    const b = input.body;
    const [a] = await this.db.system
      .insert(announcements)
      .values({
        ...b,
        startsAt: new Date(b.startsAt),
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
      })
      .returning();
    if (!a) throw new Error('insert failed');
    await this.audit(staff, 'announcement.created', 'announcement', a.id, reason, {
      title: a.title,
    });
    return {
      ...a,
      startsAt: iso(a.startsAt),
      endsAt: isoOrNull(a.endsAt),
      createdAt: iso(a.createdAt),
    };
  }

  async deleteAnnouncement(
    staff: StaffContext,
    input: In<C['deleteAnnouncement']>,
    reason: string | null,
  ): Promise<Out<C['deleteAnnouncement']>> {
    const [a] = await this.db.system
      .delete(announcements)
      .where(eq(announcements.id, input.params.id))
      .returning({ id: announcements.id });
    if (!a) throw notFound('Announcement');
    await this.audit(staff, 'announcement.deleted', 'announcement', a.id, reason);
    return OK;
  }

  // ------------------------------------------------------------ GDPR

  async gdprRequests(input: In<C['gdprRequests']>): Promise<Out<C['gdprRequests']>> {
    const cursor = decodeCursor(input.query.cursor);
    const rows = await this.db.system
      .select({ r: gdprRequests, email: user.email })
      .from(gdprRequests)
      .leftJoin(user, eq(user.id, gdprRequests.userId))
      .where(
        and(
          input.query.status ? eq(gdprRequests.status, input.query.status) : undefined,
          cursor
            ? or(
                lt(gdprRequests.requestedAt, new Date(cursor.v)),
                and(
                  eq(gdprRequests.requestedAt, new Date(cursor.v)),
                  lt(gdprRequests.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(gdprRequests.requestedAt), desc(gdprRequests.id))
      .limit(input.query.limit + 1);
    return toPage(
      rows,
      input.query.limit,
      (x) => ({ v: iso(x.r.requestedAt), id: x.r.id }),
      (x) => ({
        id: x.r.id,
        userId: x.r.userId,
        userEmail: x.email,
        type: x.r.type,
        status: x.r.status,
        requestedAt: iso(x.r.requestedAt),
        completedAt: isoOrNull(x.r.completedAt),
      }),
    );
  }

  async retryGdpr(staff: StaffContext, input: In<C['retryGdpr']>): Promise<Out<C['retryGdpr']>> {
    const [r] = await this.db.system
      .update(gdprRequests)
      .set({ status: 'pending', error: null })
      .where(and(eq(gdprRequests.id, input.params.id), eq(gdprRequests.status, 'failed')))
      .returning({ id: gdprRequests.id });
    if (!r) throw notFound('Failed GDPR request');
    await this.audit(staff, 'gdpr.retried', 'gdpr_request', r.id, input.body.reason);
    return OK;
  }

  // ------------------------------------------------------------ finance defaults

  async globalCategories(): Promise<Out<C['globalCategories']>> {
    let rows = await this.db.system
      .select()
      .from(finCategories)
      .where(isNull(finCategories.householdId))
      .orderBy(finCategories.createdAt);
    if (rows.length === 0) {
      await seedGlobals(this.db.system);
      rows = await this.db.system
        .select()
        .from(finCategories)
        .where(isNull(finCategories.householdId))
        .orderBy(finCategories.createdAt);
    }
    return rows.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      key: c.key,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
    }));
  }

  async globalRules(): Promise<Out<C['globalRules']>> {
    const rows = await this.db.system
      .select()
      .from(finRules)
      .where(isNull(finRules.householdId))
      .orderBy(finRules.priority);
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      priority: r.priority,
      conditions: r.conditions,
      direction: r.direction,
    }));
  }

  async createGlobalRule(
    staff: StaffContext,
    input: In<C['createGlobalRule']>,
    reason: string | null,
  ): Promise<Out<C['createGlobalRule']>> {
    for (const c of input.body.conditions) {
      if (c.op === 'regex' && !isValidRegex(c.value))
        throw badRequest(`Invalid regular expression "${c.value}"`, 'invalid_regex');
    }
    const [cat] = await this.db.system
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(and(eq(finCategories.id, input.body.categoryId), isNull(finCategories.householdId)));
    if (!cat) throw badRequest('Unknown global category', 'invalid_category');
    const [r] = await this.db.system
      .insert(finRules)
      .values({ householdId: null, ...input.body })
      .returning();
    if (!r) throw new Error('insert failed');
    await this.audit(staff, 'global_rule.created', 'fin_rule', r.id, reason, {
      conditions: r.conditions,
    });
    return {
      id: r.id,
      categoryId: r.categoryId,
      priority: r.priority,
      conditions: r.conditions,
      direction: r.direction,
    };
  }

  async deleteGlobalRule(
    staff: StaffContext,
    input: In<C['deleteGlobalRule']>,
    reason: string | null,
  ): Promise<Out<C['deleteGlobalRule']>> {
    const [r] = await this.db.system
      .delete(finRules)
      .where(and(eq(finRules.id, input.params.id), isNull(finRules.householdId)))
      .returning({ id: finRules.id });
    if (!r) throw notFound('Rule');
    await this.audit(staff, 'global_rule.deleted', 'fin_rule', r.id, reason);
    return OK;
  }

  // ------------------------------------------------------------ audit & staff

  async auditLog(input: In<C['audit']>): Promise<Out<C['audit']>> {
    const cursor = decodeCursor(input.query.cursor);
    const rows = await this.db.system
      .select({ a: staffAuditLog, email: staffUsers.email })
      .from(staffAuditLog)
      .leftJoin(staffUsers, eq(staffUsers.id, staffAuditLog.staffId))
      .where(
        cursor
          ? or(
              lt(staffAuditLog.createdAt, new Date(cursor.v)),
              and(eq(staffAuditLog.createdAt, new Date(cursor.v)), lt(staffAuditLog.id, cursor.id)),
            )
          : undefined,
      )
      .orderBy(desc(staffAuditLog.createdAt), desc(staffAuditLog.id))
      .limit(input.query.limit + 1);
    return toPage(
      rows,
      input.query.limit,
      (x) => ({ v: iso(x.a.createdAt), id: x.a.id }),
      (x) => ({
        id: x.a.id,
        staffId: x.a.staffId,
        staffEmail: x.email ?? '?',
        action: x.a.action,
        targetType: x.a.targetType,
        targetId: x.a.targetId,
        reason: x.a.reason,
        createdAt: iso(x.a.createdAt),
      }),
    );
  }

  async staff(): Promise<Out<C['staff']>> {
    return (
      await this.db.system
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.disabled, false))
        .orderBy(staffUsers.email)
    ).map(toStaff);
  }

  async createStaff(
    staff: StaffContext,
    input: In<C['createStaff']>,
    reason: string | null,
  ): Promise<Out<C['createStaff']>> {
    const email = input.body.email.toLowerCase();
    const [s] = await this.db.system
      .insert(staffUsers)
      .values({
        email,
        name: input.body.name,
        roles: input.body.roles,
        passwordHash: await hash(input.body.password),
      })
      .onConflictDoNothing()
      .returning();
    if (!s) throw conflict('A staff user with this email exists', 'staff_exists');
    await this.audit(staff, 'staff.created', 'staff', s.id, reason, { roles: s.roles });
    return toStaff(s);
  }

  // ------------------------------------------------------------ support access & operations

  private async activeGrant(householdId: string) {
    const [g] = await this.db.system
      .select()
      .from(supportAccessGrants)
      .where(
        and(
          eq(supportAccessGrants.householdId, householdId),
          isNull(supportAccessGrants.revokedAt),
          gte(supportAccessGrants.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(supportAccessGrants.expiresAt))
      .limit(1);
    return g ?? null;
  }

  /** Only while the customer has granted access; still no finance or document contents. */
  async supportView(
    staff: StaffContext,
    input: In<C['supportView']>,
  ): Promise<Out<C['supportView']>> {
    const id = input.params.householdId;
    const grant = await this.activeGrant(id);
    if (!grant) throw forbidden('The household has not granted support access');
    const [row] = await this.db.system
      .select(this.householdRowSelect())
      .from(households)
      .where(eq(households.id, id));
    if (!row) throw notFound('Household');
    const members = await this.db.system
      .select({
        m: householdMembers,
        devices: sql<number>`(select count(*)::int from push_devices d where d.user_id = "household_members"."user_id")`,
      })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, id), isNull(householdMembers.removedAt)));
    const activity = await this.db.system
      .select({
        action: auditLog.action,
        entityType: auditLog.entityType,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.householdId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(50);
    const [inv] = await this.db.system
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.householdId, id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [failed] = await this.db.system
      .select({ n: count() })
      .from(files)
      .where(and(eq(files.householdId, id), sql`${files.status} in ('failed', 'infected')`));
    await this.audit(staff, 'household.support_viewed', 'household', id, grant.reason);
    return {
      household: {
        ...toHousehold(row.h),
        memberCount: row.memberCount,
        storageBytes: row.storageBytes,
      },
      accessUntil: iso(grant.expiresAt),
      members: members.map(({ m, devices }) => ({
        id: m.id,
        displayName: m.displayName,
        role: m.role,
        isManaged: m.isManaged,
        color: m.color,
        joinedAt: iso(m.joinedAt),
        accessUntil: isoOrNull(m.accessUntil),
        hasLogin: m.userId !== null,
        pushDevices: devices,
      })),
      recentActivity: activity.map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
      pendingInvitations: inv?.n ?? 0,
      failedUploads: failed?.n ?? 0,
    };
  }

  async refund(staff: StaffContext, input: In<C['refund']>): Promise<Out<C['refund']>> {
    const stripe = this.billing.stripe;
    if (!stripe) throw unavailable('Payments are not configured');
    const [sub] = await this.db.system
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.householdId, input.params.householdId));
    if (!sub?.providerCustomerId) throw notFound('Stripe customer');
    const intent = await stripe.paymentIntents.retrieve(input.body.paymentIntentId);
    const customer = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
    if (customer !== sub.providerCustomerId)
      throw forbidden('Payment does not belong to this household');
    const refund = await stripe.refunds.create({
      payment_intent: input.body.paymentIntentId,
      ...(input.body.amountMinor ? { amount: input.body.amountMinor } : {}),
      metadata: { householdId: input.params.householdId, staffId: staff.staffId },
    });
    await this.audit(
      staff,
      'billing.refund',
      'household',
      input.params.householdId,
      input.body.reason,
      {
        paymentIntentId: input.body.paymentIntentId,
        amountMinor: refund.amount,
      },
    );
    return { refundId: refund.id, status: refund.status ?? 'unknown', amountMinor: refund.amount };
  }

  async system(): Promise<Out<C['system']>> {
    const [dbUp, redisUp] = await Promise.all([
      this.db.system.execute(sql`select 1`).then(
        () => true,
        () => false,
      ),
      this.redis.ping().then(
        () => true,
        () => false,
      ),
    ]);
    const queues = await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const c = await this.queues
          .get(name)
          .getJobCounts('waiting', 'active', 'delayed', 'failed');
        return {
          name,
          waiting: c.waiting ?? 0,
          active: c.active ?? 0,
          delayed: c.delayed ?? 0,
          failed: c.failed ?? 0,
        };
      }),
    );
    const [backlog] = await this.db.system
      .select({ n: count() })
      .from(outbox)
      .where(isNull(outbox.processedAt));
    const links: Record<string, string> = { apiDocs: `${this.env.API_PUBLIC_URL}/docs` };
    if (this.env.ADMIN_LINK_SENTRY) links.sentry = this.env.ADMIN_LINK_SENTRY;
    if (this.env.ADMIN_LINK_GRAFANA) links.grafana = this.env.ADMIN_LINK_GRAFANA;
    return {
      version: process.env.APP_VERSION ?? '0.0.0',
      checks: { database: dbUp ? 'up' : 'down', redis: redisUp ? 'up' : 'down' },
      queues,
      outboxBacklog: backlog?.n ?? 0,
      links,
    };
  }

  csvPresets(): Out<C['csvPresets']> {
    return CSV_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      delimiter: p.delimiter,
      detect: [...p.detect],
    }));
  }
}
