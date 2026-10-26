import { router } from 'expo-router';
import { ChefHat, Link2, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingView,
  RowGroup,
  TextField,
} from '@/components/ui';
import { useHousehold } from '@/features/household/household';
import { useRecipes } from '@/features/meals/hooks';
import { useColors } from '@/lib/theme';
import { useDebounced } from '@/lib/use-debounced';

export default function RecipesScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { can } = useHousehold();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const recipes = useRecipes(q);
  const writable = can('meals.write');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={recipes.isRefetching}
          onRefresh={() => void recipes.refetch()}
        />
      }
    >
      <TextField
        label={t('m.meals.searchRecipes')}
        value={search}
        onChangeText={setSearch}
        placeholder={t('common.search')}
        returnKeyType="search"
      />
      {writable ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            size="sm"
            icon={<Link2 size={16} color={colors.text} />}
            title={t('m.meals.importRecipe')}
            onPress={() => {
              router.push('/meals/import');
            }}
          />
          <Button
            className="flex-1"
            variant="secondary"
            size="sm"
            icon={<Plus size={16} color={colors.text} />}
            title={t('m.meals.newRecipe')}
            onPress={() => {
              router.push('/meals/recipe-new');
            }}
          />
        </View>
      ) : null}
      {recipes.isPending ? (
        <LoadingView />
      ) : recipes.error && !recipes.data ? (
        <ErrorState error={recipes.error} onRetry={() => void recipes.refetch()} />
      ) : recipes.data.length === 0 ? (
        <EmptyState title={t('m.meals.noRecipes')} message={t('m.meals.noRecipesHint')} />
      ) : (
        <RowGroup>
          {recipes.data.map((r, i) => {
            const minutes = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
            return (
              <View key={r.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={r.title}
                  subtitle={[
                    minutes > 0 ? t('m.meals.minutes', { count: minutes }) : null,
                    r.servings ? t('m.meals.servingsCount', { count: r.servings }) : null,
                    ...r.tags.slice(0, 3),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  left={
                    r.imageUrl ? (
                      <Image
                        source={{ uri: r.imageUrl }}
                        style={{ width: 44, height: 44, borderRadius: 8 }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <ChefHat size={24} color={colors.primary} />
                    )
                  }
                  chevron
                  onPress={() => {
                    router.push({
                      pathname: '/meals/recipe/[recipeId]',
                      params: { recipeId: r.id },
                    });
                  }}
                />
              </View>
            );
          })}
        </RowGroup>
      )}
    </ScrollView>
  );
}
