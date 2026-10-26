import { parsePointsDelta } from '@/features/rewards/hooks';
import { cleanPollOptions, optionPercent } from './hooks';

jest.mock('@/lib/api', () => ({ api: {} }));
jest.mock('@/features/household/household', () => ({}));

describe('poll helpers', () => {
  it('cleans options', () => {
    expect(cleanPollOptions([' Zoo ', 'zoo', '', 'Kino'])).toEqual(['Zoo', 'Kino']);
  });
  it('computes percentages', () => {
    expect(optionPercent(1, 3)).toBe(33);
    expect(optionPercent(0, 0)).toBe(0);
  });
});

describe('parsePointsDelta', () => {
  it('accepts signed whole numbers', () => {
    expect(parsePointsDelta('10')).toBe(10);
    expect(parsePointsDelta('+3')).toBe(3);
    expect(parsePointsDelta('-5')).toBe(-5);
  });
  it('rejects zero and garbage', () => {
    expect(parsePointsDelta('0')).toBeNull();
    expect(parsePointsDelta('1.5')).toBeNull();
    expect(parsePointsDelta('abc')).toBeNull();
  });
});
