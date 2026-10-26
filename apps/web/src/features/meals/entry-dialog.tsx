'use client';

import { apiQuery } from '@fp/api-client';
import type { MealPlanEntry } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { type MealSlot, parseLocalDate } from './utils';

interface Target {
  date: string;
  slot: MealSlot;
  entry: MealPlanEntry | null;
}

/** Pick a recipe (or free text) for one slot of the plan. */
function EntryDialogBody({
  target,
  onOpenChange,
  canWrite,
}: {
  target: Target;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  const t = useTranslations('meals.plan');
  const tm = useTranslations('meals');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, members } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const recipes = useQuery({
    ...apiQuery(api, 'meals', 'listRecipes', { params: { householdId }, query: {} }),
  });

  const e0 = target.entry;
  const [mode, setMode] = React.useState<'recipe' | 'text'>(e0 && !e0.recipeId ? 'text' : 'recipe');
  const [recipeId, setRecipeId] = React.useState(e0?.recipeId ?? '');
  const [title, setTitle] = React.useState(e0 && !e0.recipeId ? e0.title : '');
  const [servings, setServings] = React.useState(e0?.servings ? String(e0.servings) : '');
  const [cook, setCook] = React.useState(e0?.cookMemberId ?? '');
  const [notes, setNotes] = React.useState(e0?.notes ?? '');
  const [error, setError] = React.useState<string | null>(null);

  // Free text is the only option while the recipe box is empty.
  const noRecipes = recipes.data?.length === 0;
  const effectiveMode = noRecipes ? 'text' : mode;

  const save = useMutation({
    mutationFn: (body: {
      recipeId: string | null;
      title: string | null;
      servings: number | null;
      cookMemberId: string | null;
      notes: string | null;
    }) =>
      api.meals.upsertEntry({
        params: { householdId, date: target.date, slot: target.slot },
        body,
      }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: () =>
      api.meals.removeEntry({
        params: { householdId, date: target.date, slot: target.slot },
      }),
    onSuccess: async () => {
      toast.success(t('removed'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
    onError: toastError,
  });

  const submit = () => {
    const n = servings.trim() ? Number(servings) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100)) {
      setError(tm('recipes.form.invalidNumber'));
      return;
    }
    if (effectiveMode === 'recipe' && !recipeId) {
      setError(tu('required'));
      return;
    }
    if (effectiveMode === 'text' && !title.trim()) {
      setError(tu('required'));
      return;
    }
    setError(null);
    save.mutate({
      recipeId: effectiveMode === 'recipe' ? recipeId : null,
      title: effectiveMode === 'text' ? title.trim() : null,
      servings: n,
      cookMemberId: cook || null,
      notes: notes.trim() || null,
    });
  };

  const heading = t('editMealFor', {
    slot: tm(`slots.${target.slot}`),
    date: fmt.date(parseLocalDate(target.date), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  });
  const id = React.useId();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription className="sr-only">{t('addMeal')}</DialogDescription>
      </DialogHeader>
      {!canWrite && target.entry ? (
        <div className="grid gap-2 text-sm">
          <p className="font-medium">{target.entry.title}</p>
          {target.entry.notes ? <p className="text-muted">{target.entry.notes}</p> : null}
          {target.entry.recipeId ? (
            <Button asChild variant="link" className="justify-self-start">
              <Link href={`/meals/recipes/${target.entry.recipeId}`}>{t('openRecipe')}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!noRecipes ? (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">{t('source')}</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={effectiveMode === 'recipe'}
                  onChange={() => setMode('recipe')}
                  className="size-4 accent-primary"
                />
                {t('fromRecipe')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={effectiveMode === 'text'}
                  onChange={() => setMode('text')}
                  className="size-4 accent-primary"
                />
                {t('freeText')}
              </label>
            </fieldset>
          ) : null}
          {effectiveMode === 'recipe' ? (
            <Field label={t('recipe')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={recipeId}
                  disabled={recipes.isPending}
                  onChange={(e) => setRecipeId(e.target.value)}
                >
                  <option value="">{t('chooseRecipe')}</option>
                  {(recipes.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : (
            <Field label={t('mealTitle')}>
              {(p) => (
                <Input
                  {...p}
                  value={title}
                  maxLength={200}
                  placeholder={t('mealTitlePlaceholder')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('servings')}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('cook')}>
              {(p) => (
                <NativeSelect {...p} value={cook} onChange={(e) => setCook(e.target.value)}>
                  <option value="">{t('nobody')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => (
              <Textarea
                {...p}
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {target.entry ? (
                <Button
                  variant="ghost"
                  className="text-danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  <Trash2 aria-hidden />
                  {t('clear')}
                </Button>
              ) : null}
              {target.entry?.recipeId ? (
                <Button asChild variant="ghost">
                  <Link href={`/meals/recipes/${target.entry.recipeId}`}>
                    <ExternalLink aria-hidden />
                    {t('openRecipe')}
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {tc('save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

/** Pick a recipe (or free text) for one slot of the plan. */
export function EntryDialog({
  target,
  onOpenChange,
  canWrite,
}: {
  target: Target | null;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {target ? (
          <EntryDialogBody
            key={`${target.date}|${target.slot}`}
            target={target}
            onOpenChange={onOpenChange}
            canWrite={canWrite}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
