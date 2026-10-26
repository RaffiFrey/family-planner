'use client';

import type { HomeAsset, MaintenancePlan } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, History, MoreVertical, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { MoneyInput } from '@/features/finance/money-input';
import { todayIso } from '@/features/health/dates';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';

const STATUS_VARIANT = {
  ok: 'secondary',
  upcoming: 'warning',
  due: 'danger',
  ended: 'outline',
} as const;

export function useAssets() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: ['home', 'assets.list', householdId],
    queryFn: () => api.home.assets.list({ params: { householdId } }),
  });
}

export function useRecurrenceLabel(): (r: MaintenancePlan['recurrence']) => string {
  const t = useTranslations('homeAssets.maintenance');
  return (r) => (r.mode === 'interval' ? t('every', { months: r.months }) : t('customRule'));
}

/** Maintenance plans (all, or for one asset) with complete/edit/delete actions. */
export function MaintenanceList({ asset }: { asset?: HomeAsset }) {
  const t = useTranslations('homeAssets.maintenance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const recurrenceLabel = useRecurrenceLabel();
  const { householdId, can, memberById } = useHousehold();
  const canWrite = can('home.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const assets = useAssets();
  const query = useQuery({
    queryKey: ['home', 'maintenance.list', householdId, asset?.id ?? null],
    queryFn: () =>
      api.home.maintenance.list({
        params: { householdId },
        query: asset ? { assetId: asset.id } : {},
      }),
  });
  const [dialog, setDialog] = React.useState<{ open: boolean; plan: MaintenancePlan | null }>({
    open: false,
    plan: null,
  });
  const [completing, setCompleting] = React.useState<MaintenancePlan | null>(null);
  const [history, setHistory] = React.useState<MaintenancePlan | null>(null);
  const [deleting, setDeleting] = React.useState<MaintenancePlan | null>(null);

  const remove = useMutation({
    mutationFn: (p: MaintenancePlan) =>
      api.home.maintenance.remove({ params: { householdId, planId: p.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: toastError,
  });

  const assetById = new Map((assets.data ?? []).map((a) => [a.id, a]));
  const noAssets = !asset && assets.data?.length === 0;
  const addButton =
    canWrite && !noAssets ? (
      <Button onClick={() => setDialog({ open: true, plan: null })}>
        <Plus aria-hidden />
        {t('add')}
      </Button>
    ) : null;

  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const order = { due: 0, upcoming: 1, ok: 2, ended: 3 } as const;
  const plans = [...query.data].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.nextDueOn ?? '9999').localeCompare(b.nextDueOn ?? '9999'),
  );

  return (
    <div className="grid gap-3">
      {plans.length > 0 && addButton ? <div className="flex justify-end">{addButton}</div> : null}
      {plans.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-2">
          {plans.map((p) => {
            const a = assetById.get(p.assetId);
            const assignee = memberById(p.assigneeMemberId);
            return (
              <li key={p.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                    <Wrench className="size-5 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.title}</p>
                      <p className="text-sm text-muted">
                        {!asset && a ? (
                          <>
                            <Link href={`/home-assets/${a.id}`} className="hover:underline">
                              {a.name}
                            </Link>
                            {' · '}
                          </>
                        ) : null}
                        {recurrenceLabel(p.recurrence)}
                        {p.lastDoneOn
                          ? ` · ${t('lastDone', { date: fmt.date(p.lastDoneOn) })}`
                          : ''}
                      </p>
                    </div>
                    {assignee ? <MemberAvatar member={assignee} size="sm" /> : null}
                    <Badge variant={STATUS_VARIANT[p.status]}>
                      {p.nextDueOn && p.status !== 'ended'
                        ? `${t(`status.${p.status}`)} · ${t('due', { date: fmt.date(p.nextDueOn) })}`
                        : t(`status.${p.status}`)}
                    </Badge>
                    {canWrite && p.status !== 'ended' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCompleting(p)}
                        aria-label={t('completeTitle', { title: p.title })}
                      >
                        <Check aria-hidden />
                        {t('complete')}
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                          <MoreVertical aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setHistory(p)}>
                          <History aria-hidden />
                          {t('history')}
                        </DropdownMenuItem>
                        {canWrite ? (
                          <>
                            <DropdownMenuItem onSelect={() => setDialog({ open: true, plan: p })}>
                              <Pencil aria-hidden />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                              <Trash2 aria-hidden />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <PlanDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        plan={dialog.plan}
        asset={asset}
        assets={assets.data ?? []}
      />
      <CompleteDialog plan={completing} onClose={() => setCompleting(null)} />
      <HistoryDialog plan={history} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { title: deleting?.title ?? '' })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

interface PlanForm {
  assetId: string;
  templateKey: string;
  title: string;
  months: string;
  nextDueOn: string;
  leadDays: string;
  assigneeMemberId: string;
  notes: string;
}

function PlanDialog({
  open,
  onOpenChange,
  plan,
  asset,
  assets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: MaintenancePlan | null;
  asset?: HomeAsset | undefined;
  assets: HomeAsset[];
}) {
  const t = useTranslations('homeAssets.maintenance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const recurrenceLabel = useRecurrenceLabel();
  const { householdId, members } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const templates = useQuery({
    queryKey: ['home', 'maintenance.templates', householdId],
    queryFn: () => api.home.maintenance.templates({ params: { householdId } }),
    enabled: open,
    staleTime: Infinity,
  });

  const defaults = React.useCallback(
    (): PlanForm => ({
      assetId: plan?.assetId ?? asset?.id ?? assets[0]?.id ?? '',
      templateKey: '',
      title: plan?.title ?? '',
      months: String(plan?.recurrence.mode === 'interval' ? plan.recurrence.months : 12),
      nextDueOn: plan?.nextDueOn ?? '',
      leadDays: String(plan?.leadDays ?? 14),
      assigneeMemberId: plan?.assigneeMemberId ?? '',
      notes: plan?.notes ?? '',
    }),
    [plan, asset, assets],
  );
  const { register, handleSubmit, reset, setError, control, formState } = useForm<PlanForm>({
    defaultValues: defaults(),
  });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);
  const templateKey = useWatch({ control, name: 'templateKey' });
  const assetId = useWatch({ control, name: 'assetId' });
  const kind = (asset ?? assets.find((a) => a.id === assetId))?.kind;
  const available = (templates.data ?? []).filter((tp) => !kind || tp.assetKinds.includes(kind));
  const customLabel = plan?.recurrence.mode === 'rrule' ? recurrenceLabel(plan.recurrence) : null;
  const customRecurrence = customLabel !== null;

  const mutation = useMutation({
    mutationFn: (v: PlanForm) => {
      const recurrence = { mode: 'interval' as const, months: Number(v.months) };
      const common = {
        leadDays: Number(v.leadDays),
        assigneeMemberId: v.assigneeMemberId || null,
        notes: v.notes.trim() || null,
      };
      if (plan) {
        return api.home.maintenance.update({
          params: { householdId, planId: plan.id },
          body: {
            ...common,
            title: v.title.trim(),
            ...(customRecurrence ? {} : { recurrence }),
            nextDueOn: v.nextDueOn || null,
          },
        });
      }
      return api.home.maintenance.create({
        params: { householdId },
        body: v.templateKey
          ? {
              assetId: v.assetId,
              templateKey: v.templateKey,
              ...(v.nextDueOn ? { nextDueOn: v.nextDueOn } : {}),
              assigneeMemberId: common.assigneeMemberId,
              notes: common.notes,
            }
          : {
              assetId: v.assetId,
              title: v.title.trim(),
              recurrence,
              ...(v.nextDueOn ? { nextDueOn: v.nextDueOn } : {}),
              ...common,
            },
      });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const usingTemplate = !plan && templateKey !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{asset?.name ?? ''}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit((v) => mutation.mutate(v))(e)}
          className="grid gap-4"
          noValidate
        >
          {!asset && !plan ? (
            <Field label={t('asset')}>
              {(p) => (
                <NativeSelect {...p} {...register('assetId', { required: tu('required') })}>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}
          {!plan ? (
            <Field label={t('template')} hint={usingTemplate ? t('templateHint') : undefined}>
              {(p) => (
                <NativeSelect {...p} {...register('templateKey')}>
                  <option value="">{t('custom')}</option>
                  {available.map((tp) => (
                    <option key={tp.key} value={tp.key}>
                      {tp.title} ({recurrenceLabel(tp.recurrence)})
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}
          {!usingTemplate ? (
            <>
              <Field label={t('titleLabel')} error={formState.errors.title?.message}>
                {(p) => (
                  <Input
                    {...p}
                    {...register('title', {
                      validate: (v) => v.trim().length > 0 || tu('required'),
                    })}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                {customLabel !== null ? (
                  <p className="self-end text-sm text-muted">{customLabel}</p>
                ) : (
                  <Field label={t('everyMonths')}>
                    {(p) => (
                      <Input {...p} type="number" min={1} max={240} {...register('months')} />
                    )}
                  </Field>
                )}
                <Field label={t('leadDays')}>
                  {(p) => (
                    <Input {...p} type="number" min={0} max={365} {...register('leadDays')} />
                  )}
                </Field>
              </div>
            </>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('nextDueOn')} hint={plan ? undefined : t('nextDueHint')}>
              {(p) => <Input {...p} type="date" {...register('nextDueOn')} />}
            </Field>
            <Field label={t('assignee')}>
              {(p) => (
                <NativeSelect {...p} {...register('assigneeMemberId')}>
                  <option value="">{t('nobody')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
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

function CompleteDialog({ plan, onClose }: { plan: MaintenancePlan | null; onClose: () => void }) {
  const t = useTranslations('homeAssets.maintenance');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const { register, handleSubmit, reset, setError, formState } = useForm<{
    doneOn: string;
    cost: string;
    notes: string;
  }>({ defaultValues: { doneOn: todayIso(), cost: '', notes: '' } });
  React.useEffect(() => {
    if (plan) reset({ doneOn: todayIso(), cost: '', notes: '' });
  }, [plan, reset]);

  const mutation = useMutation({
    mutationFn: (v: { doneOn: string; costMinor: number | null; notes: string }) =>
      api.home.maintenance.complete({
        params: { householdId, planId: plan?.id ?? '' },
        body: { doneOn: v.doneOn, costMinor: v.costMinor, notes: v.notes.trim() || null },
      }),
    onSuccess: async (res) => {
      toast.success(
        res.plan.nextDueOn
          ? t('completed', { date: fmt.date(res.plan.nextDueOn) })
          : t('completedNoNext'),
      );
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: toastError,
  });

  const onSubmit = handleSubmit((v) => {
    let costMinor: number | null = null;
    if (v.cost.trim()) {
      try {
        costMinor = fmt.parseMoney(v.cost);
      } catch {
        setError('cost', { message: tu('invalidAmount') });
        return;
      }
      if (costMinor < 0) {
        setError('cost', { message: tu('invalidAmount') });
        return;
      }
    }
    mutation.mutate({ doneOn: v.doneOn, costMinor, notes: v.notes });
  });

  return (
    <Dialog open={plan !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('completeTitle', { title: plan?.title ?? '' })}</DialogTitle>
          <DialogDescription className="sr-only">{plan?.title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('doneOn')}>
              {(p) => <Input {...p} type="date" {...register('doneOn', { required: true })} />}
            </Field>
            <Field label={t('cost')} error={formState.errors.cost?.message}>
              {(p) => <MoneyInput {...p} currency={fmt.currency} {...register('cost')} />}
            </Field>
          </div>
          <Field label={t('notes')}>
            {(p) => <Textarea {...p} rows={2} {...register('notes')} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('complete')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ plan, onClose }: { plan: MaintenancePlan | null; onClose: () => void }) {
  const t = useTranslations('homeAssets.maintenance');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const query = useQuery({
    queryKey: ['home', 'maintenance.logs', householdId, plan?.id],
    queryFn: () => api.home.maintenance.logs({ params: { householdId, planId: plan?.id ?? '' } }),
    enabled: plan !== null,
  });
  return (
    <Dialog open={plan !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('historyTitle', { title: plan?.title ?? '' })}</DialogTitle>
          <DialogDescription className="sr-only">{t('history')}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted">{t('noHistory')}</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {query.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{fmt.date(l.doneOn)}</span>
                {l.costMinor !== null ? (
                  <span className="tabular-nums">{fmt.money(l.costMinor)}</span>
                ) : null}
                {memberById(l.memberId) ? (
                  <span className="text-muted">{memberById(l.memberId)?.displayName}</span>
                ) : null}
                {l.notes ? <span className="w-full text-muted">{l.notes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
