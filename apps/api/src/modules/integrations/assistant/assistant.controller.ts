import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { AssistantService } from './assistant.service.js';

const C = apiContract.assistant;

@Controller()
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Endpoint(C.settings, { action: 'assistant.read' })
  settings(@Household() ctx: HouseholdContext) {
    return this.service.settings(ctx);
  }

  @Endpoint(C.enable, { action: 'assistant.write' })
  enable(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.enable>) {
    return this.service.enable(ctx, input);
  }

  @Endpoint(C.disable, { action: 'assistant.write' })
  disable(@Household() ctx: HouseholdContext) {
    return this.service.disable(ctx);
  }

  @Endpoint(C.capture, { action: 'assistant.write' })
  capture(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.capture>) {
    return this.service.capture(ctx, input);
  }

  @Endpoint(C.receipt, { action: 'assistant.write' })
  receipt(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.receipt>) {
    return this.service.receipt(ctx, input);
  }

  @Endpoint(C.insights, { action: 'assistant.write' })
  insights(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.insights>) {
    return this.service.insights(ctx, input);
  }

  @Endpoint(C.meals, { action: 'assistant.write' })
  meals(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.meals>) {
    return this.service.meals(ctx, input);
  }

  @Endpoint(C.getProposal, { action: 'assistant.read' })
  getProposal(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.getProposal>) {
    return this.service.getProposal(ctx, input);
  }

  @Endpoint(C.apply, { action: 'assistant.write' })
  apply(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.apply>) {
    return this.service.apply(ctx, input);
  }

  @Endpoint(C.discard, { action: 'assistant.write' })
  discard(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.discard>) {
    return this.service.discard(ctx, input);
  }
}
