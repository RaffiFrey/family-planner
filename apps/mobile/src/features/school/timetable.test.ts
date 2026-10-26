import type { Member, TimetableEntry } from '@fp/contracts';
import { defaultSchoolMemberId, groupByWeekday, isoWeekday, upcomingHolidays } from './timetable';

function entry(p: Partial<TimetableEntry>): TimetableEntry {
  return {
    id: Math.random().toString(36),
    memberId: 'm1',
    weekday: 1,
    period: 1,
    startTime: '08:00',
    endTime: '08:45',
    subject: 'Mathe',
    room: null,
    teacher: null,
    validFrom: null,
    validTo: null,
    week: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

describe('timetable helpers', () => {
  it('groups by weekday with A/B filter and keeps used weekends', () => {
    const groups = groupByWeekday(
      [
        entry({ weekday: 1, period: 2, subject: 'Deutsch' }),
        entry({ weekday: 1, period: 1 }),
        entry({ weekday: 3, week: 'A', subject: 'Sport' }),
        entry({ weekday: 6, subject: 'AG' }),
      ],
      'B',
    );
    expect(groups.map((g) => g.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(groups[0]?.entries.map((e) => e.subject)).toEqual(['Mathe', 'Deutsch']);
    expect(groups[2]?.entries).toHaveLength(0);
  });

  it('computes ISO weekdays', () => {
    expect(isoWeekday(new Date(2026, 9, 25))).toBe(7); // Sunday
    expect(isoWeekday(new Date(2026, 9, 26))).toBe(1);
  });

  it('picks the first child', () => {
    const m = (id: string, role: Member['role']) => ({ id, role }) as Member;
    expect(defaultSchoolMemberId([m('a', 'owner'), m('b', 'child')], 'a')).toBe('b');
    expect(defaultSchoolMemberId([m('a', 'owner')], 'a')).toBe('a');
  });

  it('lists current and upcoming holidays', () => {
    const list = upcomingHolidays(
      [
        { name: 'Sommer', start: '2026-07-01', end: '2026-08-10' },
        { name: 'Herbst', start: '2026-10-20', end: '2026-10-30' },
        { name: 'Weihnachten', start: '2026-12-21', end: '2027-01-02' },
      ],
      '2026-10-25',
    );
    expect(list.map((h) => [h.name, h.current])).toEqual([
      ['Herbst', true],
      ['Weihnachten', false],
    ]);
  });
});
