import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { TasksService } from './tasks.service.js';

const C = apiContract.tasks;

@Controller()
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Endpoint(C.list, { action: 'tasks.read' })
  list(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.list>) {
    return this.service.list(ctx, input);
  }

  @Endpoint(C.get, { action: 'tasks.read' })
  get(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.get>) {
    return this.service.get(ctx, input);
  }

  @Endpoint(C.create, { action: 'tasks.write' })
  create(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.create>) {
    return this.service.create(ctx, input);
  }

  @Endpoint(C.update, { action: 'tasks.write' })
  update(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.update>) {
    return this.service.update(ctx, input);
  }

  @Endpoint(C.remove, { action: 'tasks.write' })
  remove(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.remove>) {
    return this.service.remove(ctx, input);
  }

  @Endpoint(C.complete, { action: 'tasks.complete' })
  complete(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.complete>) {
    return this.service.complete(ctx, input);
  }

  @Endpoint(C.reopen, { action: 'tasks.complete' })
  reopen(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.reopen>) {
    return this.service.reopen(ctx, input);
  }

  @Endpoint(C.toggleChecklistItem, { action: 'tasks.complete' })
  toggleChecklistItem(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.toggleChecklistItem>,
  ) {
    return this.service.toggleChecklistItem(ctx, input);
  }
}
