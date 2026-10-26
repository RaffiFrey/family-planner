'use client';

import type { Member } from '@fp/contracts';
import { assignableRoles, type MemberRole, type Module } from '@fp/domain/permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/color-picker';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { randomPresetColor } from '@/lib/utils';
import { CaregiverAccessFields } from './module-grants';
import { isoToLocalInput, localInputToIso } from './section';

interface EditValues {
  displayName: string;
  role: MemberRole;
  color: string;
  birthday: string;
  grantedModules: Module[];
  accessUntil: string;
}

export function EditMemberDialog({
  target,
  onClose,
}: {
  target: Member | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {target ? <EditMemberForm key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditMemberForm({ target, onClose }: { target: Member; onClose: () => void }) {
  const t = useTranslations('settings.members');
  const tr = useTranslations('roles');
  const tu = useTranslations('ui');
  const tc = useTranslations('common');
  const { householdId, member: self, can } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const isSelf = target.id === self.id;
  const canManage = can('members.manage') && !isSelf && target.role !== 'owner';
  const roles = assignableRoles(self.role);
  const roleOptions = roles.includes(target.role) ? roles : [target.role, ...roles];

  const form = useForm<EditValues>({
    defaultValues: {
      displayName: target.displayName,
      role: target.role,
      color: target.color,
      birthday: target.birthday ?? '',
      grantedModules: target.grantedModules ?? [],
      accessUntil: isoToLocalInput(target.accessUntil),
    },
  });
  const [role, accessUntil] = useWatch({ control: form.control, name: ['role', 'accessUntil'] });

  const save = useMutation({
    mutationFn: (v: EditValues) =>
      api.households.updateMember({
        params: { householdId, memberId: target.id },
        body: {
          displayName: v.displayName.trim(),
          color: v.color,
          birthday: v.birthday || null,
          ...(canManage
            ? {
                role: v.role,
                grantedModules: v.role === 'caregiver' ? v.grantedModules : null,
                accessUntil: v.role === 'caregiver' ? localInputToIso(v.accessUntil) : null,
              }
            : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      onClose();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
      <DialogHeader>
        <DialogTitle>{t('editTitle', { name: target.displayName })}</DialogTitle>
        <DialogDescription className="sr-only">{t('edit')}</DialogDescription>
      </DialogHeader>
      <Field label={t('displayName')} error={form.formState.errors.displayName?.message}>
        {(control) => (
          <Input
            {...control}
            maxLength={60}
            {...form.register('displayName', {
              required: tu('required'),
              validate: (v) => v.trim().length > 0 || tu('required'),
            })}
          />
        )}
      </Field>
      {canManage ? (
        <Field label={t('role')} error={form.formState.errors.role?.message}>
          {(control) => (
            <NativeSelect {...control} {...form.register('role')}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ) : null}
      <div className="grid gap-1.5">
        <Label>{tu('color')}</Label>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
        />
      </div>
      <Field label={t('birthday')} error={form.formState.errors.birthday?.message}>
        {(control) => <Input {...control} type="date" {...form.register('birthday')} />}
      </Field>
      {canManage && role === 'caregiver' ? (
        <Controller
          control={form.control}
          name="grantedModules"
          render={({ field }) => (
            <CaregiverAccessFields
              modules={field.value}
              onModulesChange={field.onChange}
              accessUntil={accessUntil}
              onAccessUntilChange={(v) => form.setValue('accessUntil', v)}
            />
          )}
        />
      ) : null}
      <DialogFooter>
        <Button type="submit" loading={save.isPending}>
          {tc('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ChildValues {
  displayName: string;
  role: 'child' | 'teen';
  color: string;
  birthday: string;
}

export function AddChildDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <AddChildForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddChildForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations('settings.members');
  const tr = useTranslations('roles');
  const tu = useTranslations('ui');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const form = useForm<ChildValues>({
    defaultValues: { displayName: '', role: 'child', color: randomPresetColor(), birthday: '' },
  });

  const create = useMutation({
    mutationFn: (v: ChildValues) =>
      api.households.createManagedMember({
        params: { householdId },
        body: {
          displayName: v.displayName.trim(),
          role: v.role,
          color: v.color,
          birthday: v.birthday || null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('added'));
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      onClose();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
      <DialogHeader>
        <DialogTitle>{t('addChild')}</DialogTitle>
        <DialogDescription>{t('addChildHint')}</DialogDescription>
      </DialogHeader>
      <Field label={t('displayName')} error={form.formState.errors.displayName?.message}>
        {(control) => (
          <Input
            {...control}
            maxLength={60}
            autoFocus
            {...form.register('displayName', {
              validate: (v) => v.trim().length > 0 || tu('required'),
            })}
          />
        )}
      </Field>
      <Field label={t('role')}>
        {(control) => (
          <NativeSelect {...control} {...form.register('role')}>
            <option value="child">{tr('child')}</option>
            <option value="teen">{tr('teen')}</option>
          </NativeSelect>
        )}
      </Field>
      <div className="grid gap-1.5">
        <Label>{tu('color')}</Label>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
        />
      </div>
      <Field label={t('birthday')} error={form.formState.errors.birthday?.message}>
        {(control) => <Input {...control} type="date" {...form.register('birthday')} />}
      </Field>
      <DialogFooter>
        <Button type="submit" loading={create.isPending}>
          {tc('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
