import { Global, Module } from '@nestjs/common';
import { OutboxRelay } from './outbox-relay.js';
import { Queues } from './queues.js';
import { RealtimeGateway, RealtimePublisher } from './realtime.js';

@Global()
@Module({
  providers: [Queues, RealtimePublisher, RealtimeGateway, OutboxRelay],
  exports: [Queues, RealtimePublisher, OutboxRelay],
})
export class EventsModule {}
