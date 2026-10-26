import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { OutboxRelay } from './modules/events/outbox-relay.js';
import { Queues } from './modules/events/queues.js';
import { MaintenanceService } from './modules/maintenance/maintenance.service.js';

/**
 * Production worker process: BullMQ workers, schedules and the outbox relay, no HTTP.
 * Run API instances with RUN_WORKERS=false when using this.
 */
const env = loadEnv();
const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
app.get(OutboxRelay).start();
app.get(Queues).startWorkers();
await app.get(MaintenanceService).registerSchedules();
