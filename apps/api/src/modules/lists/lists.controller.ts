import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { ListsService } from './lists.service.js';

const C = apiContract.lists;

@Controller()
export class ListsController {
  constructor(private readonly service: ListsService) {}

  // Registered before `get` so `/lists/suggestions` isn't parsed as a list id.
  @Endpoint(C.suggestions, { action: 'lists.read' })
  suggestions(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.suggestions>) {
    return this.service.suggestions(ctx, input);
  }

  @Endpoint(C.list, { action: 'lists.read' })
  list(@Household() ctx: HouseholdContext) {
    return this.service.list(ctx);
  }

  @Endpoint(C.get, { action: 'lists.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'lists.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'lists.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'lists.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.addItem, { action: 'lists.write' })
  addItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.addItem>) {
    return this.service.addItem(ctx, input);
  }

  @Endpoint(C.updateItem, { action: 'lists.write' })
  updateItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateItem>) {
    return this.service.updateItem(ctx, input);
  }

  @Endpoint(C.removeItem, { action: 'lists.write' })
  removeItem(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removeItem>) {
    return this.service.removeItem(ctx, input);
  }

  @Endpoint(C.clearChecked, { action: 'lists.write' })
  clearChecked(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.clearChecked>) {
    return this.service.clearChecked(ctx, input);
  }
}
