import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions, modalPresentation } from '@/lib/stack-options';

export default function Layout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  const modal = { ...modalPresentation };
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('m.meals.weekPlan') }} />
      <Stack.Screen name="entry" options={{ ...modal, title: '' }} />
      <Stack.Screen name="recipes" options={{ title: t('m.meals.recipes') }} />
      <Stack.Screen name="recipe/[recipeId]" options={{ title: '' }} />
      <Stack.Screen name="recipe-new" options={{ ...modal, title: t('m.meals.newRecipe') }} />
      <Stack.Screen name="to-shopping" options={{ ...modal, title: t('m.meals.toShopping') }} />
      <Stack.Screen name="import" options={{ ...modal, title: t('m.meals.importRecipe') }} />
    </Stack>
  );
}
