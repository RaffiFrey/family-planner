'use client';

import { apiQuery } from '@fp/api-client';
import type { Invitation } from '@fp/contracts';
import { assignableRoles, type MemberRole, type Module } from '@fp/domain/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { CaregiverAccessFields } from './module-grants';
import { localInputToIso, Section } from './section';

type InvitationT = z.infer<typeof Invitation>;

interface InviteValues {
  role: Exclude<MemberRole, 'owner'>;
  email: string;
  grantedModules: Module[];
  accessUntil: string;
}

function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

export function InvitationsPage() {
  const t = useTranslations('settings.invitations');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const { householdId, member, can } = useHousehold();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const canInvite = can('members.invite');
  const [shown, setShown] = React.useState<InvitationT | null>(null);
  const [revoking, setRevoking] = React.useState<InvitationT | null>(null);
  const roles = assignableRoles(member.role).filter(
    (r): r is InviteValues['role'] => r !== 'owner',
  );

  const list = useQuery({
    ...apiQuery(api, 'households', 'listInvitations', { params: { householdId } }),
    enabled: canInvite,
  });

  const form = useForm<InviteValues>({
    defaultValues: {
      role: roles.includes('adult') ? 'adult' : (roles[0] ?? 'adult'),
      email: '',
      grantedModules: ['calendar', 'tasks', 'lists'],
      accessUntil: '',
    },
  });
  const [role, grantedModules, accessUntil] = useWatch({
    control: form.control,
    name: ['role', 'grantedModules', 'accessUntil'],
  });

  const create = useMutation({
    mutationFn: (v: InviteValues) => {
      const accessUntil = v.role === 'caregiver' ? localInputToIso(v.accessUntil) : null;
      return api.households.createInvitation({
        params: { householdId },
        body: {
          role: v.role,
          ...(v.email.trim() ? { email: v.email.trim() } : {}),
          ...(v.role === 'caregiver' ? { grantedModules: v.grantedModules } : {}),
          ...(accessUntil ? { accessUntil } : {}),
        },
      });
    },
    onSuccess: async (inv) => {
      toast.success(t('created'));
      setShown(inv);
      form.reset({ ...form.getValues(), email: '' });
      await queryClient.invalidateQueries({ queryKey: ['households', 'listInvitations'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  const revoke = useMutation({
    mutationFn: (inv: InvitationT) =>
      api.households.revokeInvitation({ params: { householdId, invitationId: inv.id } }),
    onSuccess: async () => {
      setRevoking(null);
      await queryClient.invalidateQueries({ queryKey: ['households', 'listInvitations'] });
    },
    onError: toastError,
  });

  if (!canInvite) {
    return (
      <Section title={t('title')}>
        <p className="text-sm text-muted">{t('noPermission')}</p>
      </Section>
    );
  }

  const open = list.data?.filter((i) => !i.acceptedAt) ?? [];

  return (
    <div className="grid gap-6">
      <Section title={t('title')} description={t('description')}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <Field label={t('role')} error={form.formState.errors.role?.message}>
            {(control) => (
              <NativeSelect {...control} {...form.register('role')}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label={t('email')}
            hint={t('emailHint')}
            error={form.formState.errors.email?.message}
          >
            {(control) => (
              <Input {...control} type="email" autoComplete="off" {...form.register('email')} />
            )}
          </Field>
          {role === 'caregiver' ? (
            <div className="sm:col-span-2">
              <CaregiverAccessFields
                modules={grantedModules}
                onModulesChange={(m) => form.setValue('grantedModules', m)}
                accessUntil={accessUntil}
                onAccessUntilChange={(v) => form.setValue('accessUntil', v)}
              />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              <UserPlus aria-hidden />
              {t('create')}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t('open')}>
        {list.isPending ? (
          <LoadingState rows={2} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : open.length === 0 ? (
          <EmptyState title={t('none')} />
        ) : (
          <ul className="divide-y divide-border">
            {open.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{tr(inv.role)}</Badge>
                    {inv.email ? (
                      <span className="truncate text-sm">{t('sentTo', { email: inv.email })}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t('expires', { date: fmt.dateTime(inv.expiresAt) })}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShown(inv)}>
                  <Link2 aria-hidden />
                  {t('showLink')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => setRevoking(inv)}
                >
                  <Trash2 aria-hidden />
                  {t('revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={shown !== null} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('link')}</DialogTitle>
            <DialogDescription>
              {shown
                ? `${tr(shown.role)} · ${t('expires', { date: fmt.dateTime(shown.expiresAt) })}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {shown ? <InviteLink token={shown.token} /> : null}
          <Button variant="secondary" onClick={() => setShown(null)}>
            {tc('close')}
          </Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t('revokeTitle')}
        description={t('revokeBody')}
        confirmLabel={t('revoke')}
        destructive
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
    </div>
  );
}

function InviteLink({ token }: { token: string }) {
  const t = useTranslations('settings.invitations');
  const tu = useTranslations('ui');
  const copyLabel = tu('copy');
  const qrLabel = t('qr');
  const url = inviteUrl(token);
  const id = React.useId();
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(tu('copied'));
  };
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          {t('link')}
        </label>
        <Input id={id} readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={() => void copy()} aria-label={copyLabel}>
          <Copy aria-hidden />
        </Button>
      </div>
      <figure className="flex flex-col items-center gap-2">
        <div className="rounded-md bg-white p-3">
          <QRCodeSVG value={url} size={192} level="M" title={qrLabel} />
        </div>
        <figcaption className="text-xs text-muted">{qrLabel}</figcaption>
      </figure>
    </div>
  );
}
