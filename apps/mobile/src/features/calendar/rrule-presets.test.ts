import { presetToRRule, RECURRENCE_PRESETS, rruleToPreset, rruleUntil } from './rrule-presets';

describe('presetToRRule', () => {
  it('returns null for one-off events', () => {
    expect(presetToRRule('none')).toBeNull();
  });

  it('builds RRULE bodies without DTSTART', () => {
    expect(presetToRRule('daily')).toBe('FREQ=DAILY');
    expect(presetToRRule('weekdays')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(presetToRRule('biweekly')).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(presetToRRule('yearly')).toBe('FREQ=YEARLY');
  });

  it('adds an inclusive UNTIL at the end of the day', () => {
    expect(presetToRRule('weekly', { until: '2026-12-24' })).toBe(
      'FREQ=WEEKLY;UNTIL=20261224T235959Z',
    );
  });

  it('adds COUNT when no UNTIL is given', () => {
    expect(presetToRRule('monthly', { count: 6 })).toBe('FREQ=MONTHLY;COUNT=6');
    expect(presetToRRule('monthly', { until: '2027-01-01', count: 6 })).toContain('UNTIL=');
  });

  it('rejects invalid options', () => {
    expect(() => presetToRRule('daily', { count: 0 })).toThrow();
    expect(() => presetToRRule('daily', { until: '24.12.2026' })).toThrow();
  });
});

describe('rruleToPreset', () => {
  it('round-trips every preset', () => {
    for (const preset of RECURRENCE_PRESETS) {
      expect(rruleToPreset(presetToRRule(preset))).toBe(preset);
      if (preset !== 'none')
        expect(rruleToPreset(presetToRRule(preset, { count: 3 }))).toBe(preset);
    }
  });

  it('accepts an RRULE: prefix and lower case', () => {
    expect(rruleToPreset('RRULE:freq=weekly;interval=2')).toBe('biweekly');
  });

  it('treats unknown rules as custom', () => {
    expect(rruleToPreset('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('custom');
    expect(rruleToPreset('FREQ=DAILY;INTERVAL=3')).toBe('custom');
    expect(rruleToPreset('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR')).toBe('custom');
  });

  it('reads UNTIL back as a local date', () => {
    expect(rruleUntil('FREQ=WEEKLY;UNTIL=20261224T235959Z')).toBe('2026-12-24');
    expect(rruleUntil('FREQ=WEEKLY')).toBeNull();
  });
});
