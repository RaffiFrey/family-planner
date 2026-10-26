import { describe, expect, it } from 'vitest';
import { RecurrenceError } from '../recurrence/series.js';
import { checkupReminderStage, checkupWindows, CHECKUP_CODES } from './checkups.js';
import { medicationOccurrences, parseTimeOfDay, validateMedicationSchedule } from './medication.js';

describe('U-Untersuchungen', () => {
  const birthday = '2026-01-31';

  it('computes the G-BA windows from the birthday', () => {
    const w = checkupWindows(birthday, '2026-01-31');
    expect(w.map((x) => x.code)).toEqual([...CHECKUP_CODES]);
    const by = Object.fromEntries(w.map((x) => [x.code, x]));
    expect(by.U1).toMatchObject({ from: '2026-01-31', to: '2026-01-31', status: 'due' });
    expect(by.U2).toMatchObject({ from: '2026-02-02', to: '2026-02-09', latest: '2026-02-13' });
    // 4th–5th week of life: day 21 to day 34.
    expect(by.U3).toMatchObject({ from: '2026-02-21', to: '2026-03-06', latest: '2026-03-27' });
    // 3rd–4th month: from 2 months (month-end clamped) to the day before 4 months.
    expect(by.U4).toMatchObject({ from: '2026-03-31', to: '2026-05-30', status: 'upcoming' });
    expect(by.U7a).toMatchObject({ from: '2028-10-31', to: '2029-01-30' });
    expect(by.U9).toMatchObject({ from: '2030-12-31', to: '2031-05-30', latest: '2031-07-30' });
    expect(by.J1).toMatchObject({ from: '2038-01-31', to: '2040-01-30', latest: '2041-01-30' });
    expect(by.J2).toMatchObject({ from: '2042-01-31', to: '2044-01-30' });
  });

  it('derives the status from today and completed check-ups', () => {
    const done = { U2: '2026-02-05' };
    const w = checkupWindows(birthday, '2026-03-10', done);
    const by = Object.fromEntries(w.map((x) => [x.code, x]));
    expect(by.U1?.status).toBe('missed');
    expect(by.U2).toMatchObject({ status: 'done', doneOn: '2026-02-05' });
    expect(by.U3?.status).toBe('overdue');
    expect(by.U4?.status).toBe('upcoming');
    const record = checkupWindows(birthday, '2026-03-10', { U3: '2026-03-01' });
    expect(record.find((x) => x.code === 'U3')?.status).toBe('done');
  });

  it('picks reminder stages', () => {
    const at = (today: string, code: string) => {
      const w = checkupWindows(birthday, today).find((x) => x.code === code);
      if (!w) throw new Error('missing');
      return checkupReminderStage(w, today);
    };
    expect(at('2026-03-01', 'U4')).toBeNull();
    expect(at('2026-04-01', 'U4')).toBe('open');
    expect(at('2026-05-25', 'U4')).toBe('closing');
    expect(at('2026-04-20', 'U4')).toBeNull();
    expect(at('2026-06-05', 'U4')).toBe('overdue');
    expect(at('2026-06-14', 'U4')).toBeNull();
    expect(at('2026-07-01', 'U4')).toBeNull(); // missed
    expect(at('2026-02-05', 'U2')).toBe('open'); // short window: no "closing"
  });
});

describe('medication schedule', () => {
  const base = {
    times: ['08:00', '20:00'],
    rrule: 'FREQ=DAILY',
    startDate: '2026-03-27',
    endDate: '2026-03-30',
    timeZone: 'Europe/Berlin',
  };

  it('keeps wall-clock times across the DST change', () => {
    const occ = medicationOccurrences(base, {
      from: new Date('2026-03-01T00:00:00Z'),
      to: new Date('2026-04-30T00:00:00Z'),
    });
    expect(occ.map((o) => o.at.toISOString())).toEqual([
      '2026-03-27T07:00:00.000Z',
      '2026-03-27T19:00:00.000Z',
      '2026-03-28T07:00:00.000Z',
      '2026-03-28T19:00:00.000Z',
      '2026-03-29T06:00:00.000Z', // CEST from Mar 29
      '2026-03-29T18:00:00.000Z',
      '2026-03-30T06:00:00.000Z',
      '2026-03-30T18:00:00.000Z',
    ]);
    expect(occ[0]?.time).toBe('08:00');
  });

  it('supports weekly rules, open end and range limits', () => {
    const occ = medicationOccurrences(
      { ...base, times: ['07:30'], rrule: 'FREQ=WEEKLY;BYDAY=MO,TH', endDate: null },
      { from: new Date('2026-10-20T00:00:00Z'), to: new Date('2026-11-03T00:00:00Z') },
    );
    // Oct 22 (Thu, CEST), Oct 26 (Mon, CET), Oct 29 (Thu), Nov 2 (Mon).
    expect(occ.map((o) => o.at.toISOString())).toEqual([
      '2026-10-22T05:30:00.000Z',
      '2026-10-26T06:30:00.000Z',
      '2026-10-29T06:30:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
  });

  it('validates schedules', () => {
    expect(() => {
      validateMedicationSchedule({ ...base, times: [] });
    }).toThrow(RecurrenceError);
    expect(() => parseTimeOfDay('24:00')).toThrow(RecurrenceError);
    expect(() => {
      validateMedicationSchedule({ ...base, rrule: 'FREQ=HOURLY' });
    }).toThrow();
    expect(() => {
      validateMedicationSchedule({ ...base, endDate: '2026-03-01' });
    }).toThrow(/endDate/);
    expect(parseTimeOfDay('09:05')).toEqual({ hour: 9, minute: 5 });
  });
});
