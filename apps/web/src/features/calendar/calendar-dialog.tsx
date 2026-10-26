'use client';

import type { Calendar } from '@fp/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ColorPicker } from '@/components/color-picker';
import { MemberPicker } from '@/components/member-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { randomPresetColor } from '@/lib/utils';

const VISIBILITIES = ['household', 'private', 'members'] as const;

interface CalendarFormValues {
  name: string;
  color: string;
  visibility: (typeof VISIBILITIES)[number];
  sharedWith: string[];
}

export type CalendarDialogState = { mode: 'create' } | { mode: 'edit'; calendar: Calendar };

export function CalendarDialog({
  state,
  onClose,
}: {
  state: CalendarDialogState | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      {state ? (
        <DialogContent>
          <CalendarForm
            key={state.mode === 'edit' ? state.calendar.id : 'new'}
            state={state}
            onClose={onClose}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function CalendarForm({ state, onClose }: { state: CalendarDialogState; onClose: () => void }) {
  const t = useTranslations('calendar.manage');
  const tv = useTranslations('visibility');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const existing = state.mode === 'edit' ? state.calendar : null;
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('nameRequired')).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        visibility: z.enum(VISIBILITIES),
        sharedWith: z.array(z.string()),
      }),
    [t],
  );

  const form = useForm<CalendarFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? '',
      color: existing?.color ?? randomPresetColor(),
      visibility: existing?.visibility ?? 'household',
      sharedWith: existing?.sharedWith ?? [],
    },
  });
  const { register, control, handleSubmit, setError, formState } = form;
  const visibility = useWatch({ control, name: 'visibility' });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar'] });

  const save = useMutation({
    mutationFn: (v: CalendarFormValues) => {
      const body = {
        name: v.name.trim(),
        color: v.color,
        visibility: v.visibility,
        sharedWith: v.visibility === 'members' ? v.sharedWith : [],
      };
      return existing
        ? api.calendar.updateCalendar({ params: { householdId, calendarId: existing.id }, body })
        : api.calendar.createCalendar({ params: { householdId }, body });
    },
    onSuccess: () => {
      toast.success(existing ? t('updated') : t('created'));
      onClose();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: () =>
      api.calendar.deleteCalendar({ params: { householdId, calendarId: existing?.id ?? '' } }),
    onSuccess: () => {
      toast.success(t('deleted'));
      setConfirmDelete(false);
      onClose();
    },
    onError: toastError,
    onSettled: invalidate,
  });

  const [icsUrl, setIcsUrl] = React.useState<string | null>(existing?.icsUrl ?? null);
  const rotate = useMutation({
    mutationFn: () =>
      api.calendar.rotateIcsToken({ params: { householdId, calendarId: existing?.id ?? '' } }),
    onSuccess: (cal) => {
      setIcsUrl(cal.icsUrl);
      toast.success(t('icsRotated'));
    },
    onError: toastError,
    onSettled: invalidate,
  });

  const copy = async () => {
    if (!icsUrl) return;
    try {
      await navigator.clipboard.writeText(icsUrl);
      toast.success(tu('copied'));
    } catch {
      toast.error(tc('unknownError'));
    }
  };

  const onSubmit = handleSubmit((v) => save.mutate(v));
  const errors = formState.errors;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? t('editTitle') : t('createTitle')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
        <Field label={t('name')} error={errors.name?.message}>
          {(p) => (
            <Input {...p} {...register('name')} placeholder={t('namePlaceholder')} autoFocus />
          )}
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('color')}</span>
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <ColorPicker value={field.value} onChange={field.onChange} label={t('color')} />
            )}
          />
        </div>
        <Field label={t('visibility')} error={errors.visibility?.message}>
          {(p) => (
            <NativeSelect {...p} {...register('visibility')}>
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {tv(v)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        {visibility === 'members' ? (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t('sharedWith')}</span>
            <Controller
              control={control}
              name="sharedWith"
              render={({ field }) => (
                <MemberPicker
                  value={field.value}
                  onChange={field.onChange}
                  label={t('sharedWith')}
                />
              )}
            />
          </div>
        ) : null}

        {existing ? (
          <section
            className="grid gap-2 rounded-md border border-border p-3"
            aria-labelledby="ics-heading"
          >
            <h3 id="ics-heading" className="flex items-center gap-2 text-sm font-semibold">
              <Link2 className="size-4" aria-hidden />
              {t('ics')}
            </h3>
            <p className="text-xs text-muted">{t('icsHint')}</p>
            {icsUrl ? (
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={icsUrl}
                  aria-label={t('icsUrl')}
                  onFocus={(e) => e.target.select()}
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => void copy()}
                  aria-label={tu('copy')}
                  title={tu('copy')}
                >
                  <Copy aria-hidden />
                </Button>
              </div>
            ) : null}
            <div>
              <Button
                variant="secondary"
                size="sm"
                loading={rotate.isPending}
                onClick={() => rotate.mutate()}
              >
                <RefreshCw aria-hidden />
                {icsUrl ? t('icsRotate') : t('icsCreate')}
              </Button>
            </div>
          </section>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {tc('delete')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {existing ? tc('save') : tc('create')}
            </Button>
          </div>
        </DialogFooter>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle')}
        description={t('deleteBody', { name: existing?.name ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
