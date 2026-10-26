import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  auditLog,
  createDb,
  type Database,
  type DbHandle,
  outbox,
  type Transaction,
  withTenant,
} from '@fp/db';
import type { EntityChanged, RealtimeEntity } from '@fp/contracts';
import { ENV, type Env } from '../config/env.js';

export const DB_HANDLES = Symbol('DB_HANDLES');

interface Handles {
  app: DbHandle;
  system: DbHandle;
}

export interface Actor {
  householdId: string;
  memberId: string | null;
  userId: string | null;
}

/** Collects side effects of a unit of work; flushed into the same transaction. */
export class UnitEvents {
  readonly changes: Omit<EntityChanged, 'householdId' | 'actorMemberId' | 'at'>[] = [];
  readonly audits: {
    action: string;
    entityType: string;
    entityId: string | null;
    data?: Record<string, unknown>;
  }[] = [];
  readonly domain: { type: string; payload: Record<string, unknown> }[] = [];

  changed(
    entity: RealtimeEntity,
    id: string | null,
    op: EntityChanged['op'],
    parentId: string | null = null,
  ): void {
    this.changes.push({ entity, id, op, parentId });
  }

  audit(
    action: string,
    entityType: string,
    entityId: string | null,
    data?: Record<string, unknown>,
  ): void {
    this.audits.push({ action, entityType, entityId, ...(data ? { data } : {}) });
  }

  /** Domain event handled asynchronously by workers (notifications, budget checks …). */
  emit(type: string, payload: Record<string, unknown>): void {
    this.domain.push({ type, payload });
  }
}

@Injectable()
export class Db implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLES) private readonly handles: Handles) {}

  /** RLS-restricted connection (role fp_app). Use through `tenant()`. */
  get app(): Database {
    return this.handles.app.db;
  }

  /** BYPASSRLS connection (role fp_system) for auth, membership lookup, workers and admin. */
  get system(): Database {
    return this.handles.system.db;
  }

  /**
   * Runs a tenant-scoped transaction. Entity changes, audit entries and domain events
   * recorded on `events` are written to the outbox/audit tables atomically with the change.
   */
  async tenant<T>(
    actor: Actor,
    fn: (tx: Transaction, events: UnitEvents) => Promise<T>,
  ): Promise<T> {
    return withTenant(this.app, actor.householdId, async (tx) => {
      const events = new UnitEvents();
      const result = await fn(tx, events);
      await flushEvents(tx, actor, events);
      return result;
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.handles.app.close(), this.handles.system.close()]);
  }
}

export async function flushEvents(
  tx: Transaction,
  actor: Actor,
  events: UnitEvents,
): Promise<void> {
  const at = new Date().toISOString();
  if (events.audits.length > 0) {
    await tx.insert(auditLog).values(
      events.audits.map((a) => ({
        householdId: actor.householdId,
        actorMemberId: actor.memberId,
        actorUserId: actor.userId,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        data: a.data ?? null,
      })),
    );
  }
  const rows = [
    ...events.changes.map((c) => ({
      householdId: actor.householdId,
      type: 'entity.changed',
      payload: { ...c, householdId: actor.householdId, actorMemberId: actor.memberId, at },
    })),
    ...events.domain.map((d) => ({
      householdId: actor.householdId,
      type: d.type,
      payload: {
        ...d.payload,
        householdId: actor.householdId,
        actorMemberId: actor.memberId,
        actorUserId: actor.userId,
      },
    })),
  ];
  if (rows.length > 0) await tx.insert(outbox).values(rows);
}

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLES,
      inject: [ENV],
      useFactory: (env: Env): Handles => ({
        app: createDb(env.DATABASE_URL, { max: 20, applicationName: 'fp-api' }),
        system: createDb(env.DATABASE_SYSTEM_URL, { max: 10, applicationName: 'fp-api-system' }),
      }),
    },
    Db,
  ],
  exports: [Db],
})
export class DatabaseModule {}
