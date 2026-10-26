import type { MealPlanEntry } from '@fp/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSelect, LoadingView, ScreenScroll, Text, TextField } from '@/components/ui';
import { useMembers } from '@/features/household/household';
import { useMealMutations, useMealPlan, useRecipes } from '@/features/meals/hooks';
import { type MealSlot, parseIntOrNull, parseLocalDate, SLOTS } from '@/features/meals/utils';
import { useIntlLocale } from '@/i18n';

/** Plan or edit one meal slot (free text or a recipe from the recipe box). */
export default function MealEntryScreen() {
  const params = useLocalSearchParams<{ date: string; slot: string }>();
  const slot: MealSlot = (SLOTS as readonly string[]).includes(params.slot)
    ? (params.slot as MealSlot)
    : 'dinner';
  const date = params.date;
  const plan = useMealPlan(date, date);
  if (plan.isPending) return <LoadingView />;
  const entry = plan.data?.find((e) => e.slot === slot) ?? null;
  return <EntryForm key={entry?.id ?? 'new'} date={date} slot={slot} entry={entry} />;
}

function EntryForm({
  date,
  slot,
  entry,
}: {
  date: string;
  slot: MealSlot;
  entry: MealPlanEntry | null;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const members = useMembers();
  const recipes = useRecipes('');
  const { upsertEntry, removeEntry } = useMealMutations();
  const [recipeId, setRecipeId] = useState<string>(entry?.recipeId ?? 'none');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [servings, setServings] = useState(entry?.servings ? String(entry.servings) : '');
  const [cook, setCook] = useState<string>(entry?.cookMemberId ?? 'none');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const heading = `${t(`m.meals.slots.${slot}`)} · ${new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseLocalDate(date))}`;

  const save = () => {
    const s = parseIntOrNull(servings);
    if (s === undefined || s === 0) {
      setError(t('m.meals.invalidNumber'));
      return;
    }
    const chosenRecipe = recipeId === 'none' ? null : recipeId;
    if (!chosenRecipe && !title.trim()) {
      setError(t('m.meals.titleOrRecipe'));
      return;
    }
    setError(null);
    upsertEntry.mutate(
      {
        date,
        slot,
        body: {
          recipeId: chosenRecipe,
          title: title.trim() || null,
          servings: s,
          cookMemberId: cook === 'none' ? null : cook,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  return (
    <ScreenScroll>
      <Stack.Screen options={{ title: t(`m.meals.slots.${slot}`) }} />
      <Text variant="heading">{heading}</Text>
      {(recipes.data ?? []).length > 0 ? (
        <ChipSelect
          label={t('m.meals.fromRecipe')}
          scroll
          value={recipeId}
          onChange={(v) => {
            setRecipeId(v);
            const r = recipes.data?.find((x) => x.id === v);
            if (r) {
              setTitle(r.title);
              if (r.servings && !servings) setServings(String(r.servings));
            }
          }}
          options={[
            { value: 'none', label: t('m.meals.noRecipeSelected') },
            ...(recipes.data ?? []).map((r) => ({ value: r.id, label: r.title })),
          ]}
        />
      ) : null}
      <TextField
        label={t('m.meals.entryTitle')}
        placeholder={t('m.meals.entryTitlePlaceholder')}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <TextField
        label={`${t('m.meals.servings')} (${t('common.optional')})`}
        value={servings}
        onChangeText={setServings}
        keyboardType="number-pad"
        maxLength={3}
      />
      <ChipSelect
        label={t('m.meals.cook')}
        scroll
        value={cook}
        onChange={setCook}
        options={[
          { value: 'none', label: t('m.meals.nobody') },
          ...members.map((m) => ({ value: m.id, label: m.displayName, color: m.color })),
        ]}
      />
      <TextField
        label={`${t('m.meals.notes')} (${t('common.optional')})`}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
      />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button title={t('common.save')} loading={upsertEntry.isPending} onPress={save} />
      {entry ? (
        <Button
          variant="ghost"
          title={t('m.meals.clearSlot')}
          loading={removeEntry.isPending}
          onPress={() => {
            removeEntry.mutate(
              { date, slot },
              {
                onSuccess: () => {
                  router.back();
                },
              },
            );
          }}
        />
      ) : null}
    </ScreenScroll>
  );
}
