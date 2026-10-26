import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { TravelService } from './travel.service.js';

const C = apiContract.travel;

@Controller()
export class TravelController {
  constructor(private readonly service: TravelService) {}

  @Endpoint(C.list, { action: 'travel.read' })
  list(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.list>) {
    return this.service.list(ctx, input);
  }

  @Endpoint(C.get, { action: 'travel.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'travel.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'travel.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'travel.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.addItem, { action: 'travel.write' })
  addItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.addItem>) {
    return this.service.addItem(ctx, input);
  }

  @Endpoint(C.updateItem, { action: 'travel.write' })
  updateItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateItem>) {
    return this.service.updateItem(ctx, input);
  }

  @Endpoint(C.removeItem, { action: 'travel.write' })
  removeItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeItem>) {
    return this.service.removeItem(ctx, input);
  }

  /** Spending comes from finance data, so it needs finance access on top of travel access. */
  @Endpoint(C.budget, { action: 'finance.read' })
  budget(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.budget>) {
    return this.service.budget(ctx, input);
  }

  @Endpoint(C.packingTemplates, { action: 'travel.read' })
  packingTemplates(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.packingTemplates>,
  ) {
    return this.service.packingTemplates(ctx, input);
  }

  @Endpoint(C.createPackingList, { action: 'travel.write' })
  createPackingList(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.createPackingList>,
  ) {
    return this.service.createPackingList(ctx, input);
  }
}
