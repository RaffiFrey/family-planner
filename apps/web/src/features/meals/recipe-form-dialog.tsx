'use client';

import { INGREDIENT_UNITS, type Recipe } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { isHttpUrl, parseIntOrNull, parseQuantity } from './utils';

type Unit = (typeof INGREDIENT_UNITS)[number];

interface IngredientRow {
  quantity: string;
  unit: Unit | '';
  name: string;
  note: string;
}

interface FormValues {
  title: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  tags: string;
  sourceUrl: string;
  imageUrl: string;
  ingredients: IngredientRow[];
  steps: string;
}

export type RecipeDraftInput = Pick<
  Recipe,
  | 'title'
  | 'description'
  | 'servings'
  | 'prepMinutes'
  | 'cookMinutes'
  | 'ingredients'
  | 'steps'
  | 'tags'
  | 'sourceUrl'
  | 'imageUrl'
>;

const EMPTY_ROW: IngredientRow = { quantity: '', unit: '', name: '', note: '' };

function toForm(r: RecipeDraftInput | null, locale: string): FormValues {
  const num = (n: number | null) =>
    n === null ? '' : locale === 'de' ? String(n).replace('.', ',') : String(n);
  return {
    title: r?.title ?? '',
    description: r?.description ?? '',
    servings: r?.servings ? String(r.servings) : '',
    prepMinutes:
      r?.prepMinutes !== null && r?.prepMinutes !== undefined ? String(r.prepMinutes) : '',
    cookMinutes:
      r?.cookMinutes !== null && r?.cookMinutes !== undefined ? String(r.cookMinutes) : '',
    tags: r?.tags.join(', ') ?? '',
    sourceUrl: r?.sourceUrl ?? '',
    imageUrl: r?.imageUrl ?? '',
    ingredients:
      r && r.ingredients.length > 0
        ? r.ingredients.map((i) => ({
            quantity: num(i.quantity),
            unit: i.unit ?? '',
            name: i.name,
            note: i.note ?? '',
          }))
        : [{ ...EMPTY_ROW }],
    steps: r?.steps.join('\n') ?? '',
  };
}

/** Create or edit a recipe, incl. ingredient rows. `initial` pre-fills a new recipe. */
export function RecipeFormDialog({
  open,
  onOpenChange,
  recipe,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe | null;
  initial?: RecipeDraftInput | null;
  onSaved?: (r: Recipe) => void;
}) {
  const t = useTranslations('meals.recipes');
  const tf = useTranslations('meals.recipes.form');
  const tun = useTranslations('meals.units');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();

  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: toForm(recipe ?? initial ?? null, locale),
  });
  const rows = useFieldArray({ control, name: 'ingredients' });

  React.useEffect(() => {
    if (open) reset(toForm(recipe ?? initial ?? null, locale));
  }, [open, recipe, initial, reset, locale]);

  const save = useMutation({
    mutationFn: (body: RecipeDraftInput & { ingredients: RecipeDraftInput['ingredients'] }) => {
      const ingredients = body.ingredients.map(({ category: _c, ...rest }) => rest);
      return recipe
        ? api.meals.updateRecipe({
            params: { householdId, recipeId: recipe.id },
            body: { ...body, ingredients },
          })
        : api.meals.createRecipe({ params: { householdId }, body: { ...body, ingredients } });
    },
    onSuccess: async (r) => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
      onSaved?.(r);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    let ok = true;
    const servings = parseIntOrNull(v.servings);
    const prep = parseIntOrNull(v.prepMinutes);
    const cook = parseIntOrNull(v.cookMinutes);
    if (servings === undefined || servings === 0) {
      setError('servings', { message: tf('invalidNumber') });
      ok = false;
    }
    if (prep === undefined) {
      setError('prepMinutes', { message: tf('invalidNumber') });
      ok = false;
    }
    if (cook === undefined) {
      setError('cookMinutes', { message: tf('invalidNumber') });
      ok = false;
    }
    for (const key of ['sourceUrl', 'imageUrl'] as const) {
      if (v[key].trim() && !isHttpUrl(v[key].trim())) {
        setError(key, { message: tf('invalidUrl') });
        ok = false;
      }
    }
    const ingredients: RecipeDraftInput['ingredients'] = [];
    v.ingredients.forEach((row, i) => {
      if (!row.name.trim()) return;
      const q = parseQuantity(row.quantity);
      if (q === undefined) {
        setError(`ingredients.${i}.quantity`, { message: tf('invalidNumber') });
        ok = false;
        return;
      }
      ingredients.push({
        quantity: q,
        unit: row.unit || null,
        name: row.name.trim(),
        note: row.note.trim() || null,
        category: 'other',
      });
    });
    if (!ok) return;
    save.mutate({
      title: v.title.trim(),
      description: v.description.trim() || null,
      servings: servings ?? null,
      prepMinutes: prep ?? null,
      cookMinutes: cook ?? null,
      tags: [
        ...new Set(
          v.tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      sourceUrl: v.sourceUrl.trim() || null,
      imageUrl: v.imageUrl.trim() || null,
      ingredients,
      steps: v.steps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  });

  const errors = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{recipe ? t('edit') : t('create')}</DialogTitle>
          <DialogDescription className="sr-only">
            {recipe ? t('edit') : t('create')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={tf('title')} error={errors.title?.message}>
            {(p) => (
              <Input {...p} maxLength={200} {...register('title', { required: tu('required') })} />
            )}
          </Field>
          <Field label={tf('description')}>
            {(p) => <Textarea {...p} rows={2} {...register('description')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tf('servings')} error={errors.servings?.message}>
              {(p) => <Input {...p} inputMode="numeric" {...register('servings')} />}
            </Field>
            <Field label={tf('prepMinutes')} error={errors.prepMinutes?.message}>
              {(p) => <Input {...p} inputMode="numeric" {...register('prepMinutes')} />}
            </Field>
            <Field label={tf('cookMinutes')} error={errors.cookMinutes?.message}>
              {(p) => <Input {...p} inputMode="numeric" {...register('cookMinutes')} />}
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{tf('ingredients')}</legend>
            <ul className="grid gap-2">
              {rows.fields.map((f, i) => (
                <li
                  key={f.id}
                  className="grid grid-cols-[5rem_6rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[5rem_7rem_minmax(0,1fr)_minmax(0,9rem)_auto]"
                >
                  <Input
                    aria-label={`${tf('quantity')} ${i + 1}`}
                    inputMode="decimal"
                    aria-invalid={Boolean(errors.ingredients?.[i]?.quantity)}
                    {...register(`ingredients.${i}.quantity`)}
                  />
                  <NativeSelect
                    aria-label={`${tf('unit')} ${i + 1}`}
                    {...register(`ingredients.${i}.unit`)}
                  >
                    <option value="">{tf('noUnit')}</option>
                    {INGREDIENT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {tun(u)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label={`${tf('ingredientName')} ${i + 1}`}
                    placeholder={tf('ingredientName')}
                    maxLength={200}
                    {...register(`ingredients.${i}.name`)}
                  />
                  <Input
                    aria-label={`${tf('note')} ${i + 1}`}
                    placeholder={tf('note')}
                    maxLength={200}
                    className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto"
                    {...register(`ingredients.${i}.note`)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${tf('removeIngredient')} ${i + 1}`}
                    onClick={() => rows.remove(i)}
                    disabled={rows.fields.length === 1}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() => rows.append({ ...EMPTY_ROW })}
            >
              <Plus aria-hidden />
              {tf('addIngredient')}
            </Button>
          </fieldset>
          <Field label={tf('steps')} hint={tf('stepsHint')}>
            {(p) => <Textarea {...p} rows={5} {...register('steps')} />}
          </Field>
          <Field label={tf('tags')} hint={tf('tagsHint')}>
            {(p) => <Input {...p} {...register('tags')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tf('sourceUrl')} error={errors.sourceUrl?.message}>
              {(p) => <Input {...p} type="url" {...register('sourceUrl')} />}
            </Field>
            <Field label={tf('imageUrl')} error={errors.imageUrl?.message}>
              {(p) => <Input {...p} type="url" {...register('imageUrl')} />}
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
