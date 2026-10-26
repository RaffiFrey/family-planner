'use client';

import { apiQuery } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, ExternalLink, Pencil, Trash2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { RecipeFormDialog } from './recipe-form-dialog';
import { formatIngredient } from './utils';

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const t = useTranslations('meals.recipes');
  const tun = useTranslations('meals.units');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { householdId, can } = useHousehold();
  const canWrite = can('meals.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const query = useQuery(
    apiQuery(api, 'meals', 'getRecipe', { params: { householdId, recipeId } }),
  );

  const remove = useMutation({
    mutationFn: () => api.meals.removeRecipe({ params: { householdId, recipeId } }),
    onSuccess: async () => {
      toast.success(t('deleted'));
      router.push('/meals/recipes');
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
    onError: toastError,
  });

  const back = (
    <Button asChild variant="link" className="mb-3">
      <Link href="/meals/recipes">
        <ArrowLeft aria-hidden />
        {t('back')}
      </Link>
    </Button>
  );

  if (query.isPending) return <LoadingState rows={5} />;
  if (query.isError)
    return (
      <div>
        {back}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  const r = query.data;

  return (
    <div>
      {back}
      <PageHeader
        title={r.title}
        description={r.description}
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {tc('edit')}
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>
                <Trash2 aria-hidden />
                {tc('delete')}
              </Button>
            </>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-muted">
        {r.servings ? (
          <span className="inline-flex items-center gap-1">
            <Users className="size-4" aria-hidden />
            {t('servings', { count: r.servings })}
          </span>
        ) : null}
        {r.prepMinutes ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden />
            {t('prep')}: {t('minutes', { count: r.prepMinutes })}
          </span>
        ) : null}
        {r.cookMinutes ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden />
            {t('cook')}: {t('minutes', { count: r.cookMinutes })}
          </span>
        ) : null}
        {r.sourceUrl ? (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t('source')}
          </a>
        ) : null}
        {r.tags.map((tg) => (
          <Badge key={tg} variant="secondary">
            {tg}
          </Badge>
        ))}
      </div>
      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" className="mb-4 max-h-72 w-full rounded-lg object-cover" />
      ) : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('ingredients')}</CardTitle>
          </CardHeader>
          <CardContent>
            {r.ingredients.length === 0 ? (
              <p className="text-sm text-muted">{t('noIngredients')}</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {r.ingredients.map((i, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span aria-hidden className="text-muted">
                      •
                    </span>
                    <span>
                      {formatIngredient(i, locale, (u) => tun(u))}
                      {i.note ? <span className="text-muted"> ({i.note})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('steps')}</CardTitle>
          </CardHeader>
          <CardContent>
            {r.steps.length === 0 ? (
              <p className="text-sm text-muted">{t('noSteps')}</p>
            ) : (
              <ol className="grid list-decimal gap-3 pl-5 text-sm marker:font-semibold">
                {r.steps.map((s, idx) => (
                  <li key={idx} className="pl-1 whitespace-pre-wrap">
                    {s}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <RecipeFormDialog open={editing} onOpenChange={setEditing} recipe={r} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
