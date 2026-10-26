import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MemberRole, Module } from '@fp/domain/permissions';
import type { FastifyRequest } from 'fastify';

export interface UserContext {
  userId: string;
  email: string;
  name: string;
  locale: 'de' | 'en';
}

export interface MemberContextRow {
  id: string;
  householdId: string;
  role: MemberRole;
  displayName: string;
  grantedModules: Module[] | null;
  accessUntil: Date | null;
}

export interface HouseholdInfo {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  plan: 'free' | 'plus' | 'pro';
}

export interface HouseholdContext extends UserContext {
  householdId: string;
  member: MemberContextRow;
  household: HouseholdInfo;
}

export interface StaffContext {
  staffId: string;
  email: string;
  roles: string[];
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    fpUser?: UserContext;
    fpHousehold?: HouseholdContext;
    fpStaff?: StaffContext;
  }
}

/** Authenticated user (set by AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): UserContext => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.fpUser) throw new Error('No user on request; is the endpoint public?');
    return req.fpUser;
  },
);

/** Household + membership of the caller for routes with `:householdId` (set by AuthGuard). */
export const Household = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): HouseholdContext => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.fpHousehold) throw new Error('No household context; route needs :householdId');
    return req.fpHousehold;
  },
);

export const CurrentStaff = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): StaffContext => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.fpStaff) throw new Error('No staff on request');
    return req.fpStaff;
  },
);

export function actorOf(ctx: HouseholdContext) {
  return { householdId: ctx.householdId, memberId: ctx.member.id, userId: ctx.userId };
}

export function memberCtx(ctx: HouseholdContext) {
  return {
    memberId: ctx.member.id,
    role: ctx.member.role,
    grantedModules: ctx.member.grantedModules,
    accessUntil: ctx.member.accessUntil,
  };
}
