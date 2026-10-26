'use client';

import type { Output } from '@fp/api-client';
import type { Recipe } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
import { Input } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useErrorMessage, useToastError } from '@/lib/errors';
import { formatIngredient, isHttpUrl } from './utils';

type Draft = Output<'meals', 'previewImport'>;

/** URL → preview → save (or edit before saving). */
function ImportDialogBody({
  onOpenChange,
  onEditDraft,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditDraft: (draft: Draft) => void;
  onImported: (r: Recipe) => void;
}) {
  const t = useTranslations('meals.recipes.importDialog');
  const tr = useTranslations('meals.recipes');
  const tun = useTranslations('meals.units');
  const tf = useTranslations('meals.recipes.form');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const message = useErrorMessage();
  const [url, setUrl] = React.useState('');
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const preview = useMutation({
    mutationFn: () =>
      api.meals.previewImport({ params: { householdId }, body: { url: url.trim() } }),
    onSuccess: setDraft,
    onError: (err) => setUrlError(`${t('failed')} ${message(err)}`),
  });

  const save = useMutation({
    mutationFn: () =>
      api.meals.importRecipe({ params: { householdId }, body: { url: url.trim() } }),
    onSuccess: async (r) => {
      toast.success(t('imported'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
      onImported(r);
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!isHttpUrl(url.trim())) {
            setUrlError(tf('invalidUrl'));
            return;
          }
          setUrlError(null);
          setDraft(null);
          preview.mutate();
        }}
      >
        <Field label={t('url')} error={urlError ?? undefined}>
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                type="url"
                value={url}
                placeholder="https://"
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button type="submit" variant="secondary" loading={preview.isPending}>
                {t('preview')}
              </Button>
            </div>
          )}
        </Field>
      </form>
      {draft ? (
        <section
          aria-label={draft.title}
          className="grid gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <div className="flex gap-3">
            {draft.imageUrl ? (
              <img
                src={draft.imageUrl}
                alt=""
                className="size-20 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p className="font-semibold">{draft.title}</p>
              <p className="text-xs text-muted">
                {[
                  draft.servings ? tr('servings', { count: draft.servings }) : null,
                  t('ingredientsCount', { count: draft.ingredients.length }),
                  t('stepsCount', { count: draft.steps.length }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {draft.description ? (
                <p className="mt-1 line-clamp-3 text-sm text-muted">{draft.description}</p>
              ) : null}
            </div>
          </div>
          {draft.ingredients.length > 0 ? (
            <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm">
              {draft.ingredients.map((i, idx) => (
                <li key={idx}>{formatIngredient(i, locale, (u) => tun(u))}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {tc('cancel')}
        </Button>
        {draft ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                onEditDraft(draft);
              }}
            >
              <Pencil aria-hidden />
              {tc('edit')}
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              {t('save')}
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function ImportDialog(props: React.ComponentProps<typeof ImportDialogBody>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <ImportDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
