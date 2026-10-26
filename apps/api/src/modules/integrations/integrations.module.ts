import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { AssistantController } from './assistant/assistant.controller.js';
import { AssistantService } from './assistant/assistant.service.js';
import { AssistantLlm, assistantLlmProvider } from './assistant/llm.js';
import { CalendarSyncController } from './calendar-sync/calendar-sync.controller.js';
import { FetchGoogleCalendarApi, GOOGLE_CALENDAR_API } from './calendar-sync/google-api.js';
import { GoogleSyncService } from './calendar-sync/google-sync.service.js';
import { FeedFetcher, SubscriptionsService } from './calendar-sync/subscriptions.service.js';

/** P3 integrations: AI assistant (Claude) and calendar sync (ICS subscriptions, Google). */
@Module({
  imports: [CalendarModule, TasksModule, FinanceModule],
  controllers: [AssistantController, CalendarSyncController],
  providers: [
    assistantLlmProvider,
    AssistantLlm,
    AssistantService,
    FeedFetcher,
    SubscriptionsService,
    { provide: GOOGLE_CALENDAR_API, useClass: FetchGoogleCalendarApi },
    GoogleSyncService,
  ],
  exports: [AssistantService, SubscriptionsService, GoogleSyncService],
})
export class IntegrationsModule {}
