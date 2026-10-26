import { describe, expect, it } from 'vitest';
import {
  eventHash,
  IcsParseError,
  normalizeRrule,
  parseIcs,
  resolveTimeZone,
} from './ics-import.js';

const ics = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...events, 'END:VCALENDAR'].join('\r\n');

describe('resolveTimeZone', () => {
  it('maps IANA, prefixed and Windows ids', () => {
    expect(resolveTimeZone('Europe/Berlin', 'UTC')).toBe('Europe/Berlin');
    expect(resolveTimeZone('/mozilla.org/20050126_1/Europe/Vienna', 'UTC')).toBe('Europe/Vienna');
    expect(resolveTimeZone('"W. Europe Standard Time"', 'UTC')).toBe('Europe/Berlin');
    expect(resolveTimeZone('Custom Zone', 'Europe/Zurich')).toBe('Europe/Zurich');
    expect(resolveTimeZone(null, 'Europe/Zurich')).toBe('Europe/Zurich');
  });
});

describe('normalizeRrule', () => {
  const tz = { allDay: false, timezone: 'Europe/Berlin' };
  it('converts UTC UNTIL to floating wall time', () => {
    expect(normalizeRrule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T130000Z', tz)).toBe(
      'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T140000',
    );
    expect(normalizeRrule('FREQ=DAILY;UNTIL=20261231', tz)).toBe(
      'FREQ=DAILY;UNTIL=20261231T235959',
    );
    expect(
      normalizeRrule('FREQ=DAILY;UNTIL=20261231T100000Z', { allDay: true, timezone: 'UTC' }),
    ).toBe('FREQ=DAILY;UNTIL=20261231');
    expect(normalizeRrule('freq=monthly;count=3', tz)).toBe('FREQ=MONTHLY;COUNT=3');
  });
  it('rejects unsupported rules', () => {
    expect(normalizeRrule('FREQ=HOURLY', tz)).toBeNull();
    expect(normalizeRrule('FREQ=DAILY;BYHOUR=9', tz)).toBeNull();
  });
});

describe('parseIcs', () => {
  it('maps timed, all-day, recurring events with EXDATE and overrides', () => {
    const feed = parseIcs(
      ics(
        'BEGIN:VEVENT',
        'UID:weekly@test',
        'DTSTART;TZID=Europe/Berlin:20261020T150000',
        'DTEND;TZID=Europe/Berlin:20261020T160000',
        'RRULE:FREQ=WEEKLY;COUNT=5',
        'EXDATE;TZID=Europe/Berlin:20261027T150000',
        'SUMMARY:Schwimmen',
        'LOCATION:Hallenbad',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:weekly@test',
        'RECURRENCE-ID;TZID=Europe/Berlin:20261103T150000',
        'DTSTART;TZID=Europe/Berlin:20261103T170000',
        'DTEND;TZID=Europe/Berlin:20261103T180000',
        'SUMMARY:Schwimmen (später)',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:holiday@test',
        'DTSTART;VALUE=DATE:20261003',
        'SUMMARY:Tag der Deutschen Einheit',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:utc@test',
        'DTSTART:20261024T080000Z',
        'DURATION:PT30M',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:gone@test',
        'STATUS:CANCELLED',
        'DTSTART:20261024T080000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'SUMMARY:no uid',
        'DTSTART:20261024T080000Z',
        'END:VEVENT',
      ),
      'Europe/Berlin',
    );
    expect(feed.warnings).toEqual(['Skipped event without UID']);
    expect(feed.events).toHaveLength(3);
    const weekly = feed.events.find((e) => e.uid === 'weekly@test');
    expect(weekly).toMatchObject({
      title: 'Schwimmen',
      location: 'Hallenbad',
      allDay: false,
      timezone: 'Europe/Berlin',
      rrule: 'FREQ=WEEKLY;COUNT=5',
      start: new Date('2026-10-20T13:00:00Z'),
      end: new Date('2026-10-20T14:00:00Z'),
      exdates: [new Date('2026-10-27T14:00:00Z')],
    });
    expect(weekly?.overrides).toEqual([
      {
        recurrenceId: new Date('2026-11-03T14:00:00Z'),
        cancelled: false,
        start: new Date('2026-11-03T16:00:00Z'),
        end: new Date('2026-11-03T17:00:00Z'),
        title: 'Schwimmen (später)',
        description: null,
        location: null,
      },
    ]);
    expect(feed.events.find((e) => e.uid === 'holiday@test')).toMatchObject({
      allDay: true,
      start: new Date('2026-10-03T00:00:00Z'),
      end: new Date('2026-10-04T00:00:00Z'),
      rrule: null,
    });
    expect(feed.events.find((e) => e.uid === 'utc@test')).toMatchObject({
      timezone: 'UTC',
      title: '(ohne Titel)',
      start: new Date('2026-10-24T08:00:00Z'),
      end: new Date('2026-10-24T08:30:00Z'),
    });
  });

  it('keeps orphan overrides as single events and warns about unsupported rules', () => {
    const feed = parseIcs(
      ics(
        'BEGIN:VEVENT',
        'UID:orphan@test',
        'RECURRENCE-ID:20261101T100000Z',
        'DTSTART:20261101T110000Z',
        'DTEND:20261101T120000Z',
        'SUMMARY:Einzeltermin',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:hourly@test',
        'DTSTART:20261101T110000Z',
        'RRULE:FREQ=HOURLY',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:nostart@test',
        'SUMMARY:x',
        'END:VEVENT',
      ),
      'Europe/Berlin',
    );
    expect(feed.events.map((e) => e.uid).sort()).toEqual([
      'hourly@test',
      'orphan@test#2026-11-01T10:00:00.000Z',
    ]);
    expect(feed.warnings).toEqual([
      'hourly@test: unsupported recurrence, imported first occurrence only',
      'Skipped nostart@test: no DTSTART',
    ]);
  });

  it('rejects garbage', () => {
    expect(() => parseIcs('hello', 'UTC')).toThrow(IcsParseError);
    expect(() => parseIcs('BEGIN:VEVENT\r\nEND:VEVENT', 'UTC')).toThrow(/VCALENDAR/);
  });

  it('hashes content deterministically', () => {
    const [a] = parseIcs(
      ics('BEGIN:VEVENT', 'UID:a', 'DTSTART:20261101T110000Z', 'END:VEVENT'),
      'UTC',
    ).events;
    const [b] = parseIcs(
      ics('BEGIN:VEVENT', 'UID:a', 'DTSTART:20261101T110000Z', 'END:VEVENT'),
      'UTC',
    ).events;
    const [c] = parseIcs(
      ics('BEGIN:VEVENT', 'UID:a', 'DTSTART:20261101T120000Z', 'END:VEVENT'),
      'UTC',
    ).events;
    expect(eventHash(a!)).toBe(eventHash(b!));
    expect(eventHash(a!)).not.toBe(eventHash(c!));
  });
});
