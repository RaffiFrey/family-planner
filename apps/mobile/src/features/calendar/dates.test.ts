import { allDayEndIso, allDayIso, combineDayAndTime, occurrenceDayKeys } from './dates';

describe('all-day helpers', () => {
  it('stores all-day days as UTC midnight with an exclusive end', () => {
    expect(allDayIso('2026-10-25')).toBe('2026-10-25T00:00:00.000Z');
    expect(allDayEndIso('2026-10-31')).toBe('2026-11-01T00:00:00.000Z');
  });

  it('lists every day of a multi-day all-day event', () => {
    expect(
      occurrenceDayKeys({
        start: '2026-12-24T00:00:00.000Z',
        end: '2026-12-27T00:00:00.000Z',
        allDay: true,
      }),
    ).toEqual(['2026-12-24', '2026-12-25', '2026-12-26']);
  });
});

describe('combineDayAndTime', () => {
  it('parses HH:mm in local time', () => {
    const d = combineDayAndTime('2026-10-25', '9:30');
    expect(d?.getHours()).toBe(9);
    expect(d?.getMinutes()).toBe(30);
  });

  it('rejects invalid times', () => {
    expect(combineDayAndTime('2026-10-25', '25:00')).toBeNull();
    expect(combineDayAndTime('2026-10-25', 'abc')).toBeNull();
  });
});
