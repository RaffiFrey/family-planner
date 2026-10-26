import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { RewardsService } from './rewards.service.js';

const C = apiContract.rewards;

/** Adult-only operations are enforced in the service (children have `rewards.write` to redeem). */
@Controller()
export class RewardsController {
  constructor(private readonly service: RewardsService) {}

  @Endpoint(C.balances, { action: 'rewards.read' })
  balances(@Household() ctx: HouseholdContext) {
    return this.service.balances(ctx);
  }

  @Endpoint(C.points, { action: 'rewards.read' })
  points(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.points>) {
    return this.service.points(ctx, input);
  }

  @Endpoint(C.adjustPoints, { action: 'rewards.write' })
  adjustPoints(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.adjustPoints>) {
    return this.service.adjustPoints(ctx, input);
  }

  @Endpoint(C.leaderboard, { action: 'rewards.read' })
  leaderboard(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.leaderboard>) {
    return this.service.leaderboard(ctx, input);
  }

  @Endpoint(C.catalog, { action: 'rewards.read' })
  catalog(@Household() ctx: HouseholdContext) {
    return this.service.catalog(ctx);
  }

  @Endpoint(C.createReward, { action: 'rewards.write' })
  createReward(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createReward>) {
    return this.service.createReward(ctx, input);
  }

  @Endpoint(C.updateReward, { action: 'rewards.write' })
  updateReward(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateReward>) {
    return this.service.updateReward(ctx, input);
  }

  @Endpoint(C.removeReward, { action: 'rewards.write' })
  removeReward(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeReward>) {
    return this.service.removeReward(ctx, input);
  }

  @Endpoint(C.redeem, { action: 'rewards.write' })
  redeem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.redeem>) {
    return this.service.redeem(ctx, input);
  }

  @Endpoint(C.redemptions, { action: 'rewards.read' })
  redemptions(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.redemptions>) {
    return this.service.redemptions(ctx, input);
  }

  @Endpoint(C.approveRedemption, { action: 'rewards.write' })
  approveRedemption(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.approveRedemption>,
  ) {
    return this.service.approveRedemption(ctx, input);
  }

  @Endpoint(C.rejectRedemption, { action: 'rewards.write' })
  rejectRedemption(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.rejectRedemption>,
  ) {
    return this.service.rejectRedemption(ctx, input);
  }

  @Endpoint(C.cancelRedemption, { action: 'rewards.write' })
  cancelRedemption(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.cancelRedemption>,
  ) {
    return this.service.cancelRedemption(ctx, input);
  }

  @Endpoint(C.allowanceRules, { action: 'rewards.read' })
  allowanceRules(@Household() ctx: HouseholdContext) {
    return this.service.allowanceRules(ctx);
  }

  @Endpoint(C.createAllowanceRule, { action: 'rewards.write' })
  createAllowanceRule(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.createAllowanceRule>,
  ) {
    return this.service.createAllowanceRule(ctx, input);
  }

  @Endpoint(C.updateAllowanceRule, { action: 'rewards.write' })
  updateAllowanceRule(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.updateAllowanceRule>,
  ) {
    return this.service.updateAllowanceRule(ctx, input);
  }

  @Endpoint(C.removeAllowanceRule, { action: 'rewards.write' })
  removeAllowanceRule(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.removeAllowanceRule>,
  ) {
    return this.service.removeAllowanceRule(ctx, input);
  }

  @Endpoint(C.allowanceBalances, { action: 'rewards.read' })
  allowanceBalances(@Household() ctx: HouseholdContext) {
    return this.service.allowanceBalances(ctx);
  }

  @Endpoint(C.allowanceLedger, { action: 'rewards.read' })
  allowanceLedger(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.allowanceLedger>,
  ) {
    return this.service.allowanceLedger(ctx, input);
  }

  @Endpoint(C.addAllowanceEntry, { action: 'rewards.write' })
  addAllowanceEntry(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.addAllowanceEntry>,
  ) {
    return this.service.addAllowanceEntry(ctx, input);
  }
}
