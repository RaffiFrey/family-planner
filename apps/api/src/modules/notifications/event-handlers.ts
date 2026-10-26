import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { householdMembers, households, invitations } from '@fp/db';
import { translate } from '@fp/i18n';
import { formatDate } from '@fp/i18n';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../../config/env.js';
import { Db } from '../../infra/database.js';
import { MailerService, mailLayout } from '../../infra/mailer.service.js';
import { Queues } from '../events/queues.js';
import { NotificationsService } from './notifications.service.js';

interface Base {
  householdId: string;
  actorMemberId: string | null;
}

/** Turns domain events from the outbox into notifications. */
@Injectable()
export class NotificationEventHandlers implements OnModuleInit {
  constructor(
    private readonly queues: Queues,
    private readonly db: Db,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async actorName(memberId: string | null): Promise<string> {
    if (!memberId) return 'Family Planer';
    const [m] = await this.db.system
      .select({ name: householdMembers.displayName })
      .from(householdMembers)
      .where(eq(householdMembers.id, memberId));
    return m?.name ?? 'Family Planer';
  }

  private async timezone(householdId: string): Promise<string> {
    const [h] = await this.db.system
      .select({ tz: households.timezone })
      .from(households)
      .where(eq(households.id, householdId));
    return h?.tz ?? 'Europe/Berlin';
  }

  onModuleInit(): void {
    this.queues.on('events', 'task.assigned', async (job) => {
      const d = job.data as Base & { taskId: string; title: string; assigneeMemberId: string };
      await this.notifications.notify({
        householdId: d.householdId,
        memberIds: [d.assigneeMemberId],
        exceptMemberId: d.actorMemberId,
        type: 'task.assigned',
        message: 'notifications.taskAssigned',
        vars: { actor: await this.actorName(d.actorMemberId), title: d.title },
        link: `/tasks/${d.taskId}`,
      });
    });

    this.queues.on('events', 'event.invited', async (job) => {
      const d = job.data as Base & {
        eventId: string;
        title: string;
        start: string;
        memberIds: string[];
      };
      const tz = await this.timezone(d.householdId);
      await this.notifications.notify({
        householdId: d.householdId,
        memberIds: d.memberIds,
        exceptMemberId: d.actorMemberId,
        type: 'event.reminder',
        message: 'notifications.eventInvited',
        vars: {
          actor: await this.actorName(d.actorMemberId),
          title: d.title,
          when: formatDate(d.start, 'de', tz, { dateStyle: 'medium', timeStyle: 'short' }),
        },
        link: `/calendar?event=${d.eventId}`,
      });
    });

    this.queues.on('events', 'list.item_added', async (job) => {
      const d = job.data as Base & { listId: string; listName: string; text: string };
      const members = await this.db.system
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(eq(householdMembers.householdId, d.householdId), isNull(householdMembers.removedAt)),
        );
      await this.notifications.notify({
        householdId: d.householdId,
        memberIds: members.map((m) => m.id),
        exceptMemberId: d.actorMemberId,
        type: 'list.item_added',
        message: 'notifications.listItemAdded',
        vars: { actor: await this.actorName(d.actorMemberId), list: d.listName, text: d.text },
        link: `/lists/${d.listId}`,
      });
    });

    this.queues.on('events', 'household.member_joined', async (job) => {
      const d = job.data as Base & { memberId: string; displayName: string };
      const members = await this.db.system
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, d.householdId),
            isNull(householdMembers.removedAt),
            inArray(householdMembers.role, ['owner', 'admin', 'adult']),
          ),
        );
      await this.notifications.notify({
        householdId: d.householdId,
        memberIds: members.map((m) => m.id),
        exceptMemberId: d.memberId,
        type: 'household.member_joined',
        message: 'notifications.memberJoined',
        vars: { name: d.displayName },
        link: '/household',
      });
    });

    this.queues.on('events', 'storage.file_infected', async (job) => {
      const d = job.data as Base & { name: string; ownerMemberId: string };
      await this.notifications.notify({
        householdId: d.householdId,
        memberIds: [d.ownerMemberId],
        type: 'storage.file_infected',
        message: 'notifications.fileInfected',
        vars: { name: d.name },
        link: '/files',
      });
    });

    this.queues.on('events', 'invitation.created', async (job) => {
      const d = job.data as Base & { invitationId: string; email: string; inviter: string };
      const [row] = await this.db.system
        .select({ token: invitations.token, household: households.name, locale: households.locale })
        .from(invitations)
        .innerJoin(households, eq(households.id, invitations.householdId))
        .where(eq(invitations.id, d.invitationId));
      if (!row) return;
      const locale = row.locale === 'en' ? 'en' : 'de';
      const vars = { household: row.household, inviter: d.inviter };
      const url = `${this.env.WEB_URL}/join/${row.token}`;
      const subject = translate(locale, 'notifications.invitation.subject', vars);
      const body = translate(locale, 'notifications.invitation.body', vars);
      await this.mailer.send({
        to: d.email,
        subject,
        text: `${body}\n\n${url}`,
        html: mailLayout(subject, body, {
          label: translate(locale, 'notifications.invitation.action'),
          url,
        }),
      });
    });
  }
}
