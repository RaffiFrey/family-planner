import type { eventExceptions, events } from '@fp/db';

type EventRow = typeof events.$inferSelect;
type ExceptionRow = typeof eventExceptions.$inferSelect;

/** RFC 5545 text escaping. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets as required by RFC 5545. */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Don't split inside a multi-byte UTF-8 sequence.
    while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join('\r\n ');
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dateStamp = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

function localStamp(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

function dt(prop: string, d: Date, e: EventRow): string {
  return e.allDay
    ? `${prop};VALUE=DATE:${dateStamp(d)}`
    : `${prop};TZID=${e.timezone}:${localStamp(d, e.timezone)}`;
}

/** Builds a VCALENDAR with recurring events, EXDATEs for cancellations and overrides as RECURRENCE-ID. */
export function buildIcs(
  name: string,
  rows: EventRow[],
  exceptions: ExceptionRow[],
  host: string,
): string {
  const now = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Planer//DE',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const e of rows) {
    const exs = exceptions.filter((x) => x.eventId === e.id);
    const vevent = (
      start: Date,
      end: Date,
      extra: string[],
      title = e.title,
      description = e.description,
      location = e.location,
    ) => [
      'BEGIN:VEVENT',
      `UID:${e.id}@${host}`,
      `DTSTAMP:${now}`,
      dt('DTSTART', start, e),
      dt('DTEND', end, e),
      `SUMMARY:${escapeText(title)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(location ? [`LOCATION:${escapeText(location)}`] : []),
      ...extra,
      'END:VEVENT',
    ];
    const exdates = exs.filter((x) => x.cancelled).map((x) => dt('EXDATE', x.originalStart, e));
    lines.push(
      ...vevent(e.startAt, e.endAt, [...(e.rrule ? [`RRULE:${e.rrule}`] : []), ...exdates]),
    );
    for (const x of exs.filter((x) => !x.cancelled && x.startAt && x.endAt)) {
      lines.push(
        ...vevent(
          x.startAt as Date,
          x.endAt as Date,
          [dt('RECURRENCE-ID', x.originalStart, e)],
          x.overrides?.title ?? e.title,
          x.overrides?.description !== undefined ? x.overrides.description : e.description,
          x.overrides?.location !== undefined ? x.overrides.location : e.location,
        ),
      );
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
