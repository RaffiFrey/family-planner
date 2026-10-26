import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { LocationService } from './location.service.js';

const C = apiContract.location;

@Controller()
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Endpoint(C.myShare, { action: 'location.write' })
  myShare(@Household() ctx: HouseholdContext) {
    return this.service.getMyShare(ctx);
  }

  @Endpoint(C.startSharing, { action: 'location.write' })
  startSharing(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.startSharing>) {
    return this.service.startSharing(ctx, input);
  }

  @Endpoint(C.stopSharing, { action: 'location.write' })
  stopSharing(@Household() ctx: HouseholdContext) {
    return this.service.stopSharing(ctx);
  }

  @Endpoint(C.ping, { action: 'location.write' })
  ping(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.ping>) {
    return this.service.ping(ctx, input);
  }

  @Endpoint(C.latest, { action: 'location.read' })
  latest(@Household() ctx: HouseholdContext) {
    return this.service.latest(ctx);
  }

  @Endpoint(C.history, { action: 'location.read' })
  history(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.history>) {
    return this.service.history(ctx, input);
  }

  @Endpoint(C.places.list, { action: 'location.read' })
  listPlaces(@Household() ctx: HouseholdContext) {
    return this.service.listPlaces(ctx);
  }

  @Endpoint(C.places.create, { action: 'location.write' })
  createPlace(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.places.create>) {
    return this.service.createPlace(ctx, input);
  }

  @Endpoint(C.places.update, { action: 'location.write' })
  updatePlace(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.places.update>) {
    return this.service.updatePlace(ctx, input);
  }

  @Endpoint(C.places.remove, { action: 'location.write' })
  removePlace(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.places.remove>) {
    return this.service.removePlace(ctx, input);
  }

  @Endpoint(C.subscriptions.list, { action: 'location.read' })
  listSubscriptions(@Household() ctx: HouseholdContext) {
    return this.service.listSubscriptions(ctx);
  }

  @Endpoint(C.subscriptions.create, { action: 'location.read' })
  subscribe(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.subscriptions.create>) {
    return this.service.subscribe(ctx, input);
  }

  @Endpoint(C.subscriptions.remove, { action: 'location.read' })
  unsubscribe(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.subscriptions.remove>,
  ) {
    return this.service.unsubscribe(ctx, input);
  }
}
