import { apiQuery, type Input } from '@fp/api-client';
import type { Recipe } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useHousehold } from '@/features/household/household';
import { api } from '@/lib/api';
import { showError } from '@/lib/dialogs';
import type { MealSlot } from './utils';

export function useMealPlan(from: string, to: string) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'meals', 'plan', { params: { householdId }, query: { from, to } }));
}

export function useRecipes(q: string) {
  const { householdId } = useHousehold();
  return useQuery(
    apiQuery(api, 'meals', 'listRecipes', {
      params: { householdId },
      ...(q ? { query: { q } } : {}),
    }),
  );
}

export function useRecipe(recipeId: string) {
  const { householdId } = useHousehold();
  return useQuery(apiQuery(api, 'meals', 'getRecipe', { params: { householdId, recipeId } }));
}

export function useMealMutations() {
  const { householdId } = useHousehold();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['meals'] });
  const onError = (e: unknown) => {
    showError(e, t);
  };
  const opts = { onSettled: invalidate, onError };

  return {
    upsertEntry: useMutation({
      mutationFn: ({
        date,
        slot,
        body,
      }: {
        date: string;
        slot: MealSlot;
        body: Input<'meals', 'upsertEntry'>['body'];
      }) => api.meals.upsertEntry({ params: { householdId, date, slot }, body }),
      ...opts,
    }),
    removeEntry: useMutation({
      mutationFn: ({ date, slot }: { date: string; slot: MealSlot }) =>
        api.meals.removeEntry({ params: { householdId, date, slot } }),
      ...opts,
    }),
    createRecipe: useMutation({
      mutationFn: (body: Input<'meals', 'createRecipe'>['body']) =>
        api.meals.createRecipe({ params: { householdId }, body }),
      ...opts,
    }),
    updateRecipe: useMutation({
      mutationFn: ({
        recipeId,
        body,
      }: {
        recipeId: string;
        body: Input<'meals', 'updateRecipe'>['body'];
      }) => api.meals.updateRecipe({ params: { householdId, recipeId }, body }),
      ...opts,
    }),
    toShoppingList: useMutation({
      mutationFn: (body: Input<'meals', 'toShoppingList'>['body']) =>
        api.meals.toShoppingList({ params: { householdId }, body }),
      onSettled: () => {
        void invalidate();
        void queryClient.invalidateQueries({ queryKey: ['lists'] });
      },
      onError,
    }),
    removeRecipe: useMutation({
      mutationFn: (recipe: Recipe) =>
        api.meals.removeRecipe({ params: { householdId, recipeId: recipe.id } }),
      ...opts,
    }),
    previewImport: useMutation({
      mutationFn: (url: string) =>
        api.meals.previewImport({ params: { householdId }, body: { url } }),
      onError,
    }),
    importRecipe: useMutation({
      mutationFn: (url: string) =>
        api.meals.importRecipe({ params: { householdId }, body: { url } }),
      ...opts,
    }),
  };
}
