import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { apiContract } from '@fp/contracts';
import { calendars, eventExceptions, events } from '@fp/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { Endpoint, type In, Input } from '../../common/contract.js';
import { notFound } from '../../common/errors.js';
import { Household, type HouseholdContext } from '../../common/request-context.js';
import { ENV, type Env } from '../../config/env.js';
import { Db } from '../../infra/database.js';
import { CalendarService } from './calendar.service.js';
import { buildIcs } from './ics.js';

const C = apiContract.calendar;

@Controller()
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Endpoint(C.listCalendars, { action: 'calendar.read' })
  listCalendars(@Household() ctx: HouseholdContext) {
    return this.service.listCalendars(ctx);
  }

  @Endpoint(C.createCalendar, { action: 'calendar.write' })
  createCalendar(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createCalendar>) {
    return this.service.createCalendar(ctx, input);
  }

  @Endpoint(C.updateCalendar, { action: 'calendar.write' })
  updateCalendar(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateCalendar>) {
    return this.service.updateCalendar(ctx, input);
  }

  @Endpoint(C.deleteCalendar, { action: 'calendar.write' })
  deleteCalendar(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.deleteCalendar>) {
    return this.service.deleteCalendar(ctx, input);
  }

  @Endpoint(C.rotateIcsToken, { action: 'calendar.write' })
  rotateIcsToken(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.rotateIcsToken>) {
    return this.service.rotateIcsToken(ctx, input);
  }

  @Endpoint(C.occurrences, { action: 'calendar.read' })
  occurrences(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.occurrences>) {
    return this.service.occurrences(ctx, input);
  }

  @Endpoint(C.getEvent, { action: 'calendar.read' })
  getEvent(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.getEvent>) {
    return this.service.getEvent(ctx, input);
  }

  @Endpoint(C.createEvent, { action: 'calendar.write' })
  createEvent(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.createEvent>) {
    return this.service.createEvent(ctx, input);
  }

  @Endpoint(C.updateEvent, { action: 'calendar.write' })
  updateEvent(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.updateEvent>) {
    return this.service.updateEvent(ctx, input);
  }

  @Endpoint(C.deleteEvent, { action: 'calendar.write' })
  deleteEvent(@Household() ctx: HouseholdContext, @Input() input: In<typeof C.deleteEvent>) {
    return this.service.deleteEvent(ctx, input);
  }
}

/** Public ICS subscription feed; the unguessable token is the credential. */
@Controller()
export class IcsController {
  constructor(
    private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('/v1/ics/:file')
  async feed(@Param('file') file: string, @Res() reply: FastifyReply): Promise<void> {
    const token = file.replace(/\.ics$/, '');
    if (token.length < 32) throw notFound('Calendar');
    const [cal] = await this.db.system
      .select()
      .from(calendars)
      .where(eq(calendars.icsToken, token))
      .limit(1);
    if (!cal) throw notFound('Calendar');
    const rows = await this.db.system
      .select()
      .from(events)
      .where(and(eq(events.calendarId, cal.id), isNull(events.deletedAt)));
    const exs = rows.length
      ? await this.db.system
          .select()
          .from(eventExceptions)
          .where(
            inArray(
              eventExceptions.eventId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    const body = buildIcs(cal.name, rows, exs, new URL(this.env.API_PUBLIC_URL).hostname);
    await reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('cache-control', 'private, max-age=300')
      .send(body);
  }
}
