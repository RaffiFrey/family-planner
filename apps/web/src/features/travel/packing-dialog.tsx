'use client';

import { apiQuery } from '@fp/api-client';
import type { PACKING_TEMPLATE_KEYS } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';

type TemplateKey = (typeof PACKING_TEMPLATE_KEYS)[number];

/** Creates the trip packing list from templates, or appends templates to the existing one. */
export function PackingDialog({
  open,
  onOpenChange,
  tripId,
  tripName,
  hasList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripName: string;
  hasList: boolean;
}) {
  const t = useTranslations('travel.packing');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasList ? t('extend') : t('create')}</DialogTitle>
          <DialogDescription>{t('templatesHint')}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form state starts fresh each time. */}
        <PackingForm
          onDone={() => onOpenChange(false)}
          tripId={tripId}
          tripName={tripName}
          hasList={hasList}
        />
      </DialogContent>
    </Dialog>
  );
}

function PackingForm({
  onDone,
  tripId,
  tripName,
  hasList,
}: {
  onDone: () => void;
  tripId: string;
  tripName: string;
  hasList: boolean;
}) {
  const t = useTranslations('travel.packing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [selected, setSelected] = React.useState<TemplateKey[]>(['basics']);
  const [listName, setListName] = React.useState(() => `${t('title')}: ${tripName}`);

  const templates = useQuery({
    ...apiQuery(api, 'travel', 'packingTemplates', { params: { householdId }, query: { locale } }),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.travel.createPackingList({
        params: { householdId, tripId },
        body: {
          templates: selected,
          locale,
          ...(hasList || !listName.trim() ? {} : { listName: listName.trim() }),
        },
      }),
    onSuccess: async (res) => {
      toast.success(t('added', { count: res.added }));
      onDone();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['travel'] }),
        queryClient.invalidateQueries({ queryKey: ['lists'] }),
      ]);
    },
    onError: toastError,
  });

  const toggle = (key: TemplateKey) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {!hasList ? (
        <Field label={t('listName')}>
          {(p) => <Input {...p} value={listName} onChange={(e) => setListName(e.target.value)} />}
        </Field>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t('templates')}</legend>
        {templates.isPending ? (
          <LoadingState rows={3} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(templates.data ?? []).map((tpl) => (
              <div
                key={tpl.key}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <Checkbox
                  id={`tpl-${tpl.key}`}
                  checked={selected.includes(tpl.key)}
                  onCheckedChange={() => toggle(tpl.key)}
                />
                <Label htmlFor={`tpl-${tpl.key}`} className="flex-1 font-normal">
                  {tpl.name}
                </Label>
              </div>
            ))}
          </div>
        )}
      </fieldset>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={!hasList && selected.length === 0 && !listName.trim()}
        >
          {hasList ? t('extend') : t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
