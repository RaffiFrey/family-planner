import { buildSplit } from './split';

const fmt = { exponent: 2, style: 'de' as const, currency: 'EUR' as const };

describe('buildSplit', () => {
  it('splits equally without values', () => {
    const r = buildSplit('equal', 1000, ['a', 'b', 'c'], {}, fmt);
    expect(r.amounts).toEqual([334, 333, 333]);
    expect(r.shares).toEqual([
      { partyId: 'a', value: null },
      { partyId: 'b', value: null },
      { partyId: 'c', value: null },
    ]);
  });

  it('uses exact amounts in minor units and checks the sum', () => {
    expect(buildSplit('exact', 3000, ['a', 'b'], { a: '20', b: '10' }, fmt).amounts).toEqual([
      2000, 1000,
    ]);
    expect(buildSplit('exact', 3000, ['a', 'b'], { a: '20', b: '5' }, fmt).error).toBe('exactSum');
    expect(buildSplit('exact', 3000, ['a', 'b'], { a: '30', b: '' }, fmt).amounts).toEqual([
      3000, 0,
    ]);
  });

  it('checks percentages add up to 100', () => {
    expect(buildSplit('percent', 1000, ['a', 'b'], { a: '70', b: '30' }, fmt).amounts).toEqual([
      700, 300,
    ]);
    expect(buildSplit('percent', 1000, ['a', 'b'], { a: '70', b: '20' }, fmt).error).toBe(
      'percentSum',
    );
  });

  it('weights by shares', () => {
    expect(buildSplit('shares', 900, ['a', 'b'], { a: '2', b: '1' }, fmt).amounts).toEqual([
      600, 300,
    ]);
    expect(buildSplit('shares', 900, ['a', 'b'], { a: '2', b: 'x' }, fmt).error).toBe('missing');
  });
});
