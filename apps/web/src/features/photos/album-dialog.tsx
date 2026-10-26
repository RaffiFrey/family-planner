'use client';

import type { Album } from '@fp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { MemberPicker } from '@/components/member-picker';
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
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';

type Visibility = Album['visibility'];

interface FormValues {
  title: string;
  description: string;
  visibility: Visibility;
  sharedWith: string[];
}

export function AlbumDialog({
  open,
  onOpenChange,
  album,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  album: Album | null;
}) {
  const t = useTranslations('photos');
  const tv = useTranslations('visibility');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { householdId, member, members } = useHousehold();
  const toastError = useToastError();

  const defaults = React.useCallback(
    (): FormValues => ({
      title: album?.title ?? '',
      description: album?.description ?? '',
      visibility: album?.visibility ?? 'household',
      sharedWith: album?.sharedWith ?? [],
    }),
    [album],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);
  const visibility = useWatch({ control, name: 'visibility' });

  const mutation = useMutation({
    mutationFn: (body: {
      title: string;
      description: string | null;
      visibility: Visibility;
      sharedWith: string[];
    }) =>
      album
        ? api.photos.update({ params: { householdId, albumId: album.id }, body })
        : api.photos.create({ params: { householdId }, body }),
    onSuccess: async (saved) => {
      toast.success(album ? t('saved') : t('created'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['photos'] });
      if (!album) router.push(`/photos/${saved.id}`);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) =>
    mutation.mutate({
      title: v.title.trim(),
      description: v.description.trim() || null,
      visibility: v.visibility,
      sharedWith: v.visibility === 'members' ? v.sharedWith : [],
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{album ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('albumTitle')} error={formState.errors.title?.message}>
            {(p) => <Input {...p} {...register('title', { required: tu('required') })} />}
          </Field>
          <Field label={t('albumDescription')}>
            {(p) => <Textarea {...p} rows={2} {...register('description')} />}
          </Field>
          <Field label={t('visibility')}>
            {(p) => (
              <NativeSelect {...p} {...register('visibility')}>
                <option value="household">{tv('household')}</option>
                <option value="members">{tv('members')}</option>
                <option value="private">{tv('private')}</option>
              </NativeSelect>
            )}
          </Field>
          {visibility === 'members' ? (
            <div className="grid gap-1.5">
              <Label>{t('sharedWith')}</Label>
              <Controller
                control={control}
                name="sharedWith"
                render={({ field }) => (
                  <MemberPicker
                    value={field.value}
                    onChange={field.onChange}
                    members={members.filter((m) => m.id !== member.id)}
                    label={t('sharedWith')}
                  />
                )}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
