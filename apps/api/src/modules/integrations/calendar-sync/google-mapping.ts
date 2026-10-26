import { createHash } from 'node:crypto';
import {
  floatingToInstant,
  fromWallTime,
  instantToFloating,
  isValidTimeZone,
} from '@fp/domain/time';
import type { GoogleEvent, GoogleEventInput, GoogleEventTime } from './google-api.js';
import { normalizeRrule, resolveTimeZone } from './ics-import.js';

/** The local event fields that are synced. */
export interface SyncedEvent {
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const dateOf = (floating: Date) =>
  `${pad(floating.getUTCFullYear(), 4)}-${pad(floating.getUTCMonth() + 1)}-${pad(floating.getUTCDate())}`;
const stamp = (d: Date) =>
  `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/** Stored rules keep UNTIL as floating wall time; RFC 5545 wants UTC for zoned events. */
export function toGoogleRrule(rrule: string, e: Pick<SyncedEvent, 'allDay' | 'timezone'>): string {
  const body = rrule
    .split(';')
    .map((part) => {
      const m = /^UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/i.exec(part);
      if (!m) return part;
      const [, y, mo, d, h = '23', mi = '59', s = '59'] = m;
      if (e.allDay) return `UNTIL=${y}${mo}${d}`;
      const floating = new Date(
        Date.UTC(+(y as string), +(mo as string) - 1, +(d as string), +h, +mi, +s),
      );
      return `UNTIL=${stamp(floatingToInstant(floating, e.timezone))}Z`;
    })
    .join(';');
  return `RRULE:${body}`;
}

function exdateLine(originalStart: Date, e: Pick<SyncedEvent, 'allDay' | 'timezone'>): string {
  return e.allDay
    ? `EXDATE;VALUE=DATE:${dateOf(originalStart).replace(/-/g, '')}`
    : `EXDATE;TZID=${e.timezone}:${stamp(instantToFloating(originalStart, e.timezone))}`;
}

/** Local event (+ cancelled occurrences) → Google event resource. */
export function localToGoogle(
  e: SyncedEvent & { id: string },
  cancelled: readonly Date[] = [],
): GoogleEventInput {
  const time = (d: Date): GoogleEventTime =>
    e.allDay ? { date: dateOf(d) } : { dateTime: d.toISOString(), timeZone: e.timezone };
  return {
    summary: e.title,
    description: e.description,
    location: e.location,
    start: time(e.start),
    end: time(
      e.end.getTime() > e.start.getTime() || !e.allDay
        ? e.end
        : new Date(e.start.getTime() + 86_400_000),
    ),
    recurrence: e.rrule
      ? [
          toGoogleRrule(e.rrule, e),
          ...[...cancelled].sort((a, b) => a.getTime() - b.getTime()).map((d) => exdateLine(d, e)),
        ]
      : null,
    extendedProperties: { private: { fpEventId: e.id } },
  };
}

/** Parses an EXDATE line ("EXDATE;TZID=Europe/Berlin:20261027T150000,…"). */
export function parseExdateLine(line: string, fallbackTz: string): Date[] {
  const m = /^EXDATE([^:]*):(.+)$/i.exec(line.trim());
  if (!m) return [];
  const params = m[1] ?? '';
  const tz = resolveTimeZone(/TZID=([^;:]+)/i.exec(params)?.[1], fallbackTz);
  return (m[2] as string).split(',').flatMap((v) => {
    const p = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
    if (!p) return [];
    const n = p.slice(1, 7).map(Number);
    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = n;
    if (p[4] === undefined) return [new Date(Date.UTC(year, month - 1, day))];
    if (p[7]) return [new Date(Date.UTC(year, month - 1, day, hour, minute, second))];
    return [fromWallTime({ year, month, day, hour, minute, second }, tz)];
  });
}

/** Instant/floating date of a Google time object. */
export function googleTime(t: GoogleEventTime | undefined): { date: Date; allDay: boolean } | null {
  if (t?.dateTime) {
    const d = new Date(t.dateTime);
    return Number.isNaN(d.getTime()) ? null : { date: d, allDay: false };
  }
  if (t?.date) {
    const d = new Date(`${t.date}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : { date: d, allDay: true };
  }
  return null;
}

export interface MappedGoogleEvent extends SyncedEvent {
  exdates: Date[];
}

/** Google event resource → local fields. Null for cancelled or unusable events. */
export function googleToLocal(g: GoogleEvent, fallbackTz: string): MappedGoogleEvent | null {
  if (g.status === 'cancelled') return null;
  const start = googleTime(g.start);
  const end = googleTime(g.end);
  if (!start) return null;
  const tz = g.start?.timeZone && isValidTimeZone(g.start.timeZone) ? g.start.timeZone : fallbackTz;
  const ev = { allDay: start.allDay, timezone: start.allDay ? fallbackTz : tz };
  let rrule: string | null = null;
  const exdates: Date[] = [];
  for (const line of g.recurrence ?? []) {
    if (/^RRULE:/i.test(line)) rrule = normalizeRrule(line, ev);
    else if (/^EXDATE/i.test(line)) exdates.push(...parseExdateLine(line, ev.timezone));
  }
  const endDate =
    end && end.date >= start.date
      ? end.date
      : new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 0));
  return {
    title: (g.summary ?? '').trim().slice(0, 200) || '(ohne Titel)',
    description: g.description?.slice(0, 5000) ?? null,
    location: g.location?.slice(0, 300) ?? null,
    start: start.date,
    end: endDate,
    allDay: start.allDay,
    timezone: ev.timezone,
    rrule,
    exdates: rrule ? exdates : [],
  };
}

export type SyncDecision = 'push' | 'pull' | 'none';

/**
 * Conflict policy: last writer wins by modification time. Only one side changed → that side wins;
 * both changed → the newer `updated` wins (ties go to Google, the shared source).
 */
export function decide(p: {
  localChanged: boolean;
  remoteChanged: boolean;
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}): SyncDecision {
  if (p.localChanged && p.remoteChanged)
    return p.localUpdatedAt.getTime() > p.remoteUpdatedAt.getTime() ? 'push' : 'pull';
  if (p.remoteChanged) return 'pull';
  if (p.localChanged) return 'push';
  return 'none';
}

/** A moved/retitled single occurrence of a local series (`event_exceptions` row). */
export interface OccurrenceOverride {
  originalStart: Date;
  start: Date;
  end: Date;
  title?: string | undefined;
  description?: string | null | undefined;
  location?: string | null | undefined;
}

/**
 * Fingerprint of the exceptions pushed to Google: cancelled occurrences (EXDATEs) and
 * per-occurrence overrides (instance exceptions). Unchanged fingerprint means nothing to push.
 */
export function exceptionsHash(
  cancelled: readonly Date[],
  overrides: readonly OccurrenceOverride[] = [],
): string {
  if (cancelled.length === 0 && overrides.length === 0) return '';
  const o = [...overrides]
    .sort((a, b) => a.originalStart.getTime() - b.originalStart.getTime())
    .map((x) => [
      x.originalStart.getTime(),
      x.start.getTime(),
      x.end.getTime(),
      x.title ?? null,
      x.description ?? null,
      x.location ?? null,
    ]);
  const c = cancelled.map((d) => d.getTime()).sort((a, b) => a - b);
  return createHash('sha1')
    .update(JSON.stringify([c, o]))
    .digest('hex');
}

/** Override to Google instance exception (identified by the master id + original start). */
export function overrideToGoogle(
  master: SyncedEvent & { id: string },
  o: OccurrenceOverride,
): { originalStart: GoogleEventTime; body: GoogleEventInput } {
  const time = (d: Date): GoogleEventTime =>
    master.allDay ? { date: dateOf(d) } : { dateTime: d.toISOString(), timeZone: master.timezone };
  return {
    originalStart: time(o.originalStart),
    body: {
      summary: o.title ?? master.title,
      description: o.description !== undefined ? o.description : master.description,
      location: o.location !== undefined ? o.location : master.location,
      start: time(o.start),
      end: time(o.end),
      recurrence: null,
      extendedProperties: { private: { fpEventId: master.id } },
    },
  };
}
