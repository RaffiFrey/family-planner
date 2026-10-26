'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { Section } from './section';

export function AccountPage() {
  const t = useTranslations('settings.account');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { me } = useHousehold();
  const fmt = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const form = useForm<{ name: string }>({ values: { name: me.user.name } });

  const saveProfile = useMutation({
    mutationFn: (v: { name: string }) => api.households.updateMe({ body: { name: v.name.trim() } }),
    onSuccess: async () => {
      toast.success(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  const addPasskey = useMutation({
    mutationFn: async () => {
      const res = await authClient.passkey.addPasskey({ name: navigator.userAgent.slice(0, 60) });
      if (res.error) throw new Error(res.error.message ?? 'passkey');
    },
    onSuccess: () => toast.success(t('passkeyAdded')),
    onError: () => toast.error(t('passkeyFailed')),
  });

  const exportData = useMutation({
    mutationFn: () => api.households.exportMyData(),
    onSuccess: () => toast.success(t('exportRequested')),
    onError: toastError,
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.households.deleteMe(),
    onSuccess: async ({ deletionScheduledAt }) => {
      toast.success(t('deleteScheduled', { date: fmt.date(deletionScheduledAt) }), {
        duration: 10_000,
      });
      setDeleteOpen(false);
      await authClient.signOut().catch(() => undefined);
      queryClient.clear();
      router.replace('/sign-in');
    },
    onError: toastError,
  });

  return (
    <div className="grid gap-6">
      <Section title={t('profile')} description={t('description')}>
        <form
          className="grid max-w-md gap-4"
          onSubmit={form.handleSubmit((v) => saveProfile.mutate(v))}
          noValidate
        >
          <Field label={t('name')} error={form.formState.errors.name?.message}>
            {(control) => (
              <Input
                {...control}
                autoComplete="name"
                maxLength={100}
                {...form.register('name', {
                  validate: (v) => v.trim().length > 0 || tu('required'),
                })}
              />
            )}
          </Field>
          {me.user.email ? (
            <Field label={t('email')}>
              {(control) => (
                <Input {...control} type="email" value={me.user.email ?? ''} readOnly disabled />
              )}
            </Field>
          ) : null}
          <div>
            <Button
              type="submit"
              loading={saveProfile.isPending}
              disabled={!form.formState.isDirty}
            >
              {tc('save')}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t('security')} description={t('passkeyHint')}>
        <Button
          variant="secondary"
          loading={addPasskey.isPending}
          onClick={() => addPasskey.mutate()}
        >
          <KeyRound aria-hidden />
          {t('addPasskey')}
        </Button>
      </Section>

      <Section title={t('data')} description={t('exportHint')}>
        <Button
          variant="secondary"
          loading={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          <Download aria-hidden />
          {t('export')}
        </Button>
      </Section>

      <Section title={t('deleteAccount')} description={t('deleteHint')} tone="danger">
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden />
          {t('deleteAccount')}
        </Button>
      </Section>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('deleteAccount')}
        destructive
        loading={deleteAccount.isPending}
        onConfirm={() => deleteAccount.mutate()}
      />
    </div>
  );
}
