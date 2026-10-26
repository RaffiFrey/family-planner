import { meterTypesFor, normalizeMeterValue } from './meters';

describe('meter helpers', () => {
  it('normalizes German and English numbers', () => {
    expect(normalizeMeterValue('12.345,6')).toBe('12345.6');
    expect(normalizeMeterValue('12345.6')).toBe('12345.6');
    expect(normalizeMeterValue('12 345')).toBe('12345');
    expect(normalizeMeterValue('1,234.5')).toBe('1234.5');
    expect(normalizeMeterValue('45.120')).toBe('45120');
    expect(normalizeMeterValue('0.125')).toBe('0.125');
    expect(normalizeMeterValue('1,2345')).toBeNull();
    expect(normalizeMeterValue('abc')).toBeNull();
    expect(normalizeMeterValue('')).toBeNull();
  });

  it('offers meter types per asset kind', () => {
    expect(meterTypesFor('vehicle')).toEqual(['mileage', 'other']);
    expect(meterTypesFor('home')).not.toContain('mileage');
  });
});
