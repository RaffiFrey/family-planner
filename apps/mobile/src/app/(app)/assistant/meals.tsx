import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { UpsellState } from '@/components/gates';
import { Button, Card, ChipSelect, ScreenScroll, Text, TextField } from '@/components/ui';
import { AssistantGate } from '@/features/assistant/assistant-gate';
import { assistantErrorMessage } from '@/features/assistant/errors';
import { parseIngredients } from '@/features/assistant/ingredients';
import { useHousehold } from '@/features/household/household';
import { useLists } from '@/features/lists/hooks';
import { api } from '@/lib/api';
import { notify, showError } from '@/lib/dialogs';
import { isPlanLimit } from '@/lib/errors';
import { useColors } from '@/lib/theme';

export default function MealIdeasScreen() {
  return (
    <AssistantGate>
      <MealIdeas />
    </AssistantGate>
  );
}

/** Three recipe ideas from what is in the pantry; missing items can go to a shopping list. */
function MealIdeas() {
  const { t } = useTranslation();
  const colors = useColors();
  const { householdId, can } = useHousehold();
  const queryClient = useQueryClient();
  const lists = useLists();
  const shopping = (lists.data ?? []).filter((l) => l.kind === 'shopping');
  const [ingredients, setIngredients] = useState('');
  const [servings, setServings] = useState('4');
  const [preferences, setPreferences] = useState('');
  const [listId, setListId] = useState<string | null>(null);
  const targetList = listId ?? shopping[0]?.id ?? null;
  const parsed = parseIngredients(ingredients);

  const run = useMutation({
    mutationFn: () =>
      api.assistant.meals({
        params: { householdId },
        body: {
          ingredients: parsed,
          servings: Math.min(20, Math.max(1, Number(servings) || 4)),
          ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
        },
      }),
  });
  const addMissing = useMutation({
    mutationFn: async (items: string[]) => {
      if (!targetList) return 0;
      for (const text of items)
        await api.lists.addItem({ params: { householdId, listId: targetList }, body: { text } });
      return items.length;
    },
    onSuccess: (count) => {
      notify(t('m.assistant.addedToList', { count }));
    },
    onError: (e) => {
      showError(e, t);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['lists'] }),
  });

  return (
    <ScreenScroll>
      <TextField
        label={t('m.assistant.ingredients')}
        value={ingredients}
        onChangeText={setIngredients}
        placeholder={t('m.assistant.ingredientsPlaceholder')}
        multiline
      />
      <View className="flex-row gap-2">
        <TextField
          className="w-28"
          label={t('m.assistant.servings')}
          value={servings}
          onChangeText={setServings}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
        />
        <TextField
          className="flex-1"
          label={t('m.assistant.preferences')}
          value={preferences}
          onChangeText={setPreferences}
          placeholder={t('m.assistant.preferencesPlaceholder')}
          maxLength={200}
        />
      </View>
      <Button
        title={t('m.assistant.suggestMeals')}
        icon={<ChefHat size={18} color={colors.primaryText} />}
        loading={run.isPending}
        disabled={parsed.length === 0}
        onPress={() => {
          run.mutate();
        }}
      />
      {run.error ? (
        isPlanLimit(run.error) ? (
          <UpsellState feature="ai_assistant" compact />
        ) : (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {assistantErrorMessage(run.error, t)}
          </Text>
        )
      ) : null}
      {run.data && shopping.length > 1 ? (
        <ChipSelect
          label={t('m.assistant.shoppingList')}
          value={targetList}
          onChange={setListId}
          options={shopping.map((l) => ({ value: l.id, label: l.name }))}
        />
      ) : null}
      {run.data?.ideas.map((idea) => (
        <Card key={idea.title}>
          <Text variant="subheading">{idea.title}</Text>
          <Text variant="caption">
            {idea.description}
            {idea.prepMinutes ? ` · ${t('m.assistant.minutes', { count: idea.prepMinutes })}` : ''}
          </Text>
          <Text variant="label">{t('m.assistant.ingredients')}</Text>
          {idea.ingredients.map((ing) => (
            <Text key={ing.name} className={ing.inPantry ? '' : 'text-warning'}>
              {'• '}
              {ing.quantity ? `${ing.quantity} ` : ''}
              {ing.name}
              {ing.inPantry ? '' : ` (${t('m.assistant.missing')})`}
            </Text>
          ))}
          <Text variant="label">{t('m.assistant.steps')}</Text>
          {idea.steps.map((step, i) => (
            <Text key={step}>{`${String(i + 1)}. ${step}`}</Text>
          ))}
          {idea.missing.length > 0 && can('lists.write') && targetList ? (
            <Button
              size="sm"
              variant="secondary"
              title={t('m.assistant.addMissing', { count: idea.missing.length })}
              loading={addMissing.isPending}
              onPress={() => {
                addMissing.mutate(idea.missing);
              }}
            />
          ) : null}
        </Card>
      ))}
    </ScreenScroll>
  );
}
