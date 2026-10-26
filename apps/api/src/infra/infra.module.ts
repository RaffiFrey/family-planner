import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { CryptoService } from './crypto.service.js';
import { MailerService } from './mailer.service.js';
import { PushService } from './push.service.js';
import { ObjectStorage } from './storage.service.js';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
        redis.on('error', (e) => {
          new Logger('Redis').warn(e.message);
        });
        return redis;
      },
    },
    RedisShutdown,
    CryptoService,
    ObjectStorage,
    MailerService,
    PushService,
  ],
  exports: [REDIS, CryptoService, ObjectStorage, MailerService, PushService],
})
export class InfraModule {}
