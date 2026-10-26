import { Inject, Injectable, Logger } from '@nestjs/common';
import { type apiContract, type Preferences, RealtimeEvents } from '@fp/contracts';
import {
  householdMembers,
  notificationPreferences,
  notifications,
  pushDevices,
  user,
} from '@fp/db';
import { type Locale, translate } from '@fp/i18n';
import { toWallTime } from '@fp/domain/time';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../common/contract.js';
import { decodeCursor, toPage } from '../../common/pagination.js';
import type { UserContext } from '../../common/request-context.js';
import { ENV, type Env } from '../../config/env.js';
import { Db } from '../../infra/database.js';
import { MailerService, mailLayout } from '../../infra/mailer.service.js';
import { PushService } from '../../infra/push.service.js';
import { RealtimePublisher } from '../events/realtime.js';

type C = typeof apiContract.notifications;
type Channel = 'push' | 'email' | 'in_app';

/** Defaults per notification type when the user hasn't configured anything. */
const DEFAULT_CHANNELS: Record<string, Channel[]> = {
  'event.reminder': ['push', 'in_app'],
  'task.assigned': ['push', 'in_app'],
  'task.due': ['push', 'in_app'],
  'list.item_added': ['in_app'],
  'budget.warning': ['push', 'in_app'],
  'budget.exceeded': ['push', 'in_app', 'email'],
  'household.member_joined': ['push', 'in_app'],
  'storage.file_infected': ['in_app', 'email'],
  'digest.daily': ['push'],
  'system.announcement': ['in_app'],
  'finance.contract_notice': ['push', 'in_app', 'email'],
  'finance.goal_reached': ['push', 'in_app'],
  'finance.expense_added': ['push', 'in_app'],
  'finance.bank_sync_failed': ['push', 'in_app', 'email'],
  'vault.document_expiring': ['push', 'in_app', 'email'],
  'home.maintenance_due': ['push', 'in_app'],
  'health.medication': ['push'],
  'health.vaccination_due': ['push', 'in_app'],
  'health.checkup_due': ['push', 'in_app', 'email'],
  'rewards.points_earned': ['push', 'in_app'],
  'rewards.redeemed': ['push', 'in_app'],
  'pinboard.post': ['push', 'in_app'],
  'pinboard.poll': ['push', 'in_app'],
  'location.arrived': ['push'],
  'location.left': ['push'],
  'travel.upcoming': ['push', 'in_app'],
  'calendar.sync_failed': ['in_app', 'email'],
};

export const DEFAULT_PREFERENCES: Preferences = {
  channels: {},
  digest: 'daily',
  digestHour: 7,
  quietHours: { from: 22, to: 7 },
};

export interface NotifyInput {
  householdId: string | null;
  /** Recipients by member id (resolved to users; managed child profiles without a login are skipped). */
  memberIds?: string[];
  userIds?: string[];
  type: string;
  /** i18n key prefix, e.g. `notifications.taskAssigned` (uses `.title` and `.body`). */
  message: string;
  vars?: Record<string, string | number>;
  link?: string | null;
  /** Skip this member (usually the actor). */
  exceptMemberId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimePublisher,
    private readonly push: PushService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async getPreferences(userId: string): Promise<Preferences> {
    const [row] = await this.db.system
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return row
      ? { ...DEFAULT_PREFERENCES, ...(row.prefs as Partial<Preferences>) }
      : DEFAULT_PREFERENCES;
  }

  private channelsFor(prefs: Preferences, type: string): Channel[] {
    return prefs.channels[type] ?? DEFAULT_CHANNELS[type] ?? ['in_app'];
  }

  private inQuietHours(prefs: Preferences, timeZone: string): boolean {
    if (!prefs.quietHours) return false;
    const { from, to } = prefs.quietHours;
    const h = toWallTime(new Date(), timeZone).hour;
    return from <= to ? h >= from && h < to : h >= from || h < to;
  }

  /** Creates in-app notifications and fans out to push/email according to preferences. */
  async notify(input: NotifyInput): Promise<void> {
    const recipients = new Map<string, { userId: string; email: string; locale: Locale }>();
    if (input.memberIds?.length) {
      const rows = await this.db.system
        .select({
          memberId: householdMembers.id,
          userId: user.id,
          email: user.email,
          locale: user.locale,
        })
        .from(householdMembers)
        .innerJoin(user, eq(user.id, householdMembers.userId))
        .where(
          and(inArray(householdMembers.id, input.memberIds), isNull(householdMembers.removedAt)),
        );
      for (const r of rows) {
        if (r.memberId === input.exceptMemberId) continue;
        recipients.set(r.userId, {
          userId: r.userId,
          email: r.email,
          locale: r.locale === 'en' ? 'en' : 'de',
        });
      }
    }
    if (input.userIds?.length) {
      const rows = await this.db.system.select().from(user).where(inArray(user.id, input.userIds));
      for (const r of rows)
        recipients.set(r.id, {
          userId: r.id,
          email: r.email,
          locale: r.locale === 'en' ? 'en' : 'de',
        });
    }
    for (const r of recipients.values()) {
      try {
        await this.deliver(r, input);
      } catch (e) {
        this.logger.warn(`Delivering ${input.type} to ${r.userId} failed: ${(e as Error).message}`);
      }
    }
  }

  private async deliver(
    r: { userId: string; email: string; locale: Locale },
    input: NotifyInput,
  ): Promise<void> {
    const prefs = await this.getPreferences(r.userId);
    const channels = this.channelsFor(prefs, input.type);
    const title = translate(r.locale, `${input.message}.title`, input.vars);
    const body = translate(r.locale, `${input.message}.body`, input.vars);
    const link = input.link ?? null;
    if (channels.includes('in_app')) {
      const [n] = await this.db.system
        .insert(notifications)
        .values({
          userId: r.userId,
          householdId: input.householdId,
          type: input.type,
          title,
          body,
          link,
        })
        .returning();
      if (n) {
        this.realtime.toUser(r.userId, RealtimeEvents.notification, {
          id: n.id,
          householdId: n.householdId,
          type: n.type,
          title,
          body,
          link,
          readAt: null,
          createdAt: iso(n.createdAt),
        });
      }
    }
    if (channels.includes('push') && !this.inQuietHours(prefs, 'Europe/Berlin')) {
      const devices = await this.db.system
        .select()
        .from(pushDevices)
        .where(eq(pushDevices.userId, r.userId));
      if (devices.length > 0) {
        const invalid = await this.push.send(
          devices.map((d) => ({ to: d.token, title, body, data: { link, type: input.type } })),
        );
        if (invalid.length > 0)
          await this.db.system.delete(pushDevices).where(inArray(pushDevices.token, invalid));
      }
    }
    if (channels.includes('email')) {
      const url = link ? `${this.env.WEB_URL}${link}` : this.env.WEB_URL;
      await this.mailer.send({
        to: r.email,
        subject: title,
        text: `${body}\n\n${url}`,
        html: mailLayout(title, body, { label: 'Family Planer', url }),
      });
    }
  }

  // ------------------------------------------------------------ endpoints

  async list(u: UserContext, input: In<C['list']>): Promise<Out<C['list']>> {
    const q = input.query;
    const cursor = decodeCursor(q.cursor);
    const rows = await this.db.system
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, u.userId),
          q.unreadOnly ? isNull(notifications.readAt) : undefined,
          cursor
            ? or(
                lt(notifications.createdAt, new Date(cursor.v)),
                and(
                  eq(notifications.createdAt, new Date(cursor.v)),
                  lt(notifications.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(q.limit + 1);
    const [unread] = await this.db.system
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, u.userId), isNull(notifications.readAt)));
    const page = toPage(
      rows,
      q.limit,
      (n) => ({ v: iso(n.createdAt), id: n.id }),
      (n) => ({
        id: n.id,
        householdId: n.householdId,
        type: n.type as Out<C['list']>['items'][number]['type'],
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: isoOrNull(n.readAt),
        createdAt: iso(n.createdAt),
      }),
    );
    return { ...page, unreadCount: unread?.n ?? 0 };
  }

  async markRead(u: UserContext, input: In<C['markRead']>): Promise<Out<C['markRead']>> {
    await this.db.system
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, u.userId),
          isNull(notifications.readAt),
          input.body.ids ? inArray(notifications.id, input.body.ids) : undefined,
        ),
      );
    return OK;
  }

  async updatePreferences(
    u: UserContext,
    input: In<C['updatePreferences']>,
  ): Promise<Out<C['updatePreferences']>> {
    await this.db.system
      .insert(notificationPreferences)
      .values({ userId: u.userId, prefs: input.body })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { prefs: input.body } });
    return input.body;
  }

  async registerDevice(
    u: UserContext,
    input: In<C['registerDevice']>,
  ): Promise<Out<C['registerDevice']>> {
    await this.db.system
      .insert(pushDevices)
      .values({
        userId: u.userId,
        token: input.body.token,
        platform: input.body.platform,
        deviceName: input.body.deviceName ?? null,
      })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: { userId: u.userId, platform: input.body.platform, lastSeenAt: new Date() },
      });
    return OK;
  }

  async unregisterDevice(
    u: UserContext,
    input: In<C['unregisterDevice']>,
  ): Promise<Out<C['unregisterDevice']>> {
    await this.db.system
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, u.userId), eq(pushDevices.token, input.params.token)));
    return OK;
  }
}
