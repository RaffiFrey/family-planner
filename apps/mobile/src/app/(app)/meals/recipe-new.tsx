import type { Recipe } from '@fp/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, LoadingView, ScreenScroll, Text, TextField } from '@/components/ui';
import { useMealMutations, useRecipe } from '@/features/meals/hooks';
import {
  formatIngredient,
  ingredientsFromLines,
  type IngredientUnit,
  parseIntOrNull,
} from '@/features/meals/utils';
import { useIntlLocale } from '@/i18n';

/** Create a recipe, or edit one when `recipeId` is given. Ingredients and steps: one per line. */
export default function RecipeFormScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  if (recipeId) return <EditRecipe recipeId={recipeId} />;
  return <RecipeForm recipe={null} />;
}

function EditRecipe({ recipeId }: { recipeId: string }) {
  const recipe = useRecipe(recipeId);
  if (!recipe.data) return <LoadingView />;
  return <RecipeForm key={recipe.data.id} recipe={recipe.data} />;
}

function numberText(n: number | null): string {
  return n === null ? '' : String(n);
}

function RecipeForm({ recipe }: { recipe: Recipe | null }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const { createRecipe, updateRecipe } = useMealMutations();
  const unitLabel = (u: IngredientUnit) => t(`m.meals.units.${u}`);
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [servings, setServings] = useState(numberText(recipe?.servings ?? null));
  const [prep, setPrep] = useState(numberText(recipe?.prepMinutes ?? null));
  const [cook, setCook] = useState(numberText(recipe?.cookMinutes ?? null));
  const [ingredients, setIngredients] = useState(
    (recipe?.ingredients ?? []).map((i) => formatIngredient(i, locale, unitLabel)).join('\n'),
  );
  const [steps, setSteps] = useState((recipe?.steps ?? []).join('\n'));
  const [tags, setTags] = useState((recipe?.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const s = parseIntOrNull(servings);
    const p = parseIntOrNull(prep);
    const c = parseIntOrNull(cook);
    if (s === undefined || s === 0 || p === undefined || c === undefined) {
      setError(t('m.meals.invalidNumber'));
      return;
    }
    setError(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      servings: s,
      prepMinutes: p,
      cookMinutes: c,
      ingredients: ingredientsFromLines(ingredients, recipe?.ingredients),
      steps: steps
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      tags: [
        ...new Set(
          tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ].slice(0, 20),
    };
    const done = {
      onSuccess: (saved: Recipe) => {
        if (recipe) router.back();
        else
          router.replace({ pathname: '/meals/recipe/[recipeId]', params: { recipeId: saved.id } });
      },
    };
    if (recipe) updateRecipe.mutate({ recipeId: recipe.id, body }, done);
    else createRecipe.mutate(body, done);
  };

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{ title: recipe ? t('m.meals.editRecipe') : t('m.meals.newRecipe') }}
      />
      <TextField
        label={t('m.meals.recipeTitle')}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
        autoFocus={!recipe}
      />
      <TextField
        label={`${t('m.meals.description')} (${t('common.optional')})`}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={5000}
      />
      <View className="flex-row gap-2">
        <TextField
          className="flex-1"
          label={t('m.meals.servings')}
          value={servings}
          onChangeText={setServings}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextField
          className="flex-1"
          label={t('m.meals.prepMinutes')}
          value={prep}
          onChangeText={setPrep}
          keyboardType="number-pad"
          maxLength={5}
        />
        <TextField
          className="flex-1"
          label={t('m.meals.cookMinutes')}
          value={cook}
          onChangeText={setCook}
          keyboardType="number-pad"
          maxLength={5}
        />
      </View>
      <TextField
        label={t('m.meals.ingredientsInput')}
        placeholder={t('m.meals.ingredientsPlaceholder')}
        value={ingredients}
        onChangeText={setIngredients}
        multiline
      />
      <TextField label={t('m.meals.stepsInput')} value={steps} onChangeText={setSteps} multiline />
      <TextField
        label={`${t('m.meals.tagsInput')} (${t('common.optional')})`}
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
      />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={t('common.save')}
        disabled={title.trim() === ''}
        loading={createRecipe.isPending || updateRecipe.isPending}
        onPress={save}
      />
    </ScreenScroll>
  );
}
