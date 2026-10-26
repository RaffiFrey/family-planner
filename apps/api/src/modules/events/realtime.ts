import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  type WsResponse,
} from '@nestjs/websockets';
import { householdMembers } from '@fp/db';
import { type EntityChanged, RealtimeEvents } from '@fp/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import { and, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Socket } from 'socket.io';
import { Db } from '../../infra/database.js';
import { REDIS } from '../../infra/infra.module.js';
import { AUTH, type Auth } from '../auth/auth.js';

export const householdRoom = (id: string) => `household:${id}`;
export const userRoom = (id: string) => `user:${id}`;

/** Publishes to Socket.IO rooms from any process (API or worker) via Redis. */
@Injectable()
export class RealtimePublisher {
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS) redis: Redis) {
    this.emitter = new Emitter(redis.duplicate());
  }

  entityChanged(change: EntityChanged): void {
    this.emitter.to(householdRoom(change.householdId)).emit(RealtimeEvents.entityChanged, change);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.emitter.to(userRoom(userId)).emit(event, payload);
  }
}

/**
 * Socket.IO gateway at `/realtime`. Connections authenticate with the Better Auth session
 * (cookie header, or `auth.cookie` from mobile) and may only join households they belong to.
 */
@WebSocketGateway({ path: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly db: Db,
  ) {}

  handleConnection(client: Socket): Promise<void> {
    // Messages can arrive before authentication finishes; handlers await this promise.
    const ready = this.authenticate(client);
    (client.data as { ready?: Promise<void> }).ready = ready;
    return ready;
  }

  private async authenticate(client: Socket): Promise<void> {
    try {
      const headers = new Headers();
      const cookie =
        client.handshake.headers.cookie ??
        (client.handshake.auth as { cookie?: string } | undefined)?.cookie;
      if (cookie) headers.set('cookie', cookie);
      const authz = client.handshake.headers.authorization;
      if (authz) headers.set('authorization', authz);
      const session = await this.auth.api.getSession({ headers });
      if (!session) {
        client.disconnect(true);
        return;
      }
      (client.data as { userId?: string }).userId = session.user.id;
      await client.join(userRoom(session.user.id));
    } catch (e) {
      this.logger.warn(`Realtime auth failed: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage(RealtimeEvents.subscribe)
  async subscribe(
    client: Socket,
    payload: { householdId?: string },
  ): Promise<WsResponse<{ ok: boolean }>> {
    await (client.data as { ready?: Promise<void> }).ready;
    const userId = (client.data as { userId?: string }).userId;
    const householdId = payload.householdId;
    if (!userId || typeof householdId !== 'string')
      return { event: 'subscribed', data: { ok: false } };
    const [member] = await this.db.system
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
          isNull(householdMembers.removedAt),
        ),
      )
      .limit(1);
    if (!member) return { event: 'subscribed', data: { ok: false } };
    await client.join(householdRoom(householdId));
    return { event: 'subscribed', data: { ok: true } };
  }
}
