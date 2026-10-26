import { describe, expect, it } from 'vitest';
import {
  initialMaintenanceDue,
  MAINTENANCE_TEMPLATES,
  maintenanceReminderStage,
  maintenanceTemplate,
  nextMaintenanceDue,
  validateMaintenanceRecurrence,
} from './maintenance.js';
import { consumptionStats, formatMeterValue, isMeterValue, parseMeterValue } from './meters.js';

describe('maintenance schedules', () => {
  it('counts interval plans from the completion date', () => {
    const hu = maintenanceTemplate('hu');
    expect(hu?.recurrence).toEqual({ mode: 'interval', months: 24 });
    expect(
      nextMaintenanceDue(
        { mode: 'interval', months: 24 },
        { anchor: '2024-05-31', currentDue: '2026-05-31', doneOn: '2026-06-10' },
      ),
    ).toBe('2028-06-10');
    expect(initialMaintenanceDue({ mode: 'interval', months: 12 }, '2026-01-31')).toBe(
      '2027-01-31',
    );
  });

  it('follows calendar rules and skips missed occurrences', () => {
    const tyres = maintenanceTemplate('tyre_change');
    if (!tyres) throw new Error('missing template');
    expect(initialMaintenanceDue(tyres.recurrence, '2026-10-25')).toBe('2027-04-01');
    expect(initialMaintenanceDue(tyres.recurrence, '2026-04-01')).toBe('2026-04-01');
    // Done early: keeps the schedule.
    expect(
      nextMaintenanceDue(tyres.recurrence, {
        anchor: '2026-04-01',
        currentDue: '2026-10-01',
        doneOn: '2026-09-20',
      }),
    ).toBe('2027-04-01');
    // Done very late: skips the missed spring date.
    expect(
      nextMaintenanceDue(tyres.recurrence, {
        anchor: '2026-04-01',
        currentDue: '2026-10-01',
        doneOn: '2027-04-15',
      }),
    ).toBe('2027-10-01');
    expect(
      nextMaintenanceDue(
        { mode: 'rrule', rrule: 'FREQ=YEARLY;COUNT=1' },
        { anchor: '2026-01-01', currentDue: '2026-01-01', doneOn: '2026-01-01' },
      ),
    ).toBeNull();
  });

  it('validates and stages reminders', () => {
    expect(() => {
      validateMaintenanceRecurrence({ mode: 'interval', months: 0 });
    }).toThrow();
    expect(() => {
      validateMaintenanceRecurrence({ mode: 'rrule', rrule: 'NOPE' });
    }).toThrow();
    expect(maintenanceReminderStage('2026-12-01', '2026-10-25', 30)).toBeNull();
    expect(maintenanceReminderStage('2026-11-20', '2026-10-25', 30)).toBe('lead');
    expect(maintenanceReminderStage('2026-10-25', '2026-10-25', 30)).toBe('due');
    expect(maintenanceReminderStage('2026-10-01', '2026-10-25', 30)).toBe('due');
    expect(MAINTENANCE_TEMPLATES.map((t) => t.key)).toEqual([
      'hu',
      'tyre_change',
      'smoke_detector',
      'boiler_service',
    ]);
    expect(maintenanceTemplate('nope')).toBeUndefined();
  });
});

describe('meter readings', () => {
  it('parses and formats decimal values', () => {
    expect(parseMeterValue('123.45')).toBe(123450);
    expect(parseMeterValue('-1.5')).toBe(-1500);
    expect(parseMeterValue('7')).toBe(7000);
    expect(formatMeterValue(123450)).toBe('123.45');
    expect(formatMeterValue(-1500)).toBe('-1.5');
    expect(formatMeterValue(7000)).toBe('7');
    expect(isMeterValue('1.2345')).toBe(false);
    expect(() => parseMeterValue('abc')).toThrow();
  });

  it('computes consumption per interval, per month and per day', () => {
    const stats = consumptionStats(
      [
        { readAt: new Date('2026-03-01T00:00:00+01:00'), value: '1000' },
        { readAt: new Date('2026-01-01T00:00:00+01:00'), value: '400' },
        { readAt: new Date('2026-02-01T00:00:00+01:00'), value: '710' },
      ],
      { timeZone: 'Europe/Berlin' },
    );
    expect(stats.intervals.map((i) => [i.consumption, i.days, i.perDay])).toEqual([
      ['310', 31, '10'],
      ['290', 28, '10.357'],
    ]);
    expect(stats.total).toBe('600');
    expect(stats.days).toBe(59);
    expect(stats.avgPerDay).toBe('10.169');
    expect(stats.periods).toEqual([
      { period: '2026-01', consumption: '310', days: 31, perDay: '10' },
      { period: '2026-02', consumption: '290', days: 28, perDay: '10.357' },
    ]);
  });

  it('splits intervals across periods and skips meter resets', () => {
    const stats = consumptionStats(
      [
        { readAt: new Date('2025-12-17T00:00:00+01:00'), value: '0' },
        { readAt: new Date('2026-01-16T00:00:00+01:00'), value: '30' },
        { readAt: new Date('2026-01-20T00:00:00+01:00'), value: '5' },
        { readAt: new Date('2026-01-20T00:00:00+01:00'), value: '5' },
      ],
      { period: 'year' },
    );
    expect(stats.intervals[1]?.reset).toBe(true);
    expect(stats.total).toBe('30');
    expect(stats.periods).toEqual([
      { period: '2025', consumption: '15', days: 15, perDay: '1' },
      { period: '2026', consumption: '15', days: 15, perDay: '1' },
    ]);
    expect(consumptionStats([{ readAt: new Date(), value: '1' }])).toMatchObject({
      intervals: [],
      total: '0',
      avgPerDay: null,
      periods: [],
    });
  });
});

describe('consumptionStats with readings on the same day', () => {
  it('does not extrapolate sub-day spans to absurd daily rates', () => {
    const stats = consumptionStats([
      { readAt: new Date('2026-10-01T08:00:00Z'), value: '100' },
      { readAt: new Date('2026-10-01T08:30:00Z'), value: '102.5' },
    ]);
    expect(stats.intervals[0]?.perDay).toBe('2.5');
    expect(stats.avgPerDay).toBe('2.5');
    expect(stats.periods[0]?.perDay).toBe('2.5');
  });
});
