import {
  formatIngredient,
  ingredientsFromLines,
  isHttpUrl,
  parseIngredientLine,
  toLocalDate,
  weekDays,
} from './utils';

describe('meals utils', () => {
  it('builds Monday-based weeks', () => {
    const days = weekDays(new Date(2026, 9, 25)); // Sunday
    expect(days.map(toLocalDate)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('formats ingredients', () => {
    expect(formatIngredient({ quantity: 1.5, unit: 'tbsp', name: 'Öl' }, 'de-DE', () => 'EL')).toBe(
      '1,5 EL Öl',
    );
    expect(formatIngredient({ quantity: null, unit: null, name: 'Salz' }, 'de-DE', String)).toBe(
      'Salz',
    );
  });

  it('parses typed ingredient lines', () => {
    expect(parseIngredientLine('200 g Mehl')).toEqual({ quantity: 200, unit: 'g', name: 'Mehl' });
    expect(parseIngredientLine('1,5 EL Öl')).toEqual({ quantity: 1.5, unit: 'tbsp', name: 'Öl' });
    expect(parseIngredientLine('2 Eier')).toEqual({ quantity: 2, unit: null, name: 'Eier' });
    expect(parseIngredientLine('1/2 TL Salz')).toEqual({
      quantity: 0.5,
      unit: 'tsp',
      name: 'Salz',
    });
    expect(parseIngredientLine('Pfeffer')).toEqual({ quantity: null, unit: null, name: 'Pfeffer' });
    expect(parseIngredientLine('  ')).toBeNull();
  });

  it('validates URLs', () => {
    expect(isHttpUrl('https://example.com/rezept')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('kein link')).toBe(false);
  });
});

describe('ingredientsFromLines', () => {
  it('keeps note and category of unchanged ingredients', () => {
    const originals = [
      {
        quantity: 200,
        unit: 'g' as const,
        name: 'Mehl',
        note: 'Type 405',
        category: 'bakery' as const,
      },
    ];
    expect(ingredientsFromLines('250 g Mehl\n1 Handvoll Basilikum', originals)).toEqual([
      { quantity: 250, unit: 'g', name: 'Mehl', note: 'Type 405', category: 'bakery' },
      { quantity: 1, unit: 'handful', name: 'Basilikum', note: null },
    ]);
  });
});
