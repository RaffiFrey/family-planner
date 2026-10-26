import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { PinboardService } from './pinboard.service.js';

const C = apiContract.pinboard;

@Controller()
export class PinboardController {
  constructor(private readonly service: PinboardService) {}

  @Endpoint(C.feed, { action: 'pinboard.read' })
  feed(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.feed>) {
    return this.service.feed(ctx, input);
  }

  @Endpoint(C.createPost, { action: 'pinboard.write' })
  createPost(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createPost>) {
    return this.service.createPost(ctx, input);
  }

  @Endpoint(C.updatePost, { action: 'pinboard.write' })
  updatePost(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updatePost>) {
    return this.service.updatePost(ctx, input);
  }

  @Endpoint(C.removePost, { action: 'pinboard.write' })
  removePost(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removePost>) {
    return this.service.removePost(ctx, input);
  }

  @Endpoint(C.react, { action: 'pinboard.write' })
  react(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.react>) {
    return this.service.react(ctx, input);
  }

  @Endpoint(C.unreact, { action: 'pinboard.write' })
  unreact(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.unreact>) {
    return this.service.unreact(ctx, input);
  }

  @Endpoint(C.polls, { action: 'pinboard.read' })
  polls(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.polls>) {
    return this.service.polls(ctx, input);
  }

  @Endpoint(C.getPoll, { action: 'pinboard.read' })
  getPoll(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.getPoll>) {
    return this.service.getPoll(ctx, input);
  }

  @Endpoint(C.createPoll, { action: 'pinboard.write' })
  createPoll(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createPoll>) {
    return this.service.createPoll(ctx, input);
  }

  @Endpoint(C.vote, { action: 'pinboard.write' })
  vote(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.vote>) {
    return this.service.vote(ctx, input);
  }

  @Endpoint(C.unvote, { action: 'pinboard.write' })
  unvote(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.unvote>) {
    return this.service.unvote(ctx, input);
  }

  @Endpoint(C.closePoll, { action: 'pinboard.write' })
  closePoll(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.closePoll>) {
    return this.service.closePoll(ctx, input);
  }

  @Endpoint(C.removePoll, { action: 'pinboard.write' })
  removePoll(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.removePoll>) {
    return this.service.removePoll(ctx, input);
  }
}
