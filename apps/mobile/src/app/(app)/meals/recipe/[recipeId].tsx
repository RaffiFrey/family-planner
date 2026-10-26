import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pencil, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  ChipSelect,
  DateField,
  ErrorState,
  IconButton,
  LoadingView,
  ScreenScroll,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useMealMutations, useRecipe } from '@/features/meals/hooks';
import { RecipeView } from '@/features/meals/recipe-view';
import { type MealSlot, SLOTS, toLocalDate } from '@/features/meals/utils';
import { confirmAsync, notify } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';

export default function RecipeDetailScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const recipe = useRecipe(recipeId);
  const { removeRecipe, upsertEntry } = useMealMutations();
  const [planDay, setPlanDay] = useState<Date | null>(() => new Date());
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const writable = can('meals.write');

  if (recipe.isPending) return <LoadingView />;
  if (recipe.error && !recipe.data)
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  const r = recipe.data;

  const remove = async () => {
    const ok = await confirmAsync(t('m.meals.deleteRecipe'), t('m.meals.deleteRecipeMessage'), {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    removeRecipe.mutate(r, {
      onSuccess: () => {
        router.back();
      },
    });
  };

  return (
    <ScreenScroll>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            writable ? (
              <View className="flex-row">
                <IconButton
                  label={t('m.meals.editRecipe')}
                  onPress={() => {
                    router.push({ pathname: '/meals/recipe-new', params: { recipeId: r.id } });
                  }}
                >
                  <Pencil size={20} color={colors.text} />
                </IconButton>
                <IconButton label={t('common.delete')} onPress={() => void remove()}>
                  <Trash2 size={20} color={colors.text} />
                </IconButton>
              </View>
            ) : null,
        }}
      />
      <RecipeView recipe={r} />
      {writable ? (
        <Card>
          <Text variant="subheading">{t('m.meals.planRecipe')}</Text>
          <DateField label={t('m.meals.planOn')} value={planDay} onChange={setPlanDay} />
          <ChipSelect<MealSlot>
            label={t('m.meals.slot')}
            value={slot}
            onChange={setSlot}
            options={SLOTS.map((s) => ({ value: s, label: t(`m.meals.slots.${s}`) }))}
          />
          <Button
            title={t('m.meals.planRecipe')}
            disabled={!planDay}
            loading={upsertEntry.isPending}
            onPress={() => {
              if (!planDay) return;
              upsertEntry.mutate(
                {
                  date: toLocalDate(planDay),
                  slot,
                  body: { recipeId: r.id, title: null, servings: r.servings },
                },
                {
                  onSuccess: () => {
                    notify(t('m.meals.planned'));
                  },
                },
              );
            }}
          />
        </Card>
      ) : null}
    </ScreenScroll>
  );
}
