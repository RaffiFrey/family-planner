import { PassThrough } from 'node:stream';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  eventExceptions,
  events,
  files,
  finAccounts,
  finTransactions,
  gdprRequests,
  householdMembers,
  households,
  idempotencyKeys,
  listItems,
  lists,
  notificationPreferences,
  notifications,
  outbox,
  sentReminders,
  staffSessions,
  subscriptions,
  tasks,
  user,
} from '@fp/db';
import { formatDate, formatTime, translate } from '@fp/i18n';
import type { Module } from '@fp/domain/permissions';
import { addInZone, startOfDayInZone, toLocalDate, toWallTime } from '@fp/domain/time';
import { ZipArchive } from 'archiver';
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { Db } from '../../infra/database.js';
import { MailerService, mailLayout } from '../../infra/mailer.service.js';
import { ObjectStorage } from '../../infra/storage.service.js';
import { BillingService } from '../billing/billing.service.js';
import { expandEvents } from '../calendar/calendar.service.js';
import { Queues } from '../events/queues.js';
import { exportModuleTables } from './gdpr-export.js';
import {
  DEFAULT_PREFERENCES,
  NotificationsService,
} from '../notifications/notifications.service.js';

const MINUTE = 60_000;

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly db: Db,
    private readonly queues: Queues,
    private readonly notifications: NotificationsService,
    private readonly storage: ObjectStorage,
    private readonly mailer: MailerService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit(): void {
    const jobs: Record<string, () => Promise<unknown>> = {
      reminders: () => this.eventReminders(),
      'tasks-due': () => this.tasksDue(),
      digest: () => this.dailyDigest(),
      gdpr: () => this.processGdpr(),
      cleanup: () => this.cleanup(),
    };
    for (const [name, fn] of Object.entries(jobs)) this.queues.on('maintenance', name, fn);
  }

  async registerSchedules(): Promise<void> {
    await this.queues.schedule('reminders', MINUTE);
    await this.queues.schedule('tasks-due', 5 * MINUTE);
    await this.queues.schedule('digest', 15 * MINUTE);
    await this.queues.schedule('gdpr', MINUTE);
    await this.queues.schedule('cleanup', 60 * MINUTE);
  }

  /** Records a one-time send; false when it was already sent. */
  private async once(householdId: string, key: string): Promise<boolean> {
    const rows = await this.db.system
      .insert(sentReminders)
      .values({ householdId, key })
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }

  /** Sends event reminders whose time (start − minutes) fell into the last few minutes. */
  async eventReminders(now = new Date()): Promise<number> {
    const windowStart = new Date(now.getTime() - 5 * MINUTE);
    const horizon = new Date(now.getTime() + 28 * 24 * 60 * MINUTE + MINUTE);
    const rows = await this.db.system
      .select()
      .from(events)
      .where(
        and(
          isNull(events.deletedAt),
          sql`cardinality(${events.reminders}) > 0`,
          lt(events.startAt, horizon),
          or(isNull(events.seriesEndAt), gte(events.seriesEndAt, now)),
        ),
      );
    if (rows.length === 0) return 0;
    const exs = await this.db.system
      .select()
      .from(eventExceptions)
      .where(
        inArray(
          eventExceptions.eventId,
          rows.map((r) => r.id),
        ),
      );
    const occ = expandEvents(rows, exs, now, horizon);
    const tzByHousehold = new Map<string, string>();
    let sent = 0;
    for (const o of occ) {
      const start = new Date(o.start);
      const e = rows.find((r) => r.id === o.eventId);
      if (!e) continue;
      for (const minutes of o.reminders) {
        const fireAt = start.getTime() - minutes * MINUTE;
        if (fireAt > now.getTime() || fireAt <= windowStart.getTime()) continue;
        if (!(await this.once(e.householdId, `event:${e.id}:${o.originalStart}:${minutes}`)))
          continue;
        if (!tzByHousehold.has(e.householdId)) {
          const [h] = await this.db.system
            .select({ tz: households.timezone })
            .from(households)
            .where(eq(households.id, e.householdId));
          tzByHousehold.set(e.householdId, h?.tz ?? 'Europe/Berlin');
        }
        const tz = tzByHousehold.get(e.householdId) as string;
        await this.notifications.notify({
          householdId: e.householdId,
          memberIds: o.attendeeMemberIds.length > 0 ? o.attendeeMemberIds : [e.createdByMemberId],
          type: 'event.reminder',
          message: 'notifications.eventReminder',
          vars: {
            title: o.title,
            when: o.allDay ? formatDate(start, 'de', 'UTC') : formatTime(start, 'de', tz),
          },
          link: `/calendar?event=${e.id}`,
        });
        sent++;
      }
    }
    return sent;
  }

  /** Notifies assignees when a task becomes due. */
  async tasksDue(now = new Date()): Promise<number> {
    const due = await this.db.system
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'open'),
          isNull(tasks.deletedAt),
          isNotNull(tasks.assigneeMemberId),
          lte(tasks.dueAt, now),
          gte(tasks.dueAt, new Date(now.getTime() - 60 * MINUTE)),
        ),
      );
    let sent = 0;
    for (const t of due) {
      if (!(await this.once(t.householdId, `task:${t.id}:due`))) continue;
      await this.notifications.notify({
        householdId: t.householdId,
        memberIds: [t.assigneeMemberId as string],
        type: 'task.due',
        message: 'notifications.taskDue',
        vars: { title: t.title },
        link: `/tasks/${t.id}`,
      });
      sent++;
    }
    return sent;
  }

  /** Morning digest per member at their preferred hour (household time zone). */
  async dailyDigest(now = new Date()): Promise<number> {
    const members = await this.db.system
      .select({
        member: householdMembers,
        household: households,
        prefs: notificationPreferences.prefs,
      })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .leftJoin(
        notificationPreferences,
        eq(notificationPreferences.userId, householdMembers.userId),
      )
      .where(
        and(
          isNull(householdMembers.removedAt),
          isNotNull(householdMembers.userId),
          isNull(households.deletedAt),
        ),
      );
    let sent = 0;
    for (const { member, household, prefs } of members) {
      const p = { ...DEFAULT_PREFERENCES, ...(prefs as object | null) };
      if (p.digest === 'off') continue;
      const tz = household.timezone;
      const local = toWallTime(now, tz);
      if (local.hour !== p.digestHour) continue;
      const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
      if (p.digest === 'weekly' && weekday !== 1) continue;
      const day = toLocalDate(now, tz);
      if (!(await this.once(household.id, `digest:${member.id}:${day}`))) continue;
      const from = startOfDayInZone(now, tz);
      const to = addInZone(from, 1, 'day', tz);
      const evs = await this.db.system
        .select()
        .from(events)
        .where(
          and(
            eq(events.householdId, household.id),
            isNull(events.deletedAt),
            lt(events.startAt, to),
            or(isNull(events.seriesEndAt), gte(events.seriesEndAt, from)),
          ),
        );
      const exs = evs.length
        ? await this.db.system
            .select()
            .from(eventExceptions)
            .where(
              inArray(
                eventExceptions.eventId,
                evs.map((e) => e.id),
              ),
            )
        : [];
      const mine = expandEvents(evs, exs, from, to).filter(
        (o) => o.attendeeMemberIds.length === 0 || o.attendeeMemberIds.includes(member.id),
      );
      const [taskCount] = await this.db.system
        .select({ n: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.householdId, household.id),
            eq(tasks.status, 'open'),
            isNull(tasks.deletedAt),
            eq(tasks.assigneeMemberId, member.id),
            lt(tasks.dueAt, to),
          ),
        );
      if (mine.length === 0 && (taskCount?.n ?? 0) === 0) continue;
      await this.notifications.notify({
        householdId: household.id,
        memberIds: [member.id],
        type: 'digest.daily',
        message: 'notifications.digest',
        vars: { events: mine.length, tasks: taskCount?.n ?? 0 },
        link: '/',
      });
      sent++;
    }
    return sent;
  }

  /** GDPR exports (ZIP of the user's data) and scheduled account deletions. */
  async processGdpr(): Promise<void> {
    const pending = await this.db.system
      .select()
      .from(gdprRequests)
      .where(eq(gdprRequests.status, 'pending'))
      .limit(5);
    for (const r of pending) {
      try {
        if (r.type === 'export') {
          await this.db.system
            .update(gdprRequests)
            .set({ status: 'processing' })
            .where(eq(gdprRequests.id, r.id));
          const key = await this.exportUserData(r.userId, r.id);
          await this.db.system
            .update(gdprRequests)
            .set({ status: 'done', completedAt: new Date(), resultKey: key })
            .where(eq(gdprRequests.id, r.id));
        } else {
          const [u] = await this.db.system.select().from(user).where(eq(user.id, r.userId));
          if (u && u.deletionScheduledAt && u.deletionScheduledAt <= new Date()) {
            await this.deleteUser(u.id);
            await this.db.system
              .update(gdprRequests)
              .set({ status: 'done', completedAt: new Date() })
              .where(eq(gdprRequests.id, r.id));
          } else if (!u || !u.deletionScheduledAt) {
            await this.db.system
              .update(gdprRequests)
              .set({ status: 'done', completedAt: new Date(), error: 'cancelled' })
              .where(eq(gdprRequests.id, r.id));
          }
        }
      } catch (e) {
        this.logger.error(`GDPR request ${r.id} failed: ${(e as Error).message}`);
        await this.db.system
          .update(gdprRequests)
          .set({ status: 'failed', error: (e as Error).message })
          .where(eq(gdprRequests.id, r.id));
      }
    }
  }

  private async exportUserData(userId: string, requestId: string): Promise<string> {
    const [u] = await this.db.system.select().from(user).where(eq(user.id, userId));
    if (!u) throw new Error('User not found');
    const memberships = await this.db.system
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    const zip = new ZipArchive({ zlib: { level: 9 } });
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      out.on('end', resolve);
      zip.on('error', reject);
    });
    zip.pipe(out);
    const add = (name: string, data: unknown) =>
      zip.append(JSON.stringify(data, null, 2), { name });
    add('profile.json', {
      id: u.id,
      name: u.name,
      email: u.email,
      locale: u.locale,
      createdAt: u.createdAt,
    });
    add(
      'notifications.json',
      await this.db.system.select().from(notifications).where(eq(notifications.userId, userId)),
    );
    for (const m of memberships) {
      const hid = m.householdId;
      const dir = `households/${hid}`;
      const [h] = await this.db.system.select().from(households).where(eq(households.id, hid));
      add(`${dir}/household.json`, { household: h, membership: m });
      add(
        `${dir}/events.json`,
        await this.db.system.select().from(events).where(eq(events.householdId, hid)),
      );
      add(
        `${dir}/tasks.json`,
        await this.db.system.select().from(tasks).where(eq(tasks.householdId, hid)),
      );
      add(
        `${dir}/lists.json`,
        await this.db.system.select().from(lists).where(eq(lists.householdId, hid)),
      );
      add(
        `${dir}/list-items.json`,
        await this.db.system.select().from(listItems).where(eq(listItems.householdId, hid)),
      );
      // Only accounts the user can see: household-wide or their own.
      const accounts = await this.db.system
        .select()
        .from(finAccounts)
        .where(
          and(
            eq(finAccounts.householdId, hid),
            or(eq(finAccounts.visibility, 'household'), eq(finAccounts.ownerMemberId, m.id)),
          ),
        );
      add(
        `${dir}/accounts.json`,
        accounts.map(({ ibanEncrypted: _iban, ...a }) => a),
      );
      if (accounts.length > 0) {
        add(
          `${dir}/transactions.json`,
          await this.db.system
            .select()
            .from(finTransactions)
            .where(
              inArray(
                finTransactions.accountId,
                accounts.map((a) => a.id),
              ),
            ),
        );
      }
      add(
        `${dir}/files.json`,
        await this.db.system
          .select()
          .from(files)
          .where(and(eq(files.householdId, hid), isNull(files.deletedAt))),
      );
      const modules = await exportModuleTables(this.db.system as never, hid, {
        id: m.id,
        role: m.role,
        grantedModules: (m.grantedModules as Module[] | null) ?? null,
        accessUntil: m.accessUntil,
      });
      for (const [table, rows] of Object.entries(modules))
        add(`${dir}/modules/${table}.json`, rows);
    }
    await zip.finalize();
    await done;
    const key = `exports/${userId}/${requestId}.zip`;
    await this.storage.put(key, Buffer.concat(chunks), 'application/zip');
    const url = await this.storage.presignGet(key, 'family-planer-export.zip', 7 * 24 * 3600);
    const locale = u.locale === 'en' ? 'en' : 'de';
    const subject = translate(locale, 'notifications.exportReady.subject');
    const body = translate(locale, 'notifications.exportReady.body');
    await this.mailer.send({
      to: u.email,
      subject,
      text: `${body}\n\n${url}`,
      html: mailLayout(subject, body, {
        label: translate(locale, 'notifications.exportReady.action'),
        url,
      }),
    });
    return key;
  }

  /** Deletes a user; households without remaining users are soft-deleted (purged later). */
  async deleteUser(userId: string): Promise<void> {
    const memberships = await this.db.system
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    await this.db.system.transaction(async (tx) => {
      await tx
        .update(householdMembers)
        .set({ removedAt: new Date() })
        .where(eq(householdMembers.userId, userId));
      await tx.delete(notifications).where(eq(notifications.userId, userId));
      await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
      await tx.delete(user).where(eq(user.id, userId));
      for (const m of memberships) {
        const [others] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, m.householdId),
              isNull(householdMembers.removedAt),
              isNotNull(householdMembers.userId),
            ),
          );
        if ((others?.n ?? 0) === 0)
          await tx
            .update(households)
            .set({ deletedAt: new Date() })
            .where(eq(households.id, m.householdId));
      }
    });
  }

  async cleanup(now = new Date()): Promise<void> {
    const day = 24 * 60 * MINUTE;
    await this.db.system
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - day)));
    await this.db.system
      .delete(outbox)
      .where(
        and(
          isNotNull(outbox.processedAt),
          lt(outbox.processedAt, new Date(now.getTime() - 7 * day)),
        ),
      );
    await this.db.system.delete(staffSessions).where(lt(staffSessions.expiresAt, now));
    await this.db.system
      .delete(sentReminders)
      .where(lt(sentReminders.sentAt, new Date(now.getTime() - 60 * day)));
    // Abandoned uploads.
    const stale = await this.db.system
      .delete(files)
      .where(
        and(eq(files.status, 'pending_upload'), lt(files.createdAt, new Date(now.getTime() - day))),
      )
      .returning({ key: files.storageKey });
    // Soft-deleted files and households past their grace period.
    const deletedFiles = await this.db.system
      .delete(files)
      .where(
        and(isNotNull(files.deletedAt), lt(files.deletedAt, new Date(now.getTime() - 30 * day))),
      )
      .returning({ key: files.storageKey, thumb: files.thumbnailKey });
    const purge = await this.db.system
      .select({ id: households.id })
      .from(households)
      .where(
        and(
          isNotNull(households.deletedAt),
          lt(households.deletedAt, new Date(now.getTime() - 30 * day)),
        ),
      );
    const keys = [
      ...stale.map((s) => s.key),
      ...deletedFiles.flatMap((f) => (f.thumb ? [f.key, f.thumb] : [f.key])),
    ];
    for (const h of purge) {
      const hf = await this.db.system
        .select({ key: files.storageKey, thumb: files.thumbnailKey })
        .from(files)
        .where(eq(files.householdId, h.id));
      keys.push(...hf.flatMap((f) => (f.thumb ? [f.key, f.thumb] : [f.key])));
      await this.db.system.delete(households).where(eq(households.id, h.id));
    }
    if (keys.length > 0)
      await this.storage.deleteMany(keys).catch((e: unknown) => {
        this.logger.warn(`Object cleanup failed: ${(e as Error).message}`);
      });
    // Expired complimentary plans.
    const expired = await this.db.system
      .select({ id: subscriptions.householdId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.provider, 'comp'),
          isNotNull(subscriptions.compUntil),
          lt(subscriptions.compUntil, now),
        ),
      );
    for (const s of expired)
      await this.billing.applyPlan(s.id, { plan: 'free', status: 'canceled', provider: null });
  }
}
