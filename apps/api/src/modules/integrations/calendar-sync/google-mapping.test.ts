import { describe, expect, it } from 'vitest';
import {
  decide,
  exceptionsHash,
  googleTime,
  googleToLocal,
  localToGoogle,
  overrideToGoogle,
  parseExdateLine,
  toGoogleRrule,
} from './google-mapping.js';

const base = {
  id: '00000000-0000-7000-8000-000000000001',
  title: 'Schwimmen',
  description: null,
  location: 'Bad',
  start: new Date('2026-10-20T13:00:00Z'),
  end: new Date('2026-10-20T14:00:00Z'),
  allDay: false,
  timezone: 'Europe/Berlin',
  rrule: null,
};

describe('localToGoogle', () => {
  it('maps timed events with zone', () => {
    expect(localToGoogle(base)).toEqual({
      summary: 'Schwimmen',
      description: null,
      location: 'Bad',
      start: { dateTime: '2026-10-20T13:00:00.000Z', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-10-20T14:00:00.000Z', timeZone: 'Europe/Berlin' },
      recurrence: null,
      extendedProperties: { private: { fpEventId: base.id } },
    });
  });

  it('maps all-day and recurring events with EXDATEs', () => {
    const g = localToGoogle({ ...base, rrule: 'FREQ=WEEKLY;UNTIL=20261231T150000' }, [
      new Date('2026-11-03T14:00:00Z'),
      new Date('2026-10-27T14:00:00Z'),
    ]);
    expect(g.recurrence).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261231T140000Z',
      'EXDATE;TZID=Europe/Berlin:20261027T150000',
      'EXDATE;TZID=Europe/Berlin:20261103T150000',
    ]);
    const allDay = localToGoogle(
      {
        ...base,
        allDay: true,
        start: new Date('2026-10-03T00:00:00Z'),
        end: new Date('2026-10-03T00:00:00Z'),
        rrule: 'FREQ=YEARLY',
      },
      [new Date('2027-10-03T00:00:00Z')],
    );
    expect(allDay.start).toEqual({ date: '2026-10-03' });
    expect(allDay.end).toEqual({ date: '2026-10-04' });
    expect(allDay.recurrence).toEqual(['RRULE:FREQ=YEARLY', 'EXDATE;VALUE=DATE:20271003']);
    expect(toGoogleRrule('FREQ=DAILY;UNTIL=20261231', { allDay: true, timezone: 'UTC' })).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20261231',
    );
  });
});

describe('googleToLocal', () => {
  it('maps recurring timed events back', () => {
    expect(
      googleToLocal(
        {
          id: 'g1',
          summary: ' Yoga ',
          start: { dateTime: '2026-10-21T18:00:00+02:00', timeZone: 'Europe/Berlin' },
          end: { dateTime: '2026-10-21T19:00:00+02:00', timeZone: 'Europe/Berlin' },
          recurrence: [
            'RRULE:FREQ=WEEKLY;UNTIL=20261231T170000Z',
            'EXDATE;TZID=Europe/Berlin:20261028T180000,20261104T180000',
          ],
        },
        'UTC',
      ),
    ).toEqual({
      title: 'Yoga',
      description: null,
      location: null,
      start: new Date('2026-10-21T16:00:00Z'),
      end: new Date('2026-10-21T17:00:00Z'),
      allDay: false,
      timezone: 'Europe/Berlin',
      rrule: 'FREQ=WEEKLY;UNTIL=20261231T180000',
      exdates: [new Date('2026-10-28T17:00:00Z'), new Date('2026-11-04T17:00:00Z')],
    });
  });

  it('maps all-day events, cancelled and broken ones', () => {
    expect(
      googleToLocal(
        { id: 'g', start: { date: '2026-12-24' }, end: { date: '2026-12-27' } },
        'Europe/Berlin',
      ),
    ).toMatchObject({
      title: '(ohne Titel)',
      allDay: true,
      timezone: 'Europe/Berlin',
      start: new Date('2026-12-24T00:00:00Z'),
      end: new Date('2026-12-27T00:00:00Z'),
    });
    expect(googleToLocal({ id: 'g', status: 'cancelled' }, 'UTC')).toBeNull();
    expect(googleToLocal({ id: 'g', start: {} }, 'UTC')).toBeNull();
    expect(googleToLocal({ id: 'g', start: { dateTime: 'nope' } }, 'UTC')).toBeNull();
    expect(googleToLocal({ id: 'g', start: { date: '2026-12-24' } }, 'UTC')?.end).toEqual(
      new Date('2026-12-25T00:00:00Z'),
    );
  });

  it('parses EXDATE variants', () => {
    expect(parseExdateLine('EXDATE:20261028T170000Z', 'Europe/Berlin')).toEqual([
      new Date('2026-10-28T17:00:00Z'),
    ]);
    expect(parseExdateLine('EXDATE;VALUE=DATE:20261028', 'UTC')).toEqual([
      new Date('2026-10-28T00:00:00Z'),
    ]);
    expect(parseExdateLine('garbage', 'UTC')).toEqual([]);
    expect(parseExdateLine('EXDATE:xyz', 'UTC')).toEqual([]);
    expect(googleTime({ date: 'bad' })).toBeNull();
  });
});

describe('decide', () => {
  const t1 = new Date('2026-10-01T10:00:00Z');
  const t2 = new Date('2026-10-01T11:00:00Z');
  it('applies last-writer-wins', () => {
    expect(
      decide({ localChanged: true, remoteChanged: true, localUpdatedAt: t2, remoteUpdatedAt: t1 }),
    ).toBe('push');
    expect(
      decide({ localChanged: true, remoteChanged: true, localUpdatedAt: t1, remoteUpdatedAt: t2 }),
    ).toBe('pull');
    expect(
      decide({ localChanged: true, remoteChanged: true, localUpdatedAt: t1, remoteUpdatedAt: t1 }),
    ).toBe('pull');
    expect(
      decide({ localChanged: false, remoteChanged: true, localUpdatedAt: t2, remoteUpdatedAt: t1 }),
    ).toBe('pull');
    expect(
      decide({ localChanged: true, remoteChanged: false, localUpdatedAt: t1, remoteUpdatedAt: t2 }),
    ).toBe('push');
    expect(
      decide({
        localChanged: false,
        remoteChanged: false,
        localUpdatedAt: t1,
        remoteUpdatedAt: t2,
      }),
    ).toBe('none');
  });

  it('fingerprints cancelled occurrences order-independently', () => {
    expect(exceptionsHash([])).toBe('');
    expect(exceptionsHash([t1, t2])).toBe(exceptionsHash([t2, t1]));
  });

  it('includes occurrence overrides in the fingerprint', () => {
    const o = { originalStart: t1, start: t2, end: t2, title: 'Moved' };
    expect(exceptionsHash([], [o])).not.toBe('');
    expect(exceptionsHash([], [o])).not.toBe(exceptionsHash([], [{ ...o, title: 'Other' }]));
    expect(exceptionsHash([t1], [o])).not.toBe(exceptionsHash([t1]));
  });
});

describe('overrideToGoogle', () => {
  it('maps a moved, retitled occurrence to an instance exception', () => {
    const r = overrideToGoogle(
      { ...base, rrule: 'FREQ=WEEKLY' },
      {
        originalStart: new Date('2026-10-27T14:00:00Z'),
        start: new Date('2026-10-27T16:00:00Z'),
        end: new Date('2026-10-27T17:00:00Z'),
        title: 'Schwimmen (später)',
      },
    );
    expect(r).toEqual({
      originalStart: { dateTime: '2026-10-27T14:00:00.000Z', timeZone: 'Europe/Berlin' },
      body: {
        summary: 'Schwimmen (später)',
        description: null,
        location: 'Bad',
        start: { dateTime: '2026-10-27T16:00:00.000Z', timeZone: 'Europe/Berlin' },
        end: { dateTime: '2026-10-27T17:00:00.000Z', timeZone: 'Europe/Berlin' },
        recurrence: null,
        extendedProperties: { private: { fpEventId: base.id } },
      },
    });
    const allDay = overrideToGoogle(
      { ...base, allDay: true },
      {
        originalStart: new Date('2026-10-03T00:00:00Z'),
        start: new Date('2026-10-04T00:00:00Z'),
        end: new Date('2026-10-05T00:00:00Z'),
        description: 'neu',
        location: null,
      },
    );
    expect(allDay.originalStart).toEqual({ date: '2026-10-03' });
    expect(allDay.body).toMatchObject({ summary: 'Schwimmen', description: 'neu', location: null });
  });
});
