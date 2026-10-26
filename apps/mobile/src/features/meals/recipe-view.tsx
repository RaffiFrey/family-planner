import type { RecipeIngredient } from '@fp/contracts';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, SectionHeader, Text } from '@/components/ui';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';
import { formatIngredient, type IngredientUnit } from './utils';

export interface RecipeLike {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  imageUrl: string | null;
}

/** Read-only recipe (detail screen and import preview). */
export function RecipeView({ recipe }: { recipe: RecipeLike }) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const unitLabel = (u: IngredientUnit) => t(`m.meals.units.${u}`);
  const facts = [
    recipe.servings ? t('m.meals.servingsCount', { count: recipe.servings }) : null,
    recipe.prepMinutes
      ? `${t('m.meals.prep')}: ${t('m.meals.minutes', { count: recipe.prepMinutes })}`
      : null,
    recipe.cookMinutes
      ? `${t('m.meals.cookTime')}: ${t('m.meals.minutes', { count: recipe.cookMinutes })}`
      : null,
  ].filter(Boolean);

  return (
    <View className="gap-4">
      {recipe.imageUrl ? (
        <Image
          source={{ uri: recipe.imageUrl }}
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text variant="title">{recipe.title}</Text>
      {facts.length > 0 ? <Text variant="caption">{facts.join(' · ')}</Text> : null}
      {recipe.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {recipe.tags.map((tag) => (
            <View key={tag} className="rounded-full bg-surface-muted px-3 py-1">
              <Text variant="caption">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {recipe.description ? <Text>{recipe.description}</Text> : null}
      {recipe.ingredients.length > 0 ? (
        <>
          <SectionHeader title={t('m.meals.ingredients')} />
          <Card>
            {recipe.ingredients.map((i, idx) => (
              <View key={`${String(idx)}-${i.name}`} className="flex-row gap-2">
                <Text className="text-muted">•</Text>
                <Text className="flex-1">
                  {formatIngredient(i, locale, unitLabel)}
                  {i.note ? ` (${i.note})` : ''}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {recipe.steps.length > 0 ? (
        <>
          <SectionHeader title={t('m.meals.steps')} />
          {recipe.steps.map((s, idx) => (
            <View key={`${String(idx)}-${s.slice(0, 12)}`} className="flex-row gap-3">
              <View
                className="h-7 w-7 items-center justify-center rounded-full bg-primary"
                accessibilityLabel={t('m.meals.step', { n: idx + 1 })}
              >
                <Text className="text-sm font-semibold text-primary-text">{idx + 1}</Text>
              </View>
              <Text className="flex-1">{s}</Text>
            </View>
          ))}
        </>
      ) : null}
      {recipe.sourceUrl ? (
        <Button
          variant="ghost"
          icon={<ExternalLink size={16} color={colors.primary} />}
          title={t('m.meals.source')}
          onPress={() => {
            if (recipe.sourceUrl) void WebBrowser.openBrowserAsync(recipe.sourceUrl);
          }}
        />
      ) : null}
    </View>
  );
}
