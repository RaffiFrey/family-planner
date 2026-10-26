import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ScreenScroll, Text, TextField } from '@/components/ui';
import { useMealMutations } from '@/features/meals/hooks';
import { RecipeView } from '@/features/meals/recipe-view';
import { isHttpUrl } from '@/features/meals/utils';

/** Import a recipe from a web page (schema.org data): preview first, then save. */
export default function ImportRecipeScreen() {
  const { t } = useTranslation();
  const { previewImport, importRecipe } = useMealMutations();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | undefined>();
  const preview = previewImport.data;
  const previewedUrl = previewImport.variables;

  const loadPreview = () => {
    const u = url.trim();
    if (!isHttpUrl(u)) {
      setError(t('m.meals.invalidUrl'));
      return;
    }
    setError(undefined);
    previewImport.mutate(u);
  };

  const save = () => {
    if (!previewedUrl) return;
    importRecipe.mutate(previewedUrl, {
      onSuccess: (recipe) => {
        router.replace({ pathname: '/meals/recipe/[recipeId]', params: { recipeId: recipe.id } });
      },
    });
  };

  return (
    <ScreenScroll>
      <Text variant="caption">{t('m.meals.previewHint')}</Text>
      <TextField
        label={t('m.meals.url')}
        placeholder={t('m.meals.urlPlaceholder')}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={loadPreview}
        error={error}
        autoFocus
      />
      <Button
        variant={preview ? 'secondary' : 'primary'}
        title={t('m.meals.preview')}
        disabled={url.trim() === ''}
        loading={previewImport.isPending}
        onPress={loadPreview}
      />
      {preview ? (
        <>
          <Card>
            <RecipeView recipe={preview} />
          </Card>
          <Button title={t('m.meals.save')} loading={importRecipe.isPending} onPress={save} />
        </>
      ) : null}
    </ScreenScroll>
  );
}
