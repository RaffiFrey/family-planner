import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import {
  CurrentUser,
  Household,
  type HouseholdContext,
  type UserContext,
} from '../../common/request-context.js';
import { HouseholdsService } from './households.service.js';

const C = apiContract.households;

@Controller()
export class HouseholdsController {
  constructor(private readonly service: HouseholdsService) {}

  @Endpoint(C.me)
  me(@CurrentUser() u: UserContext) {
    return this.service.me(u);
  }

  @Endpoint(C.updateMe)
  updateMe(@CurrentUser() u: UserContext, @Input() input: In<typeof C.updateMe>) {
    return this.service.updateMe(u, input);
  }

  @Endpoint(C.exportMyData)
  exportMyData(@CurrentUser() u: UserContext) {
    return this.service.requestExport(u);
  }

  @Endpoint(C.deleteMe)
  deleteMe(@CurrentUser() u: UserContext) {
    return this.service.scheduleDeletion(u);
  }

  @Endpoint(C.create)
  create(@CurrentUser() u: UserContext, @Input() input: In<typeof C.create>) {
    return this.service.create(u, input);
  }

  @Endpoint(C.get)
  get(@Household() ctx: HouseholdContext) {
    return this.service.get(ctx);
  }

  @Endpoint(C.update, { action: 'household.manage' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'household.delete' })
  remove(@Household() ctx: HouseholdContext) {
    return this.service.remove(ctx);
  }

  @Endpoint(C.updateMember)
  updateMember(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateMember>) {
    return this.service.updateMember(ctx, input);
  }

  @Endpoint(C.removeMember)
  removeMember(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeMember>) {
    return this.service.removeMember(ctx, input);
  }

  @Endpoint(C.createManagedMember, { action: 'members.manage' })
  createManagedMember(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.createManagedMember>,
  ) {
    return this.service.createManagedMember(ctx, input);
  }

  @Endpoint(C.listInvitations, { action: 'members.invite' })
  listInvitations(@Household() ctx: HouseholdContext) {
    return this.service.listInvitations(ctx);
  }

  @Endpoint(C.createInvitation, { action: 'members.invite' })
  createInvitation(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.createInvitation>,
  ) {
    return this.service.createInvitation(ctx, input);
  }

  @Endpoint(C.revokeInvitation, { action: 'members.invite' })
  revokeInvitation(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.revokeInvitation>,
  ) {
    return this.service.revokeInvitation(ctx, input);
  }

  @Endpoint(C.previewInvitation)
  previewInvitation(@Input() input: In<typeof C.previewInvitation>) {
    return this.service.previewInvitation(input);
  }

  @Endpoint(C.acceptInvitation)
  acceptInvitation(@CurrentUser() u: UserContext, @Input() input: In<typeof C.acceptInvitation>) {
    return this.service.acceptInvitation(u, input);
  }

  @Endpoint(C.audit, { action: 'household.manage' })
  audit(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.audit>) {
    return this.service.audit(ctx, input);
  }

  @Endpoint(C.getSupportAccess, { action: 'household.manage' })
  getSupportAccess(@Household() ctx: HouseholdContext) {
    return this.service.getSupportAccess(ctx);
  }

  @Endpoint(C.grantSupportAccess, { action: 'household.manage' })
  grantSupportAccess(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.grantSupportAccess>,
  ) {
    return this.service.grantSupportAccess(ctx, input);
  }

  @Endpoint(C.revokeSupportAccess, { action: 'household.manage' })
  revokeSupportAccess(@Household() ctx: HouseholdContext) {
    return this.service.revokeSupportAccess(ctx);
  }
}
