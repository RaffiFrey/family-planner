import { daysFromRrule, parseTimes, rruleFromDays } from './schedule';

describe('medication schedule helpers', () => {
  it('parses and normalizes times', () => {
    expect(parseTimes('20:00, 8:00 12.30')).toEqual(['08:00', '12:30', '20:00']);
    expect(parseTimes('08:00, 08:00')).toEqual(['08:00']);
    expect(parseTimes('25:00')).toBeNull();
    expect(parseTimes('morgens')).toBeNull();
    expect(parseTimes('')).toBeNull();
  });

  it('round-trips weekday rules', () => {
    expect(rruleFromDays([])).toBe('FREQ=DAILY');
    expect(rruleFromDays(['TH', 'MO'])).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
    expect(daysFromRrule('FREQ=WEEKLY;BYDAY=MO,TH')).toEqual(['MO', 'TH']);
    expect(daysFromRrule('FREQ=DAILY')).toHaveLength(7);
    expect(daysFromRrule('FREQ=DAILY;INTERVAL=2')).toBeNull();
  });
});
