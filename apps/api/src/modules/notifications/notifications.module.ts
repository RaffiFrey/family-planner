import { Global, Module } from '@nestjs/common';
import { NotificationEventHandlers } from './event-handlers.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventHandlers],
  exports: [NotificationsService],
})
export class NotificationsModule {}
