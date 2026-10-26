import { Controller, Req, UseGuards } from '@nestjs/common';
import { adminApiContract } from '@fp/contracts';
import type { FastifyRequest } from 'fastify';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { badRequest } from '../../common/errors.js';
import { CurrentStaff, type StaffContext } from '../../common/request-context.js';
import { AdminService } from './admin.service.js';
import { StaffGuard } from './staff.guard.js';

const C = adminApiContract.admin;

/** Reason for endpoints whose body has no `reason`: sent by the admin app as `x-audit-reason`. */
function headerReason(req: FastifyRequest): string {
  const raw = req.headers['x-audit-reason'];
  const reason = typeof raw === 'string' ? decodeURIComponent(raw).trim() : '';
  if (reason.length < 5)
    throw badRequest(
      'An audit reason (x-audit-reason, min. 5 characters) is required',
      'reason_required',
    );
  return reason.slice(0, 500);
}

@Controller()
@UseGuards(StaffGuard)
export class AdminController {
  constructor(private readonly s: AdminService) {}

  @Endpoint(C.login)
  login(@Input() i: In<typeof C.login>, @Req() req: FastifyRequest) {
    return this.s.login(i, req.ip);
  }

  @Endpoint(C.me)
  me(@CurrentStaff() staff: StaffContext) {
    return this.s.me(staff);
  }

  @Endpoint(C.setupTotp)
  setupTotp(@CurrentStaff() staff: StaffContext) {
    return this.s.setupTotp(staff);
  }

  @Endpoint(C.confirmTotp)
  confirmTotp(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.confirmTotp>) {
    return this.s.confirmTotp(staff, i);
  }

  @Endpoint(C.logout)
  logout(@CurrentStaff() staff: StaffContext) {
    return this.s.logout(staff);
  }

  @Endpoint(C.kpis)
  kpis() {
    return this.s.kpis();
  }

  @Endpoint(C.users)
  users(@Input() i: In<typeof C.users>) {
    return this.s.users(i);
  }

  @Endpoint(C.banUser)
  banUser(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.banUser>) {
    return this.s.banUser(staff, i);
  }

  @Endpoint(C.households)
  households(@Input() i: In<typeof C.households>) {
    return this.s.households(i);
  }

  @Endpoint(C.household)
  household(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.household>) {
    return this.s.household(staff, i);
  }

  @Endpoint(C.compPlan)
  compPlan(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.compPlan>) {
    return this.s.compPlan(staff, i);
  }

  @Endpoint(C.flags)
  flags() {
    return this.s.flags();
  }

  @Endpoint(C.upsertFlag)
  upsertFlag(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.upsertFlag>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.upsertFlag(staff, i, headerReason(req));
  }

  @Endpoint(C.announcements)
  announcements() {
    return this.s.announcements();
  }

  @Endpoint(C.createAnnouncement)
  createAnnouncement(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.createAnnouncement>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.createAnnouncement(staff, i, headerReason(req));
  }

  @Endpoint(C.deleteAnnouncement)
  deleteAnnouncement(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.deleteAnnouncement>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.deleteAnnouncement(staff, i, headerReason(req));
  }

  @Endpoint(C.gdprRequests)
  gdprRequests(@Input() i: In<typeof C.gdprRequests>) {
    return this.s.gdprRequests(i);
  }

  @Endpoint(C.retryGdpr)
  retryGdpr(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.retryGdpr>) {
    return this.s.retryGdpr(staff, i);
  }

  @Endpoint(C.globalCategories)
  globalCategories() {
    return this.s.globalCategories();
  }

  @Endpoint(C.globalRules)
  globalRules() {
    return this.s.globalRules();
  }

  @Endpoint(C.createGlobalRule)
  createGlobalRule(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.createGlobalRule>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.createGlobalRule(staff, i, headerReason(req));
  }

  @Endpoint(C.deleteGlobalRule)
  deleteGlobalRule(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.deleteGlobalRule>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.deleteGlobalRule(staff, i, headerReason(req));
  }

  @Endpoint(C.audit)
  audit(@Input() i: In<typeof C.audit>) {
    return this.s.auditLog(i);
  }

  @Endpoint(C.staff)
  staff() {
    return this.s.staff();
  }

  @Endpoint(C.createStaff)
  createStaff(
    @CurrentStaff() staff: StaffContext,
    @Input() i: In<typeof C.createStaff>,
    @Req() req: FastifyRequest,
  ) {
    return this.s.createStaff(staff, i, headerReason(req));
  }

  @Endpoint(C.supportView)
  supportView(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.supportView>) {
    return this.s.supportView(staff, i);
  }

  @Endpoint(C.refund)
  refund(@CurrentStaff() staff: StaffContext, @Input() i: In<typeof C.refund>) {
    return this.s.refund(staff, i);
  }

  @Endpoint(C.system)
  system() {
    return this.s.system();
  }

  @Endpoint(C.csvPresets)
  csvPresets() {
    return this.s.csvPresets();
  }
}
