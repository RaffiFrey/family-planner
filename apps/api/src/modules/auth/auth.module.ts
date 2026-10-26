import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { Db } from '../../infra/database.js';
import { MailerService } from '../../infra/mailer.service.js';
import { AUTH, createAuth } from './auth.js';

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [ENV, Db, MailerService],
      useFactory: (env: Env, db: Db, mailer: MailerService) => createAuth(env, db.system, mailer),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
