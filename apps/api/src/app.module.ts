import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './common/auth.guard.js';
import {
  IdempotencyInterceptor,
  RateLimitGuard,
  ResponseInterceptor,
} from './common/interceptors.js';
import { ProblemFilter } from './common/problem.filter.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './infra/database.js';
import { InfraModule } from './infra/infra.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { DocsController } from './modules/health/docs.controller.js';
import { HealthController } from './modules/health/health.controller.js';
import { HouseholdsModule } from './modules/households/households.module.js';
import { ListsModule } from './modules/lists/lists.module.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { FinancePlusModule } from './modules/finance-plus/finance-plus.module.js';
import { FamilyModule } from './modules/family/family.module.js';
import { CareModule } from './modules/care/care.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            autoLogging: { ignore: (req) => req.url === '/v1/health' || req.url === '/metrics' },
          },
        }),
        DatabaseModule,
        InfraModule,
        AuthModule,
        EventsModule,
        NotificationsModule,
        BillingModule,
        HouseholdsModule,
        CalendarModule,
        TasksModule,
        ListsModule,
        FinanceModule,
        StorageModule,
        AdminModule,
        MaintenanceModule,
        FinancePlusModule,
        FamilyModule,
        CareModule,
        IntegrationsModule,
      ],
      controllers: [HealthController, DocsController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_FILTER, useClass: ProblemFilter },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
      ],
      exports: [ENV],
    };
  }
}
