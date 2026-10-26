import { Module } from '@nestjs/common';
import { CalendarController, IcsController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  controllers: [CalendarController, IcsController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
