import { z } from 'zod';
import {
  defineEndpoint,
  HouseholdParams,
  Id,
  IsoDateTime,
  LocalDate,
  Ok,
  withHousehold,
} from '../core.js';
import { ItemCategory, ListItem } from './lists.js';

export const INGREDIENT_UNITS = [
  'mg',
  'g',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'pinch',
  'piece',
  'can',
  'bunch',
  'clove',
  'pack',
  'slice',
  'tub',
  'jar',
  'handful',
  'sprig',
  'stalk',
] as const;
export const IngredientUnit = z.enum(INGREDIENT_UNITS);

export const RecipeIngredient = z.object({
  quantity: z.number().min(0).max(100_000).nullable(),
  unit: IngredientUnit.nullable(),
  name: z.string().trim().min(1).max(200),
  note: z.string().max(200).nullable(),
  category: ItemCategory,
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

const IngredientInput = RecipeIngredient.extend({
  quantity: RecipeIngredient.shape.quantity.default(null),
  unit: RecipeIngredient.shape.unit.default(null),
  note: RecipeIngredient.shape.note.default(null),
  /** Guessed from the name when omitted. */
  category: ItemCategory.optional(),
});

export const Recipe = z.object({
  id: Id,
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number().int().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  ingredients: z.array(RecipeIngredient),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  sourceUrl: z.string().nullable(),
  imageFileId: Id.nullable(),
  imageUrl: z.string().nullable(),
  createdByMemberId: Id,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Recipe = z.infer<typeof Recipe>;

export const RecipeSummary = Recipe.pick({
  id: true,
  title: true,
  servings: true,
  prepMinutes: true,
  cookMinutes: true,
  tags: true,
  imageFileId: true,
  imageUrl: true,
  updatedAt: true,
});

const RecipeBase = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  servings: z.number().int().min(1).max(100).nullable(),
  prepMinutes: z.number().int().min(0).max(10_000).nullable(),
  cookMinutes: z.number().int().min(0).max(10_000).nullable(),
  ingredients: z.array(IngredientInput).max(200),
  steps: z.array(z.string().trim().min(1).max(5000)).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  sourceUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable(),
  imageFileId: Id.nullable(),
  imageUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable(),
});

export const CreateRecipeBody = RecipeBase.extend({
  description: RecipeBase.shape.description.default(null),
  servings: RecipeBase.shape.servings.default(null),
  prepMinutes: RecipeBase.shape.prepMinutes.default(null),
  cookMinutes: RecipeBase.shape.cookMinutes.default(null),
  ingredients: RecipeBase.shape.ingredients.default([]),
  steps: RecipeBase.shape.steps.default([]),
  tags: RecipeBase.shape.tags.default([]),
  sourceUrl: RecipeBase.shape.sourceUrl.default(null),
  imageFileId: RecipeBase.shape.imageFileId.default(null),
  imageUrl: RecipeBase.shape.imageUrl.default(null),
});
export const UpdateRecipeBody = RecipeBase.partial();

export const RecipeListQuery = z.object({
  q: z.string().max(100).optional(),
  tag: z.string().max(40).optional(),
});

export const ImportRecipeBody = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
});

/** Parsed recipe before it is saved. */
export const RecipeDraft = Recipe.pick({
  title: true,
  description: true,
  servings: true,
  prepMinutes: true,
  cookMinutes: true,
  ingredients: true,
  steps: true,
  tags: true,
  sourceUrl: true,
  imageUrl: true,
});

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MealSlot = z.enum(MEAL_SLOTS);

export const MealPlanEntry = z.object({
  id: Id,
  date: LocalDate,
  slot: MealSlot,
  recipeId: Id.nullable(),
  title: z.string(),
  servings: z.number().int().nullable(),
  cookMemberId: Id.nullable(),
  notes: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type MealPlanEntry = z.infer<typeof MealPlanEntry>;

export const MealPlanQuery = z
  .object({ from: LocalDate, to: LocalDate })
  .refine((q) => q.from <= q.to, { message: 'from must be before to', path: ['to'] });

export const UpsertMealPlanBody = z
  .object({
    recipeId: Id.nullable().default(null),
    /** Free text (required without a recipe; defaults to the recipe title). */
    title: z.string().trim().min(1).max(200).nullable().default(null),
    servings: z.number().int().min(1).max(100).nullable().default(null),
    cookMemberId: Id.nullable().default(null),
    notes: z.string().max(1000).nullable().default(null),
  })
  .refine((b) => b.recipeId || b.title, {
    message: 'Either a recipe or a title is required',
    path: ['title'],
  });

export const PlanToShoppingBody = z
  .object({
    from: LocalDate,
    to: LocalDate,
    /** Target shopping list; defaults to the household's first shopping list. */
    listId: Id.optional(),
    skipStaples: z.boolean().default(true),
  })
  .refine((q) => q.from <= q.to, { message: 'from must be before to', path: ['to'] });

export const PlanToShoppingResult = z.object({
  listId: Id,
  items: z.array(ListItem),
  skipped: z.array(z.string()),
});

const tags = ['meals'];
const RecipeParams = withHousehold({ recipeId: Id });
const SlotParams = withHousehold({ date: LocalDate, slot: MealSlot });

export const mealsContract = {
  listRecipes: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/meals/recipes',
    summary: 'Recipe box',
    tags,
    params: HouseholdParams,
    query: RecipeListQuery,
    response: z.array(RecipeSummary),
  }),
  getRecipe: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/meals/recipes/:recipeId',
    summary: 'Recipe',
    tags,
    params: RecipeParams,
    response: Recipe,
  }),
  createRecipe: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/meals/recipes',
    summary: 'Create recipe',
    tags,
    params: HouseholdParams,
    body: CreateRecipeBody,
    response: Recipe,
  }),
  updateRecipe: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/meals/recipes/:recipeId',
    summary: 'Update recipe',
    tags,
    params: RecipeParams,
    body: UpdateRecipeBody,
    response: Recipe,
  }),
  removeRecipe: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/meals/recipes/:recipeId',
    summary: 'Delete recipe (planned meals keep their title)',
    tags,
    params: RecipeParams,
    response: Ok,
  }),
  previewImport: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/meals/recipes/import/preview',
    summary: 'Fetch a recipe page and parse its schema.org Recipe data',
    tags,
    params: HouseholdParams,
    body: ImportRecipeBody,
    response: RecipeDraft,
    status: 200,
  }),
  importRecipe: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/meals/recipes/import',
    summary: 'Import a recipe from a URL into the recipe box',
    tags,
    params: HouseholdParams,
    body: ImportRecipeBody,
    response: Recipe,
  }),
  plan: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/meals/plan',
    summary: 'Meal plan for a date range (max. 62 days)',
    tags,
    params: HouseholdParams,
    query: MealPlanQuery,
    response: z.array(MealPlanEntry),
  }),
  upsertEntry: defineEndpoint({
    method: 'PUT',
    path: '/v1/households/:householdId/meals/plan/:date/:slot',
    summary: 'Set the meal of a slot',
    tags,
    params: SlotParams,
    body: UpsertMealPlanBody,
    response: MealPlanEntry,
  }),
  removeEntry: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/meals/plan/:date/:slot',
    summary: 'Clear a slot',
    tags,
    params: SlotParams,
    response: Ok,
  }),
  toShoppingList: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/meals/plan/shopping-list',
    summary: 'Add the ingredients of planned meals to a shopping list (scaled and merged)',
    tags,
    params: HouseholdParams,
    body: PlanToShoppingBody,
    response: PlanToShoppingResult,
    status: 200,
  }),
} as const;
