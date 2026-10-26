import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../../common/contract.js';
import { Household, type HouseholdContext } from '../../../common/request-context.js';
import { GoogleSyncService } from './google-sync.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

const C = apiContract.calendarSync;

@Controller()
export class CalendarSyncController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly google: GoogleSyncService,
  ) {}

  @Endpoint(C.listSubscriptions, { action: 'calendar.read' })
  listSubscriptions(@Household() ctx: HouseholdContext) {
    return this.subscriptions.list(ctx);
  }

  @Endpoint(C.createSubscription, { action: 'calendar.write' })
  createSubscription(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.createSubscription>,
  ) {
    return this.subscriptions.create(ctx, input);
  }

  @Endpoint(C.deleteSubscription, { action: 'calendar.write' })
  deleteSubscription(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.deleteSubscription>,
  ) {
    return this.subscriptions.remove(ctx, input);
  }

  @Endpoint(C.refreshSubscription, { action: 'calendar.write' })
  refreshSubscription(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.refreshSubscription>,
  ) {
    return this.subscriptions.refreshNow(ctx, input);
  }

  @Endpoint(C.listGoogle, { action: 'calendar.read' })
  listGoogle(@Household() ctx: HouseholdContext) {
    return this.google.list(ctx);
  }

  @Endpoint(C.connectGoogle, { action: 'calendar.write' })
  connectGoogle(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.connectGoogle>) {
    return this.google.connect(ctx, input);
  }

  @Endpoint(C.googleCallback, { action: 'calendar.write' })
  googleCallback(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.googleCallback>) {
    return this.google.callback(ctx, input);
  }

  @Endpoint(C.disconnectGoogle, { action: 'calendar.write' })
  disconnectGoogle(
    @Household() ctx: HouseholdContext,
    @Input() input: In<typeof C.disconnectGoogle>,
  ) {
    return this.google.disconnect(ctx, input);
  }

  @Endpoint(C.syncGoogle, { action: 'calendar.write' })
  syncGoogle(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.syncGoogle>) {
    return this.google.syncNow(ctx, input);
  }
}
