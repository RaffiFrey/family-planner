import { parseIngredients } from './ingredients';

describe('parseIngredients', () => {
  it('splits on commas, semicolons and lines and removes duplicates', () => {
    expect(parseIngredients('Nudeln, Tomaten;\nKäse, Nudeln ,  ')).toEqual([
      'Nudeln',
      'Tomaten',
      'Käse',
    ]);
    expect(parseIngredients('')).toEqual([]);
  });
});
