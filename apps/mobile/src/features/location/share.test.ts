import {
  clampAccuracy,
  distanceM,
  durationMinutes,
  parseCoordinate,
  regionFor,
  shouldSendPing,
  tonight,
} from './share';

describe('durationMinutes', () => {
  const now = new Date(2026, 9, 25, 18, 0, 0);
  it('uses fixed durations', () => {
    expect(durationMinutes('60', now)).toBe(60);
    expect(durationMinutes('1440', now)).toBe(1440);
    expect(durationMinutes('10080', now)).toBe(10080);
  });
  it('computes "until tonight"', () => {
    expect(durationMinutes('tonight', now)).toBe(5 * 60 + 59);
  });
  it('rolls "tonight" over to the next day shortly before midnight', () => {
    const late = new Date(2026, 9, 25, 23, 57, 0);
    expect(tonight(late).getDate()).toBe(26);
    expect(durationMinutes('tonight', late)).toBe(24 * 60 + 2);
  });
});

describe('ping throttling', () => {
  const home = { lat: 52.52, lng: 13.405 };
  it('measures distances', () => {
    expect(distanceM(home, home)).toBe(0);
    expect(Math.round(distanceM(home, { lat: 52.521, lng: 13.405 }))).toBe(111);
  });
  it('sends the first fix, then once per minute or after moving', () => {
    expect(shouldSendPing(null, home, 0)).toBe(true);
    const prev = { ...home, at: 0 };
    expect(shouldSendPing(prev, home, 30_000)).toBe(false);
    expect(shouldSendPing(prev, home, 60_000)).toBe(true);
    expect(shouldSendPing(prev, { lat: 52.521, lng: 13.405 }, 10_000)).toBe(true);
  });
  it('clamps accuracy', () => {
    expect(clampAccuracy(null)).toBe(100);
    expect(clampAccuracy(-3)).toBe(0);
    expect(clampAccuracy(1e9)).toBe(100_000);
  });
});

describe('coordinates', () => {
  it('parses comma and dot decimals', () => {
    expect(parseCoordinate('52,52', 'lat')).toBe(52.52);
    expect(parseCoordinate(' 13.4 ', 'lng')).toBe(13.4);
    expect(parseCoordinate('', 'lat')).toBeNull();
    expect(parseCoordinate('91', 'lat')).toBeNull();
    expect(parseCoordinate('abc', 'lng')).toBeNull();
  });
  it('builds a region around points', () => {
    expect(regionFor([])).toBeNull();
    const r = regionFor([
      { lat: 52, lng: 13 },
      { lat: 53, lng: 14 },
    ]);
    expect(r?.latitude).toBe(52.5);
    expect(r?.latitudeDelta).toBeCloseTo(1.5);
  });
});
