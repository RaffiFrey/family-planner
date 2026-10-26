import { createHash } from 'node:crypto';
import { parseRecurrenceRule } from '@fp/domain/recurrence';
import { fromWallTime, instantToFloating, isValidTimeZone } from '@fp/domain/time';
import ICAL from 'ical.js';

/** A VEVENT series from an external feed, normalized to the local event model. */
export interface ExternalOverride {
  /** Original start of the overridden occurrence (RECURRENCE-ID). */
  recurrenceId: Date;
  cancelled: boolean;
  start: Date;
  end: Date;
  title: string;
  description: string | null;
  location: string | null;
}

export interface ExternalEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  exdates: Date[];
  overrides: ExternalOverride[];
}

export interface ParsedFeed {
  events: ExternalEvent[];
  warnings: string[];
}

export class IcsParseError extends Error {
  override name = 'IcsParseError';
}

export const MAX_FEED_EVENTS = 5000;

/** Common Windows (Outlook/Exchange) zone names → IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
};

/** Maps a TZID parameter to an IANA zone ("/mozilla.org/…/Europe/Berlin", Windows names …). */
export function resolveTimeZone(tzid: string | null | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const id = tzid.replace(/^"|"$/g, '').trim();
  const mapped = WINDOWS_ZONES[id];
  if (mapped) return mapped;
  const parts = id.split('/').filter(Boolean);
  for (let i = Math.max(0, parts.length - 3); i < parts.length; i++) {
    const candidate = parts.slice(i).join('/');
    if (candidate.includes('/') && isValidTimeZone(candidate)) return candidate;
  }
  if (isValidTimeZone(id)) return id;
  return fallback;
}

interface TimeValue {
  date: Date;
  allDay: boolean;
  timezone: string;
}

function timeOf(prop: ICAL.Property, fallbackTz: string): TimeValue {
  return timeValue(
    prop.getFirstValue() as ICAL.Time,
    prop.getParameter('tzid') as string | undefined,
    fallbackTz,
  );
}

function timeValue(t: ICAL.Time, tzid: string | undefined, fallbackTz: string): TimeValue {
  if (t.isDate)
    return {
      date: new Date(Date.UTC(t.year, t.month - 1, t.day)),
      allDay: true,
      timezone: fallbackTz,
    };
  // `zone` is undefined at runtime for TZIDs without a registered VTIMEZONE.
  const zone = t.zone as { tzid?: string } | undefined;
  const utc = zone?.tzid === 'UTC' || t.toString().endsWith('Z');
  const timezone = utc ? 'UTC' : resolveTimeZone(tzid, fallbackTz);
  const date = fromWallTime(
    { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second },
    timezone,
  );
  return { date, allDay: false, timezone };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const floatingStamp = (d: Date) =>
  `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/**
 * Converts an RRULE from a feed into the stored form: UNTIL as floating wall time in the event's
 * zone (the recurrence engine works on wall time). Returns null for rules we can't represent.
 */
export function normalizeRrule(
  rule: string,
  ev: { allDay: boolean; timezone: string },
): string | null {
  const parts = rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter(Boolean)
    .map((p) => {
      const [k = '', v = ''] = p.split('=');
      const key = k.toUpperCase();
      if (key !== 'UNTIL') return `${key}=${v.toUpperCase()}`;
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i.exec(v);
      if (!m) return `UNTIL=${v}`;
      const [, y, mo, d, h, mi, s, z] = m;
      if (ev.allDay) return `UNTIL=${y}${mo}${d}`;
      if (h === undefined) return `UNTIL=${y}${mo}${d}T235959`;
      const instant = z
        ? new Date(
            Date.UTC(
              +(y as string),
              +(mo as string) - 1,
              +(d as string),
              +h,
              +(mi as string),
              +(s as string),
            ),
          )
        : null;
      return `UNTIL=${instant ? floatingStamp(instantToFloating(instant, ev.timezone)) : `${y}${mo}${d}T${h}${mi}${s}`}`;
    });
  const body = parts.join(';');
  try {
    parseRecurrenceRule(body);
    return body;
  } catch {
    return null;
  }
}

const clip = (s: string | null | undefined, max: number): string | null => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

function endOf(ev: ICAL.Event, start: TimeValue, fallbackTz: string): Date {
  const comp = ev.component;
  const dtend = comp.getFirstProperty('dtend');
  let end: Date;
  if (dtend) end = timeOf(dtend, fallbackTz).date;
  else if (comp.getFirstProperty('duration'))
    end = new Date(start.date.getTime() + ev.duration.toSeconds() * 1000);
  else end = start.allDay ? new Date(start.date.getTime() + 86_400_000) : start.date;
  return end < start.date ? start.date : end;
}

/** Parses an ICS document into normalized events (masters with exceptions grouped by UID). */
export function parseIcs(text: string, fallbackTz: string): ParsedFeed {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text) as unknown[]);
  } catch (e) {
    throw new IcsParseError(`Invalid ICS: ${(e as Error).message}`);
  }
  if (root.name !== 'vcalendar') throw new IcsParseError('Not a VCALENDAR');
  const warnings: string[] = [];
  const masters = new Map<string, ExternalEvent>();
  const orphans: { uid: string; comp: ICAL.Component }[] = [];
  const overrides: { uid: string; comp: ICAL.Component }[] = [];

  for (const comp of root.getAllSubcomponents('vevent')) {
    const uid = String(comp.getFirstPropertyValue('uid') ?? '').trim();
    if (!uid) {
      warnings.push('Skipped event without UID');
      continue;
    }
    if (comp.getFirstProperty('recurrence-id')) {
      overrides.push({ uid, comp });
      continue;
    }
    if (String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const dtstart = comp.getFirstProperty('dtstart');
    if (!dtstart) {
      warnings.push(`Skipped ${uid}: no DTSTART`);
      continue;
    }
    const ev = new ICAL.Event(comp);
    const start = timeOf(dtstart, fallbackTz);
    const rruleValue = comp.getFirstPropertyValue('rrule');
    let rrule: string | null = null;
    if (rruleValue) {
      rrule = normalizeRrule(String(rruleValue), start);
      if (!rrule) warnings.push(`${uid}: unsupported recurrence, imported first occurrence only`);
    }
    const exdates = rrule
      ? comp
          .getAllProperties('exdate')
          .flatMap((p) =>
            (p.getValues() as ICAL.Time[]).map(
              (t) =>
                timeValue(
                  t,
                  (p.getParameter('tzid') as string | undefined) ?? undefined,
                  start.timezone,
                ).date,
            ),
          )
      : [];
    masters.set(uid, {
      uid,
      title: clip(ev.summary, 200) ?? '(ohne Titel)',
      description: clip(ev.description, 5000),
      location: clip(ev.location, 300),
      start: start.date,
      end: endOf(ev, start, fallbackTz),
      allDay: start.allDay,
      timezone: start.allDay ? fallbackTz : start.timezone,
      rrule,
      exdates,
      overrides: [],
    });
    if (masters.size > MAX_FEED_EVENTS) throw new IcsParseError('Feed has too many events');
  }

  for (const { uid, comp } of overrides) {
    const master = masters.get(uid);
    const dtstart = comp.getFirstProperty('dtstart');
    if (!master?.rrule || !dtstart) {
      if (dtstart) orphans.push({ uid, comp });
      continue;
    }
    const ev = new ICAL.Event(comp);
    const rid = timeOf(comp.getFirstProperty('recurrence-id') as ICAL.Property, master.timezone);
    const start = timeOf(dtstart, master.timezone);
    master.overrides.push({
      recurrenceId: rid.date,
      cancelled: String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
      start: start.date,
      end: endOf(ev, start, master.timezone),
      title: clip(ev.summary, 200) ?? master.title,
      description: clip(ev.description, 5000),
      location: clip(ev.location, 300),
    });
  }

  // Overrides without a recurring master: keep them as single events.
  for (const { uid, comp } of orphans) {
    if (String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const ev = new ICAL.Event(comp);
    const start = timeOf(comp.getFirstProperty('dtstart') as ICAL.Property, fallbackTz);
    const rid = timeOf(comp.getFirstProperty('recurrence-id') as ICAL.Property, fallbackTz);
    const key = `${uid}#${rid.date.toISOString()}`;
    if (masters.has(key)) continue;
    masters.set(key, {
      uid: key,
      title: clip(ev.summary, 200) ?? '(ohne Titel)',
      description: clip(ev.description, 5000),
      location: clip(ev.location, 300),
      start: start.date,
      end: endOf(ev, start, fallbackTz),
      allDay: start.allDay,
      timezone: start.allDay ? fallbackTz : start.timezone,
      rrule: null,
      exdates: [],
      overrides: [],
    });
  }

  return { events: [...masters.values()], warnings };
}

/** Content hash of a normalized event; unchanged events are skipped on refresh. */
export function eventHash(e: ExternalEvent): string {
  const json = JSON.stringify({
    ...e,
    exdates: e.exdates.map((d) => d.getTime()).sort((a, b) => a - b),
    overrides: [...e.overrides].sort((a, b) => a.recurrenceId.getTime() - b.recurrenceId.getTime()),
  });
  return createHash('sha256').update(json).digest('hex');
}
