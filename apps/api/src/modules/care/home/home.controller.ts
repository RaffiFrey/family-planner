import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { HomeService } from './home.service.js';

const C = apiContract.home;

@Controller()
export class HomeController {
  constructor(private readonly service: HomeService) {}

  @Endpoint(C.assets.list, { action: 'home.read' })
  listAssets(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.list>) {
    return this.service.listAssets(ctx, input);
  }

  @Endpoint(C.assets.warranties, { action: 'home.read' })
  warranties(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.warranties>) {
    return this.service.warranties(ctx, input);
  }

  @Endpoint(C.assets.get, { action: 'home.read' })
  getAsset(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.get>) {
    return this.service.getAsset(ctx, input);
  }

  @Endpoint(C.assets.create, { action: 'home.write' })
  createAsset(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.create>) {
    return this.service.createAsset(ctx, input);
  }

  @Endpoint(C.assets.update, { action: 'home.write' })
  updateAsset(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.update>) {
    return this.service.updateAsset(ctx, input);
  }

  @Endpoint(C.assets.remove, { action: 'home.write' })
  removeAsset(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.assets.remove>) {
    return this.service.removeAsset(ctx, input);
  }

  @Endpoint(C.maintenance.templates, { action: 'home.read' })
  templates() {
    return this.service.templates();
  }

  @Endpoint(C.maintenance.list, { action: 'home.read' })
  listPlans(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.maintenance.list>) {
    return this.service.listPlans(ctx, input);
  }

  @Endpoint(C.maintenance.create, { action: 'home.write' })
  createPlan(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.maintenance.create>) {
    return this.service.createPlan(ctx, input);
  }

  @Endpoint(C.maintenance.update, { action: 'home.write' })
  updatePlan(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.maintenance.update>) {
    return this.service.updatePlan(ctx, input);
  }

  @Endpoint(C.maintenance.remove, { action: 'home.write' })
  removePlan(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.maintenance.remove>) {
    return this.service.removePlan(ctx, input);
  }

  @Endpoint(C.maintenance.complete, { action: 'home.write' })
  completePlan(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.maintenance.complete>,
  ) {
    return this.service.completePlan(ctx, input);
  }

  @Endpoint(C.maintenance.logs, { action: 'home.read' })
  logs(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.maintenance.logs>) {
    return this.service.logs(ctx, input);
  }

  @Endpoint(C.meters.list, { action: 'home.read' })
  listReadings(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.meters.list>) {
    return this.service.listReadings(ctx, input);
  }

  @Endpoint(C.meters.create, { action: 'home.write' })
  createReading(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.meters.create>) {
    return this.service.createReading(ctx, input);
  }

  @Endpoint(C.meters.remove, { action: 'home.write' })
  removeReading(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.meters.remove>) {
    return this.service.removeReading(ctx, input);
  }

  @Endpoint(C.meters.consumption, { action: 'home.read' })
  consumption(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.meters.consumption>) {
    return this.service.consumption(ctx, input);
  }
}
