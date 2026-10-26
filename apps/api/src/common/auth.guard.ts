import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { householdMembers, households } from '@fp/db';
import { can, type Module } from '@fp/domain/permissions';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { Db } from '../infra/database.js';
import { AUTH, type Auth } from '../modules/auth/auth.js';
import { getEndpointMeta } from './contract.js';
import { forbidden, notFound, unauthorized } from './errors.js';
import type { HouseholdContext, UserContext } from './request-context.js';

export function toHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard: resolves the Better Auth session, the caller's membership for `:householdId`
 * routes (404 for non-members, so household ids don't leak) and checks the endpoint's action.
 * Staff endpoints are handled by StaffGuard instead.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true; // the realtime gateway authenticates on connect
    const meta = getEndpointMeta(ctx);
    if (!meta) return true; // non-contract routes (webhooks, ICS feed) authenticate themselves
    const auth = meta.endpoint.auth ?? 'user';
    if (auth === 'staff') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();

    const user = await this.resolveUser(req);
    if (user) req.fpUser = user;
    if (auth === 'public') return true;
    if (!user) throw unauthorized();

    const householdId = (req.params as Record<string, string | undefined>).householdId;
    if (householdId) {
      if (!UUID_RE.test(householdId)) throw notFound('Household');
      const hh = await this.loadHousehold(user, householdId);
      req.fpHousehold = hh;
      const memberCtx = {
        memberId: hh.member.id,
        role: hh.member.role,
        grantedModules: hh.member.grantedModules,
        accessUntil: hh.member.accessUntil,
      };
      if (
        hh.member.role === 'caregiver' &&
        hh.member.accessUntil &&
        hh.member.accessUntil <= new Date()
      ) {
        throw forbidden('Your access to this household has expired');
      }
      if (meta.action && !can(memberCtx, meta.action)) throw forbidden();
    }
    return true;
  }

  private async resolveUser(req: FastifyRequest): Promise<UserContext | null> {
    const result = await this.auth.api.getSession({ headers: toHeaders(req) });
    if (!result) return null;
    const u = result.user as typeof result.user & {
      locale?: string | null;
      banned?: boolean | null;
    };
    if (u.banned) throw forbidden('This account is blocked');
    return { userId: u.id, email: u.email, name: u.name, locale: u.locale === 'en' ? 'en' : 'de' };
  }

  private async loadHousehold(user: UserContext, householdId: string): Promise<HouseholdContext> {
    const [row] = await this.db.system
      .select({ member: householdMembers, household: households })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, user.userId),
          isNull(householdMembers.removedAt),
          isNull(households.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Household');
    return {
      ...user,
      householdId,
      member: {
        id: row.member.id,
        householdId,
        role: row.member.role,
        displayName: row.member.displayName,
        grantedModules: (row.member.grantedModules as Module[] | null) ?? null,
        accessUntil: row.member.accessUntil,
      },
      household: {
        id: row.household.id,
        name: row.household.name,
        timezone: row.household.timezone,
        currency: row.household.currency,
        locale: row.household.locale,
        plan: row.household.plan,
      },
    };
  }
}
