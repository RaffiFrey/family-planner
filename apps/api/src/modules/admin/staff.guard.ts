import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { staffSessions, staffUsers } from '@fp/db';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { getEndpointMeta } from '../../common/contract.js';
import { forbidden, unauthorized } from '../../common/errors.js';
import { CryptoService } from '../../infra/crypto.service.js';
import { Db } from '../../infra/database.js';

export type StaffRole = 'support' | 'billing' | 'ops' | 'superadmin';

/** Required staff roles per admin operation (superadmin always passes). Unlisted = any staff. */
const REQUIRED: Record<string, StaffRole[]> = {
  '/admin/v1/users': ['support'],
  '/admin/v1/users/:userId/ban': ['support'],
  '/admin/v1/households': ['support', 'billing'],
  '/admin/v1/households/:householdId': ['support', 'billing'],
  '/admin/v1/households/:householdId/comp': ['billing'],
  '/admin/v1/flags': ['ops'],
  '/admin/v1/flags/:key': ['ops'],
  '/admin/v1/announcements': ['ops'],
  '/admin/v1/announcements/:id': ['ops'],
  '/admin/v1/gdpr': ['support'],
  '/admin/v1/gdpr/:id/retry': ['support'],
  '/admin/v1/finance/categories': ['ops'],
  '/admin/v1/finance/rules': ['ops'],
  '/admin/v1/finance/rules/:id': ['ops'],
  '/admin/v1/staff': ['superadmin'],
  '/admin/v1/households/:householdId/support': ['support'],
  '/admin/v1/households/:householdId/refund': ['billing'],
  '/admin/v1/system': ['ops'],
  '/admin/v1/finance/csv-presets': ['ops'],
};

/** Endpoints usable before TOTP enrolment is finished. */
const PRE_TOTP = new Set([
  '/admin/v1/auth/me',
  '/admin/v1/auth/totp',
  '/admin/v1/auth/totp/confirm',
  '/admin/v1/auth/logout',
]);

/** Separate auth realm for staff: opaque bearer tokens stored hashed in staff_sessions. */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = ctx.getType() === 'http' ? getEndpointMeta(ctx) : undefined;
    if (meta?.endpoint.auth !== 'staff') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const tokenHash = CryptoService.sha256(header.slice(7));
    const [row] = await this.db.system
      .select({ session: staffSessions, staff: staffUsers })
      .from(staffSessions)
      .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
      .where(and(eq(staffSessions.tokenHash, tokenHash), gt(staffSessions.expiresAt, new Date())))
      .limit(1);
    if (!row || row.staff.disabled) throw unauthorized();
    req.fpStaff = {
      staffId: row.staff.id,
      email: row.staff.email,
      roles: row.staff.roles,
      sessionId: row.session.id,
    };
    const path = meta.endpoint.path;
    if (!row.staff.totpEnabled && !PRE_TOTP.has(path))
      throw forbidden('Two-factor authentication must be set up first');
    const required = REQUIRED[path];
    const roles = row.staff.roles as StaffRole[];
    if (required && !roles.includes('superadmin') && !required.some((r) => roles.includes(r))) {
      throw forbidden('Missing staff role');
    }
    return true;
  }
}
