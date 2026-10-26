import { Injectable } from '@nestjs/common';
import type {
  apiContract,
  ITEM_CATEGORIES,
  ListItem as ListItemDto,
  MealPlanEntry as MealPlanEntryDto,
  Recipe as RecipeDto,
} from '@fp/contracts';
import {
  files,
  listItems,
  lists,
  mealPlanEntries,
  recipes,
  type RecipeIngredientJson,
  type Transaction,
} from '@fp/db';
import {
  extractRecipeFromHtml,
  type Ingredient,
  isPantryStaple,
  normalizeIngredientName,
  type RecipeDraft,
  shoppingLinesForPlan,
  tripNights,
  type Unit,
} from '@fp/domain/family';
import { and, asc, eq, gte, ilike, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { type In, iso, isoOrNull, OK, type Out } from '../../../common/contract.js';
import { badRequest, notFound } from '../../../common/errors.js';
import { actorOf, type HouseholdContext } from '../../../common/request-context.js';
import { visibleTo } from '../../../common/visibility.js';
import { Db } from '../../../infra/database.js';
import { guessCategory } from '../../lists/categorize-item.js';
import { assertMembers, householdLocale } from '../common.js';
import { RecipeFetcher } from './recipe-fetcher.js';

type C = typeof apiContract.meals;
type RecipeRow = typeof recipes.$inferSelect;
type EntryRow = typeof mealPlanEntries.$inferSelect;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];

const MAX_PLAN_DAYS = 62;

function toRecipe(r: RecipeRow): RecipeDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    ingredients: r.ingredients.map((i) => ({
      quantity: i.quantity,
      unit: i.unit as Unit | null,
      name: i.name,
      note: i.note,
      category: i.category as ItemCategory,
    })),
    steps: r.steps,
    tags: r.tags,
    sourceUrl: r.sourceUrl,
    imageFileId: r.imageFileId,
    imageUrl: r.imageUrl,
    createdByMemberId: r.createdByMemberId,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

function toEntry(e: EntryRow): MealPlanEntryDto {
  return {
    id: e.id,
    date: e.date,
    slot: e.slot,
    recipeId: e.recipeId,
    title: e.title,
    servings: e.servings,
    cookMemberId: e.cookMemberId,
    notes: e.notes,
    updatedAt: iso(e.updatedAt),
  };
}

function toListItem(i: typeof listItems.$inferSelect): ListItemDto {
  return {
    id: i.id,
    listId: i.listId,
    text: i.text,
    quantity: i.quantity,
    category: i.category as ItemCategory,
    checked: i.checked,
    checkedByMemberId: i.checkedByMemberId,
    checkedAt: isoOrNull(i.checkedAt),
    position: i.position,
  };
}

interface IngredientInput {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  category?: string | undefined;
}

function toIngredientJson(i: IngredientInput): RecipeIngredientJson {
  return {
    quantity: i.quantity,
    unit: i.unit,
    name: i.name.slice(0, 200),
    note: i.note?.slice(0, 200) ?? null,
    category: i.category ?? guessCategory(i.name),
  };
}

/** Clamps imported data to the limits the create/update bodies enforce. */
function draftValues(d: RecipeDraft) {
  const clampInt = (n: number | null, max: number) =>
    n === null ? null : Math.min(max, Math.max(0, Math.round(n)));
  return {
    title: d.title.slice(0, 200),
    description: d.description?.slice(0, 5000) ?? null,
    servings: d.servings === null ? null : Math.min(100, Math.max(1, d.servings)),
    prepMinutes: clampInt(d.prepMinutes, 10_000),
    cookMinutes: clampInt(d.cookMinutes, 10_000),
    ingredients: d.ingredients
      .filter((i) => i.name.trim())
      .map((i) =>
        toIngredientJson({
          ...i,
          quantity: i.quantity === null ? null : Math.min(100_000, i.quantity),
        }),
      ),
    steps: d.steps.map((s) => s.slice(0, 5000)),
    tags: d.tags.map((t) => t.slice(0, 40)),
    sourceUrl: d.sourceUrl && d.sourceUrl.length <= 2000 ? d.sourceUrl : null,
    imageUrl: d.imageUrl && d.imageUrl.length <= 2000 ? d.imageUrl : null,
  };
}

@Injectable()
export class MealsService {
  constructor(
    private readonly db: Db,
    private readonly fetcher: RecipeFetcher,
  ) {}

  private async load(tx: Transaction, id: string): Promise<RecipeRow> {
    const [r] = await tx.select().from(recipes).where(eq(recipes.id, id));
    if (!r) throw notFound('Recipe');
    return r;
  }

  private async assertImage(
    tx: Transaction,
    ctx: HouseholdContext,
    fileId: string | null | undefined,
  ): Promise<void> {
    if (!fileId) return;
    const [f] = await tx
      .select({ id: files.id, mimeType: files.mimeType })
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          isNull(files.deletedAt),
          visibleTo(ctx.member.id, { visibility: files.visibility, owner: files.ownerMemberId }),
        ),
      );
    if (!f?.mimeType.startsWith('image/')) throw badRequest('Unknown image file', 'invalid_file');
  }

  async listRecipes(
    ctx: HouseholdContext,
    input: In<C['listRecipes']>,
  ): Promise<Out<C['listRecipes']>> {
    const { q, tag } = input.query;
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(recipes)
        .where(
          and(
            q ? ilike(recipes.title, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined,
            tag ? sql`${tag} = any(${recipes.tags})` : undefined,
          ),
        )
        .orderBy(asc(recipes.title))
        .limit(1000);
      return rows.map((r) => {
        const d = toRecipe(r);
        return {
          id: d.id,
          title: d.title,
          servings: d.servings,
          prepMinutes: d.prepMinutes,
          cookMinutes: d.cookMinutes,
          tags: d.tags,
          imageFileId: d.imageFileId,
          imageUrl: d.imageUrl,
          updatedAt: d.updatedAt,
        };
      });
    });
  }

  async getRecipe(ctx: HouseholdContext, input: In<C['getRecipe']>): Promise<Out<C['getRecipe']>> {
    return this.db.tenant(actorOf(ctx), async (tx) =>
      toRecipe(await this.load(tx, input.params.recipeId)),
    );
  }

  async createRecipe(
    ctx: HouseholdContext,
    input: In<C['createRecipe']>,
  ): Promise<Out<C['createRecipe']>> {
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await this.assertImage(tx, ctx, b.imageFileId);
      const [row] = await tx
        .insert(recipes)
        .values({
          householdId: ctx.householdId,
          ...b,
          ingredients: b.ingredients.map(toIngredientJson),
          createdByMemberId: ctx.member.id,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('recipe', row.id, 'created');
      ev.audit('recipe.created', 'recipe', row.id, { title: row.title });
      return toRecipe(row);
    });
  }

  async updateRecipe(
    ctx: HouseholdContext,
    input: In<C['updateRecipe']>,
  ): Promise<Out<C['updateRecipe']>> {
    const { ingredients, ...rest } = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, input.params.recipeId);
      await this.assertImage(tx, ctx, rest.imageFileId);
      const [row] = await tx
        .update(recipes)
        .set({
          ...rest,
          ...(ingredients !== undefined ? { ingredients: ingredients.map(toIngredientJson) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, current.id))
        .returning();
      if (!row) throw notFound('Recipe');
      ev.changed('recipe', row.id, 'updated');
      return toRecipe(row);
    });
  }

  async removeRecipe(
    ctx: HouseholdContext,
    input: In<C['removeRecipe']>,
  ): Promise<Out<C['removeRecipe']>> {
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const current = await this.load(tx, input.params.recipeId);
      await tx.delete(recipes).where(eq(recipes.id, current.id));
      ev.changed('recipe', current.id, 'deleted');
      ev.audit('recipe.deleted', 'recipe', current.id, { title: current.title });
    });
    return OK;
  }

  private async draftFromUrl(url: string): Promise<RecipeDraft> {
    const page = await this.fetcher.fetchHtml(url);
    const draft = extractRecipeFromHtml(page.html, page.url);
    if (!draft) throw badRequest('No recipe data found on this page', 'no_recipe');
    return draft;
  }

  async previewImport(
    _ctx: HouseholdContext,
    input: In<C['previewImport']>,
  ): Promise<Out<C['previewImport']>> {
    const v = draftValues(await this.draftFromUrl(input.body.url));
    return {
      ...v,
      ingredients: v.ingredients.map((i) => ({
        ...i,
        unit: i.unit as Unit | null,
        category: i.category as ItemCategory,
      })),
    };
  }

  async importRecipe(
    ctx: HouseholdContext,
    input: In<C['importRecipe']>,
  ): Promise<Out<C['importRecipe']>> {
    const v = draftValues(await this.draftFromUrl(input.body.url));
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .insert(recipes)
        .values({ householdId: ctx.householdId, ...v, createdByMemberId: ctx.member.id })
        .returning();
      if (!row) throw new Error('insert failed');
      ev.changed('recipe', row.id, 'created');
      ev.audit('recipe.imported', 'recipe', row.id, { title: row.title, url: row.sourceUrl });
      return toRecipe(row);
    });
  }

  // ---------------------------------------------------------------- meal plan

  private assertRange(from: string, to: string): void {
    if (tripNights(from, to) >= MAX_PLAN_DAYS)
      throw badRequest(
        `The range may span at most ${String(MAX_PLAN_DAYS)} days`,
        'range_too_large',
      );
  }

  async plan(ctx: HouseholdContext, input: In<C['plan']>): Promise<Out<C['plan']>> {
    const { from, to } = input.query;
    this.assertRange(from, to);
    return this.db.tenant(actorOf(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(mealPlanEntries)
        .where(and(gte(mealPlanEntries.date, from), lte(mealPlanEntries.date, to)))
        .orderBy(
          asc(mealPlanEntries.date),
          sql`array_position(array['breakfast','lunch','dinner','snack'], ${mealPlanEntries.slot})`,
        );
      return rows.map(toEntry);
    });
  }

  async upsertEntry(
    ctx: HouseholdContext,
    input: In<C['upsertEntry']>,
  ): Promise<Out<C['upsertEntry']>> {
    const { date, slot } = input.params;
    const b = input.body;
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      await assertMembers(tx, [b.cookMemberId]);
      const recipe = b.recipeId ? await this.load(tx, b.recipeId) : null;
      const values = {
        recipeId: recipe?.id ?? null,
        title: b.title ?? recipe?.title ?? '',
        servings: b.servings,
        cookMemberId: b.cookMemberId,
        notes: b.notes,
      };
      const [row] = await tx
        .insert(mealPlanEntries)
        .values({
          householdId: ctx.householdId,
          date,
          slot,
          ...values,
          createdByMemberId: ctx.member.id,
        })
        .onConflictDoUpdate({
          target: [mealPlanEntries.householdId, mealPlanEntries.date, mealPlanEntries.slot],
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error('upsert failed');
      ev.changed('meal_plan', row.id, 'updated');
      return toEntry(row);
    });
  }

  async removeEntry(
    ctx: HouseholdContext,
    input: In<C['removeEntry']>,
  ): Promise<Out<C['removeEntry']>> {
    const { date, slot } = input.params;
    await this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const [row] = await tx
        .delete(mealPlanEntries)
        .where(and(eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot)))
        .returning({ id: mealPlanEntries.id });
      if (!row) throw notFound('Meal');
      ev.changed('meal_plan', row.id, 'deleted');
    });
    return OK;
  }

  private async targetList(
    tx: Transaction,
    ctx: HouseholdContext,
    listId: string | undefined,
  ): Promise<{ list: typeof lists.$inferSelect; created: boolean }> {
    const visible = visibleTo(ctx.member.id, {
      visibility: lists.visibility,
      owner: lists.ownerMemberId,
    });
    if (listId) {
      const [l] = await tx
        .select()
        .from(lists)
        .where(and(eq(lists.id, listId), visible));
      if (!l) throw notFound('List');
      return { list: l, created: false };
    }
    const [first] = await tx
      .select()
      .from(lists)
      .where(and(eq(lists.kind, 'shopping'), visible))
      .orderBy(asc(lists.createdAt))
      .limit(1);
    if (first) return { list: first, created: false };
    const [l] = await tx
      .insert(lists)
      .values({
        householdId: ctx.householdId,
        name: householdLocale(ctx) === 'en' ? 'Shopping list' : 'Einkaufsliste',
        kind: 'shopping',
        ownerMemberId: ctx.member.id,
      })
      .returning();
    if (!l) throw new Error('insert failed');
    return { list: l, created: true };
  }

  async toShoppingList(
    ctx: HouseholdContext,
    input: In<C['toShoppingList']>,
  ): Promise<Out<C['toShoppingList']>> {
    const b = input.body;
    this.assertRange(b.from, b.to);
    return this.db.tenant(actorOf(ctx), async (tx, ev) => {
      const planned = await tx
        .select({ entry: mealPlanEntries, recipe: recipes })
        .from(mealPlanEntries)
        .innerJoin(recipes, eq(recipes.id, mealPlanEntries.recipeId))
        .where(
          and(
            gte(mealPlanEntries.date, b.from),
            lte(mealPlanEntries.date, b.to),
            isNotNull(mealPlanEntries.recipeId),
          ),
        )
        .orderBy(asc(mealPlanEntries.date));
      const { list, created } = await this.targetList(tx, ctx, b.listId);
      if (created) ev.changed('list', list.id, 'created');

      const categories = new Map<string, string>();
      const meals = planned.map(({ entry, recipe }) => ({
        recipeServings: recipe.servings,
        plannedServings: entry.servings,
        ingredients: recipe.ingredients.map((i): Ingredient => {
          const key = normalizeIngredientName(i.name);
          if (!categories.has(key)) categories.set(key, i.category);
          return { quantity: i.quantity, unit: i.unit as Unit | null, name: i.name, note: i.note };
        }),
      }));
      const skipped = b.skipStaples
        ? [
            ...new Set(
              meals.flatMap((m) =>
                m.ingredients.filter((i) => isPantryStaple(i.name)).map((i) => i.name),
              ),
            ),
          ]
        : [];
      const lines = shoppingLinesForPlan(meals, {
        skipStaples: b.skipStaples,
        locale: householdLocale(ctx),
      });
      if (lines.length === 0) return { listId: list.id, items: [], skipped };

      const [max] = await tx
        .select({ p: sql<number>`coalesce(max(${listItems.position}), 0)` })
        .from(listItems)
        .where(eq(listItems.listId, list.id));
      const start = max?.p ?? 0;
      const items = await tx
        .insert(listItems)
        .values(
          lines.map((l, i) => ({
            householdId: ctx.householdId,
            listId: list.id,
            text: l.text,
            quantity: l.quantityText,
            category: categories.get(normalizeIngredientName(l.name)) ?? guessCategory(l.text),
            position: start + i + 1,
          })),
        )
        .returning();
      await tx.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, list.id));
      for (const item of items) ev.changed('list_item', item.id, 'created', list.id);
      ev.audit('meals.shopping_list', 'list', list.id, {
        from: b.from,
        to: b.to,
        items: items.length,
      });
      return { listId: list.id, items: items.map(toListItem), skipped };
    });
  }
}
