import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceEvents } from './finance.events.js';
import { FinanceService } from './finance.service.js';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceEvents],
  exports: [FinanceService, FinanceEvents],
})
export class FinanceModule {}
