'use client';

import type { Member } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Baby, Check, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
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
import { Input, Textarea } from '@/components/ui/input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { todayIso } from './dates';

type Checkups = Awaited<ReturnType<typeof api.health.checkups.list>>;
type Checkup = Checkups['checkups'][number];
type Status = Checkup['status'];

const STATUS_VARIANT: Record<Status, 'secondary' | 'warning' | 'danger' | 'success' | 'outline'> = {
  upcoming: 'secondary',
  due: 'warning',
  overdue: 'danger',
  missed: 'outline',
  done: 'success',
};

export function CheckupsPanel({ member }: { member: Member }) {
  const t = useTranslations('health.checkups');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('health.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const key = ['health', 'checkups.list', householdId, member.id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.health.checkups.list({ params: { householdId, memberId: member.id } }),
  });
  const [marking, setMarking] = React.useState<Checkup | null>(null);

  const unmark = useMutation({
    mutationFn: (c: Checkup) =>
      api.health.checkups.unmark({ params: { householdId, memberId: member.id, code: c.code } }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success(t('undone'));
    },
    onError: toastError,
  });

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  if (!query.data.birthday || query.data.checkups.length === 0) {
    return (
      <EmptyState
        icon={<Baby />}
        title={t('noBirthday', { name: member.displayName })}
        description={t('noBirthdayHint')}
        action={
          can('members.manage') ? (
            <Button variant="secondary" asChild>
              <Link href="/settings/members">{t('toMembers')}</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{t('intro')}</p>
      <ol className="grid gap-2">
        {query.data.checkups.map((c) => (
          <li
            key={c.code}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3',
              (c.status === 'due' || c.status === 'overdue') && 'border-l-4',
              c.status === 'due' && 'border-l-warning',
              c.status === 'overdue' && 'border-l-danger',
            )}
          >
            <span
              className="inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-md bg-surface-muted font-semibold"
              aria-hidden
            >
              {c.code}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                <span className="sr-only">{c.code}: </span>
                {t('window', { from: fmt.date(c.from), to: fmt.date(c.to) })}
              </p>
              <p className="text-muted">
                {c.doneOn
                  ? t('doneOn', { date: fmt.date(c.doneOn) })
                  : t('latest', { date: fmt.date(c.latest) })}
                {c.notes ? ` · ${c.notes}` : ''}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[c.status]}>{t(`status.${c.status}`)}</Badge>
            {canWrite ? (
              c.doneOn ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unmark.mutate(c)}
                  loading={unmark.isPending && unmark.variables.code === c.code}
                  aria-label={`${t('undo')}: ${c.code}`}
                >
                  <Undo2 aria-hidden />
                  {t('undo')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMarking(c)}
                  aria-label={t('markTitle', { code: c.code })}
                >
                  <Check aria-hidden />
                  {t('markDone')}
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ol>
      <MarkDialog
        checkup={marking}
        member={member}
        onClose={() => setMarking(null)}
        onSaved={(data) => queryClient.setQueryData(key, data)}
      />
    </div>
  );
}

function MarkDialog({
  checkup,
  member,
  onClose,
  onSaved,
}: {
  checkup: Checkup | null;
  member: Member;
  onClose: () => void;
  onSaved: (data: Checkups) => void;
}) {
  const t = useTranslations('health.checkups');
  const tc = useTranslations('common');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { register, handleSubmit, reset } = useForm<{ doneOn: string; notes: string }>({
    defaultValues: { doneOn: todayIso(), notes: '' },
  });
  React.useEffect(() => {
    if (checkup) reset({ doneOn: todayIso(), notes: '' });
  }, [checkup, reset]);

  const mutation = useMutation({
    mutationFn: (v: { doneOn: string; notes: string }) =>
      api.health.checkups.markDone({
        params: { householdId, memberId: member.id, code: checkup?.code ?? 'U1' },
        body: { doneOn: v.doneOn, notes: v.notes.trim() || null },
      }),
    onSuccess: async (data) => {
      onSaved(data);
      toast.success(t('saved'));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['health', 'checkups.list'] });
    },
    onError: toastError,
  });

  return (
    <Dialog open={checkup !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('markTitle', { code: checkup?.code ?? '' })}</DialogTitle>
          <DialogDescription>{member.displayName}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
          className="grid gap-4"
        >
          <Field label={t('date')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                max={todayIso()}
                {...register('doneOn', { required: true })}
              />
            )}
          </Field>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
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
