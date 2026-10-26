import { EMPTY_RECURRENCE, fromTaskRecurrence, toTaskRecurrence } from './recurrence-form';

describe('task recurrence form', () => {
  it('maps "none" to null', () => {
    expect(toTaskRecurrence(EMPTY_RECURRENCE)).toEqual({ ok: true, value: null });
  });

  it('builds a fixed schedule from a preset', () => {
    expect(toTaskRecurrence({ ...EMPTY_RECURRENCE, mode: 'fixed', preset: 'weekdays' })).toEqual({
      ok: true,
      value: { mode: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    });
  });

  it('builds a floating "every N days after completion" rule', () => {
    expect(
      toTaskRecurrence({ ...EMPTY_RECURRENCE, mode: 'floating', interval: ' 3 ', unit: 'day' }),
    ).toEqual({
      ok: true,
      value: { mode: 'floating', interval: 3, unit: 'day' },
    });
  });

  it('rejects invalid intervals', () => {
    for (const interval of ['0', '-1', '1.5', 'abc', '', '1001']) {
      expect(toTaskRecurrence({ ...EMPTY_RECURRENCE, mode: 'floating', interval })).toEqual({
        ok: false,
        error: 'interval',
      });
    }
  });

  it('round-trips existing recurrences, keeping unknown rules untouched', () => {
    const floating = { mode: 'floating' as const, interval: 2, unit: 'week' as const };
    expect(toTaskRecurrence(fromTaskRecurrence(floating))).toEqual({ ok: true, value: floating });
    const custom = { mode: 'fixed' as const, rrule: 'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR' };
    expect(fromTaskRecurrence(custom).preset).toBe('custom');
    expect(toTaskRecurrence(fromTaskRecurrence(custom))).toEqual({ ok: true, value: custom });
    expect(fromTaskRecurrence({ mode: 'fixed', rrule: 'FREQ=WEEKLY;INTERVAL=2' }).preset).toBe(
      'biweekly',
    );
  });
});
