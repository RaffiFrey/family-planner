import { Controller } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { CurrentUser, type UserContext } from '../../common/request-context.js';
import { NotificationsService } from './notifications.service.js';

const C = apiContract.notifications;

@Controller()
export class NotificationsController {
  constructor(private readonly s: NotificationsService) {}

  @Endpoint(C.list)
  list(@CurrentUser() u: UserContext, @Input() i: In<typeof C.list>) {
    return this.s.list(u, i);
  }

  @Endpoint(C.markRead)
  markRead(@CurrentUser() u: UserContext, @Input() i: In<typeof C.markRead>) {
    return this.s.markRead(u, i);
  }

  @Endpoint(C.getPreferences)
  getPreferences(@CurrentUser() u: UserContext) {
    return this.s.getPreferences(u.userId);
  }

  @Endpoint(C.updatePreferences)
  updatePreferences(@CurrentUser() u: UserContext, @Input() i: In<typeof C.updatePreferences>) {
    return this.s.updatePreferences(u, i);
  }

  @Endpoint(C.registerDevice)
  registerDevice(@CurrentUser() u: UserContext, @Input() i: In<typeof C.registerDevice>) {
    return this.s.registerDevice(u, i);
  }

  @Endpoint(C.unregisterDevice)
  unregisterDevice(@CurrentUser() u: UserContext, @Input() i: In<typeof C.unregisterDevice>) {
    return this.s.unregisterDevice(u, i);
  }
}
