import { describe, expect, it } from 'vitest';
import { subtree } from '../modules/finance/finance.service.js';
import { buildIcs, escapeText, fold } from '../modules/calendar/ics.js';
import { guessCategory, normalizeItem } from '../modules/lists/categorize-item.js';
import { decodeCursor, encodeCursor, toPage } from './pagination.js';

describe('pagination', () => {
  it('round-trips cursors and rejects garbage', () => {
    const c = { v: '2026-10-25', id: 'abc' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor('not-a-cursor')).toThrow();
  });

  it('pages with limit + 1', () => {
    const rows = [1, 2, 3].map((n) => ({ n }));
    const p = toPage(
      rows,
      2,
      (r) => ({ v: String(r.n), id: String(r.n) }),
      (r) => r.n,
    );
    expect(p.items).toEqual([1, 2]);
    expect(decodeCursor(p.nextCursor ?? undefined)).toEqual({ v: '2', id: '2' });
    expect(
      toPage(
        rows,
        5,
        () => ({ v: '', id: '' }),
        (r) => r.n,
      ).nextCursor,
    ).toBeNull();
  });
});

describe('item categories', () => {
  it.each([
    ['Milch', 'dairy'],
    ['2x Bananen', 'produce'],
    ['Vollkornbrot', 'bakery'],
    ['Windeln Gr. 4', 'baby'],
    ['TK-Pizza', 'frozen'],
    ['Spülmaschinentabs', 'household'],
    ['Something odd', 'other'],
  ])('%s → %s', (text, cat) => {
    expect(guessCategory(text)).toBe(cat);
  });

  it('normalizes', () => {
    expect(normalizeItem('  Milch   FETTARM ')).toBe('milch fettarm');
  });
});

describe('finance subtree', () => {
  it('collects descendants', () => {
    const cats = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: null },
    ];
    expect(subtree(cats, 'a').sort()).toEqual(['a', 'b', 'c']);
    expect(subtree(cats, 'd')).toEqual(['d']);
  });
});

describe('ICS', () => {
  it('escapes and folds per RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = `SUMMARY:${'ä'.repeat(60)}`;
    const folded = fold(long);
    expect(folded.split('\r\n ').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('renders recurring events with exceptions', () => {
    const base = {
      id: 'e1',
      householdId: 'h',
      calendarId: 'c',
      title: 'Turnen',
      description: null,
      location: 'Halle',
      startAt: new Date('2026-11-02T16:00:00Z'),
      endAt: new Date('2026-11-02T17:00:00Z'),
      allDay: false,
      timezone: 'Europe/Berlin',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      seriesEndAt: null,
      attendeeMemberIds: [],
      reminders: [],
      color: null,
      createdByMemberId: 'm',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const ics = buildIcs(
      'Familie',
      [base],
      [
        {
          id: 'x',
          householdId: 'h',
          eventId: 'e1',
          originalStart: new Date('2026-11-09T16:00:00Z'),
          cancelled: true,
          startAt: null,
          endAt: null,
          overrides: null,
        },
      ],
      'api.example',
    );
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261102T170000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).toContain('EXDATE;TZID=Europe/Berlin:20261109T170000');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
