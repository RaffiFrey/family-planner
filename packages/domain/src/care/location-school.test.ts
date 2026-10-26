import { describe, expect, it } from 'vitest';
import { evaluateGeofence, haversineMeters, hysteresisMeters, isValidLatLng } from './geo.js';
import {
  abWeek,
  holidaysInRange,
  isGermanState,
  isoWeekday,
  isSchoolHoliday,
  parseFerienApi,
  parseOpenHolidays,
  timetableForDate,
} from './school.js';

describe('geo', () => {
  it('computes haversine distances', () => {
    // Berlin Brandenburger Tor → München Marienplatz ≈ 503 km.
    const d = haversineMeters({ lat: 52.5163, lng: 13.3777 }, { lat: 48.1374, lng: 11.5755 });
    expect(d / 1000).toBeCloseTo(503.4, 0);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    // 0.001° latitude ≈ 111 m.
    expect(haversineMeters({ lat: 50, lng: 8 }, { lat: 50.001, lng: 8 })).toBeCloseTo(111.2, 0);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 50, lng: 8 })).toBe(true);
    expect(hysteresisMeters(50)).toBe(30);
    expect(hysteresisMeters(400)).toBe(100);
  });

  it('enters and leaves with hysteresis', () => {
    const school = { lat: 50, lng: 8, radiusM: 100 };
    const at = (metersNorth: number, accuracyM = 10) => ({
      lat: 50 + metersNorth / 111_195,
      lng: 8,
      accuracyM,
    });
    // Unknown state initialises silently.
    expect(evaluateGeofence(null, school, at(500))).toEqual({ state: 'outside', event: null });
    expect(evaluateGeofence(null, school, at(20))).toEqual({ state: 'inside', event: null });
    expect(evaluateGeofence(null, school, at(97, 20))).toEqual({ state: null, event: null });
    // Arrive.
    expect(evaluateGeofence('outside', school, at(50))).toEqual({
      state: 'inside',
      event: 'arrived',
    });
    // At the edge: no flapping.
    expect(evaluateGeofence('inside', school, at(120))).toEqual({ state: 'inside', event: null });
    expect(evaluateGeofence('outside', school, at(98, 10))).toEqual({
      state: 'outside',
      event: null,
    });
    // Clearly outside: leave.
    expect(evaluateGeofence('inside', school, at(200))).toEqual({
      state: 'outside',
      event: 'left',
    });
    // Too inaccurate to decide.
    expect(evaluateGeofence('inside', school, at(2000, 500))).toEqual({
      state: 'inside',
      event: null,
    });
  });
});

describe('school', () => {
  it('parses OpenHolidays responses', () => {
    const list = parseOpenHolidays([
      {
        startDate: '2026-03-30',
        endDate: '2026-04-10',
        name: [
          { language: 'EN', text: 'Easter holidays' },
          { language: 'DE', text: 'Osterferien' },
        ],
      },
      { startDate: '2025-12-22', endDate: '2026-01-05', name: [{ language: 'EN', text: 'Xmas' }] },
      { startDate: '2025-12-22', endDate: '2026-01-05', name: [{ language: 'EN', text: 'Xmas' }] },
      { startDate: 'nope', endDate: '2026-01-05' },
      { startDate: '2026-07-01', endDate: '2026-07-02' },
      { startDate: '2026-13-01', endDate: '2026-07-02' },
      'garbage',
    ]);
    expect(list).toEqual([
      { name: 'Xmas', start: '2025-12-22', end: '2026-01-05' },
      { name: 'Osterferien', start: '2026-03-30', end: '2026-04-10' },
      { name: 'Ferien', start: '2026-07-01', end: '2026-07-02' },
    ]);
    expect(() => parseOpenHolidays({})).toThrow();
  });

  it('parses ferien-api responses', () => {
    const list = parseFerienApi([
      {
        start: '2026-08-03T00:00Z',
        end: '2026-09-14T00:00Z',
        name: 'sommerferien',
        stateCode: 'BY',
      },
      { start: '2026-05-26T00:00Z', end: '2026-06-05T00:00Z', name: 'pfingstferien' },
      { start: '2026-05-26T00:00Z' },
      null,
    ]);
    expect(list).toEqual([
      { name: 'Pfingstferien', start: '2026-05-26', end: '2026-06-05' },
      { name: 'Sommerferien', start: '2026-08-03', end: '2026-09-14' },
    ]);
    expect(() => parseFerienApi('x')).toThrow();
    expect(holidaysInRange(list, '2026-06-01', '2026-07-31')).toHaveLength(1);
    expect(isSchoolHoliday(list, '2026-09-14')).toBe(true);
    expect(isSchoolHoliday(list, '2026-09-15')).toBe(false);
    expect(isGermanState('BY')).toBe(true);
    expect(isGermanState('XX')).toBe(false);
  });

  it('computes weekdays, A/B weeks and the timetable of a day', () => {
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(abWeek('2026-10-28', '2026-10-26')).toBe('A');
    expect(abWeek('2026-11-06', '2026-10-26')).toBe('B');
    expect(abWeek('2026-10-21', '2026-10-26')).toBe('B');
    const entries = [
      {
        id: 'math',
        weekday: 1,
        period: 2,
        startTime: '08:55',
        validFrom: null,
        validTo: null,
        week: null,
      },
      {
        id: 'de',
        weekday: 1,
        period: 1,
        startTime: '08:00',
        validFrom: null,
        validTo: null,
        week: null,
      },
      {
        id: 'art',
        weekday: 1,
        period: 3,
        startTime: '09:50',
        validFrom: null,
        validTo: null,
        week: 'B' as const,
      },
      {
        id: 'old',
        weekday: 1,
        period: 4,
        startTime: '10:45',
        validFrom: null,
        validTo: '2026-08-01',
        week: null,
      },
      {
        id: 'tue',
        weekday: 2,
        period: 1,
        startTime: '08:00',
        validFrom: '2026-09-01',
        validTo: null,
        week: null,
      },
    ];
    expect(
      timetableForDate(entries, '2026-10-26', { abAnchor: '2026-10-26' }).map((e) => e.id),
    ).toEqual(['de', 'math']);
    expect(
      timetableForDate(entries, '2026-11-02', { abAnchor: '2026-10-26' }).map((e) => e.id),
    ).toEqual(['de', 'math', 'art']);
    expect(timetableForDate(entries, '2026-11-02').map((e) => e.id)).toEqual(['de', 'math', 'art']);
    expect(
      timetableForDate(entries, '2026-11-02', {
        holidays: [{ name: 'Herbst', start: '2026-11-02', end: '2026-11-06' }],
      }),
    ).toEqual([]);
  });
});
