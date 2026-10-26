'use client';

import { apiQuery, type Output } from '@fp/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  History,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/color-picker';
import { MemberAvatar } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/misc';
import { todayLocalDate, useAccounts } from '@/features/finance/hooks';
import { MoneyInput } from '@/features/finance/money-input';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { localDateInstant, useInvalidateFinancePlus } from './shared';

type Goal = Output<'financePlus', 'listGoals'>[number];

export function GoalsPage() {
  const t = useTranslations('financePlus.goals');
  const { householdId, can } = useHousehold();
  const canWrite = can('finance.write');
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<{ open: boolean; goal: Goal | null }>({
    open: false,
    goal: null,
  });
  const [contributing, setContributing] = React.useState<Goal | null>(null);
  const [history, setHistory] = React.useState<Goal | null>(null);
  const query = useQuery(
    apiQuery(api, 'financePlus', 'listGoals', {
      params: { householdId },
      query: { includeArchived: showArchived ? 'true' : 'false' },
    }),
  );

  const addButton = canWrite ? (
    <Button onClick={() => setEditing({ open: true, goal: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} actions={addButton} />
      <div className="mb-4 flex items-center gap-2">
        <Checkbox
          id="goals-archived"
          checked={showArchived}
          onCheckedChange={(v) => setShowArchived(v === true)}
        />
        <Label htmlFor="goals-archived" className="font-normal">
          {t('showArchived')}
        </Label>
      </div>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {query.data.map((g) => (
            <li key={g.id}>
              <GoalCard
                goal={g}
                canWrite={canWrite}
                onEdit={() => setEditing({ open: true, goal: g })}
                onContribute={() => setContributing(g)}
                onHistory={() => setHistory(g)}
              />
            </li>
          ))}
        </ul>
      )}
      <GoalDialog
        open={editing.open}
        onOpenChange={(open) => setEditing((s) => ({ ...s, open }))}
        goal={editing.goal}
      />
      <ContributionDialog goal={contributing} onClose={() => setContributing(null)} />
      <HistoryDialog goal={history} canWrite={canWrite} onClose={() => setHistory(null)} />
    </div>
  );
}

function GoalCard({
  goal: g,
  canWrite,
  onEdit,
  onContribute,
  onHistory,
}: {
  goal: Goal;
  canWrite: boolean;
  onEdit: () => void;
  onContribute: () => void;
  onHistory: () => void;
}) {
  const t = useTranslations('financePlus.goals');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const pct = Math.round(Math.min(1, Math.max(0, g.ratio)) * 100);

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.financePlus.updateGoal({ params: { householdId, goalId: g.id }, body: { archived } }),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => api.financePlus.deleteGoal({ params: { householdId, goalId: g.id } }),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <Card className={g.archived ? 'h-full opacity-70' : 'h-full'}>
      <CardContent className="grid gap-3 pt-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${g.color ?? '#1d5ef1'}22`, color: g.color ?? '#1d5ef1' }}
            aria-hidden
          >
            {g.reached ? <Trophy className="size-4" /> : <Target className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{g.name}</h2>
            <p className="text-xs text-muted">
              {g.deadline
                ? t('deadline', { date: fmt.date(localDateInstant(g.deadline)) })
                : t('noDeadline')}
              {g.progressSource === 'account' ? ` · ${t('linkedAccount')}` : ''}
            </p>
          </div>
          {g.reached ? <Badge variant="success">{t('reached')}</Badge> : null}
          {g.archived ? <Badge variant="outline">{t('archived')}</Badge> : null}
          {canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                  <MoreVertical aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil aria-hidden />
                  {tc('edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => archive.mutate(!g.archived)}>
                  {g.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {g.archived ? t('unarchive') : t('archive')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden />
                  {tc('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold tabular-nums" data-testid="goal-saved">
              {fmt.money(g.savedMinor, g.currency)}
            </span>
            <span className="text-muted tabular-nums">
              {t('ofTarget', { target: fmt.money(g.targetMinor, g.currency) })}
            </span>
          </div>
          <Progress
            value={pct}
            tone={g.reached ? 'ok' : 'default'}
            aria-label={t('progressLabel', { name: g.name, pct })}
          />
          <p className="mt-1 text-xs text-muted">
            {g.reached
              ? t('reachedOn', {
                  date: g.reachedAt ? fmt.date(g.reachedAt) : '',
                })
              : t('remaining', { amount: fmt.money(g.remainingMinor, g.currency), pct })}
          </p>
        </div>
        {!g.reached && g.requiredMonthlyMinor !== null ? (
          <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
            {t('requiredMonthly', {
              amount: fmt.money(g.requiredMonthlyMinor, g.currency),
              months: g.monthsLeft ?? 0,
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canWrite && g.progressSource === 'contributions' && !g.archived ? (
            <Button size="sm" onClick={onContribute}>
              <Plus aria-hidden />
              {t('contribute')}
            </Button>
          ) : null}
          {g.progressSource === 'contributions' ? (
            <Button size="sm" variant="secondary" onClick={onHistory}>
              <History aria-hidden />
              {t('history')}
            </Button>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle', { name: g.name })}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

interface GoalForm {
  name: string;
  target: string;
  deadline: string;
  accountId: string;
  color: string;
}

function GoalDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
}) {
  const t = useTranslations('financePlus.goals');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const accounts = useAccounts();
  const defaults = React.useCallback(
    (): GoalForm => ({
      name: goal?.name ?? '',
      target: goal ? fmt.moneyInput(goal.targetMinor, goal.currency) : '',
      deadline: goal?.deadline ?? '',
      accountId: goal?.accountId ?? '',
      color: goal?.color ?? '#16a34a',
    }),
    [goal, fmt],
  );
  const { register, handleSubmit, reset, setError, setValue, control, formState } =
    useForm<GoalForm>({ defaultValues: defaults() });
  const color = useWatch({ control, name: 'color' });
  React.useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (body: {
      name: string;
      targetMinor: number;
      deadline: string | null;
      accountId: string | null;
      color: string;
    }) =>
      goal
        ? api.financePlus.updateGoal({ params: { householdId, goalId: goal.id }, body })
        : api.financePlus.createGoal({ params: { householdId }, body }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    let targetMinor: number;
    try {
      targetMinor = fmt.parseMoney(v.target, goal?.currency);
    } catch {
      setError('target', { message: tu('invalidAmount') });
      return;
    }
    if (targetMinor <= 0) {
      setError('target', { message: tu('invalidAmount') });
      return;
    }
    mutation.mutate({
      name: v.name.trim(),
      targetMinor,
      deadline: v.deadline || null,
      accountId: v.accountId || null,
      color: v.color,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription>{t('formHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <Field label={t('name')} error={formState.errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                placeholder={t('namePlaceholder')}
                {...register('name', { required: tu('required') })}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('target')}
              hint={tu('moneyHint')}
              error={formState.errors.target?.message}
            >
              {(p) => (
                <MoneyInput
                  {...p}
                  currency={goal?.currency ?? fmt.currency}
                  {...register('target', { required: tu('required') })}
                />
              )}
            </Field>
            <Field label={t('deadlineLabel')}>
              {(p) => <Input type="date" {...p} {...register('deadline')} />}
            </Field>
          </div>
          <Field label={t('account')} hint={t('accountHint')}>
            {(p) => (
              <NativeSelect {...p} {...register('accountId')}>
                <option value="">{t('noAccount')}</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <ColorPicker label={tu('color')} value={color} onChange={(c) => setValue('color', c)} />
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

interface ContributionForm {
  amount: string;
  date: string;
  note: string;
  withdrawal: boolean;
}

function ContributionDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const t = useTranslations('financePlus.goals');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, member } = useHousehold();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const { register, handleSubmit, reset, setError, formState, control, setValue } =
    useForm<ContributionForm>({
      defaultValues: { amount: '', date: todayLocalDate(), note: '', withdrawal: false },
    });
  const withdrawal = useWatch({ control, name: 'withdrawal' });
  React.useEffect(() => {
    if (goal) reset({ amount: '', date: todayLocalDate(), note: '', withdrawal: false });
  }, [goal, reset]);

  const mutation = useMutation({
    mutationFn: (body: { amountMinor: number; date: string; note: string | null }) =>
      api.financePlus.addContribution({
        params: { householdId, goalId: goal?.id ?? '' },
        body: { ...body, memberId: member.id },
      }),
    onSuccess: async (updated) => {
      // The response is the updated goal: patch it into every cached goals list right away.
      queryClient.setQueriesData<Goal[]>({ queryKey: ['financePlus', 'listGoals'] }, (old) =>
        old?.map((g) => (g.id === updated.id ? updated : g)),
      );
      toast.success(updated.reached && !goal?.reached ? t('reachedToast') : t('contributed'));
      onClose();
      await invalidate();
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toastError(err);
    },
  });

  const onSubmit = handleSubmit((v) => {
    let amountMinor: number;
    try {
      amountMinor = fmt.parseMoney(v.amount, goal?.currency);
    } catch {
      setError('amount', { message: tu('invalidAmount') });
      return;
    }
    if (amountMinor <= 0) {
      setError('amount', { message: tu('invalidAmount') });
      return;
    }
    mutation.mutate({
      amountMinor: v.withdrawal ? -amountMinor : amountMinor,
      date: v.date || todayLocalDate(),
      note: v.note.trim() || null,
    });
  });

  return (
    <Dialog open={goal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contributeTitle', { name: goal?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {goal
              ? t('contributeHint', {
                  saved: fmt.money(goal.savedMinor, goal.currency),
                  target: fmt.money(goal.targetMinor, goal.currency),
                })
              : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('amount')}
              hint={tu('moneyHint')}
              error={formState.errors.amount?.message}
            >
              {(p) => (
                <MoneyInput
                  {...p}
                  currency={goal?.currency ?? fmt.currency}
                  {...register('amount', { required: tu('required') })}
                />
              )}
            </Field>
            <Field label={t('date')}>
              {(p) => <Input type="date" {...p} {...register('date')} />}
            </Field>
          </div>
          <Field label={t('note')}>
            {(p) => <Input {...p} maxLength={200} {...register('note')} />}
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="contribution-withdrawal"
              checked={withdrawal}
              onCheckedChange={(v) => setValue('withdrawal', v === true)}
            />
            <Label htmlFor="contribution-withdrawal" className="font-normal">
              {t('withdrawal')}
            </Label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('contribute')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  goal,
  canWrite,
  onClose,
}: {
  goal: Goal | null;
  canWrite: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('financePlus.goals');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId, memberById } = useHousehold();
  const invalidate = useInvalidateFinancePlus();
  const toastError = useToastError();
  const query = useQuery({
    ...apiQuery(api, 'financePlus', 'listContributions', {
      params: { householdId, goalId: goal?.id ?? '' },
    }),
    enabled: goal !== null,
  });
  const remove = useMutation({
    mutationFn: (contributionId: string) =>
      api.financePlus.removeContribution({
        params: { householdId, goalId: goal?.id ?? '', contributionId },
      }),
    onSuccess: async () => {
      toast.success(t('contributionRemoved'));
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <Dialog open={goal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('historyTitle', { name: goal?.name ?? '' })}</DialogTitle>
          <DialogDescription className="sr-only">{t('history')}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState title={t('noContributions')} />
        ) : (
          <ul className="grid max-h-96 gap-1 overflow-y-auto">
            {query.data.map((c) => {
              const m = memberById(c.memberId);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted"
                >
                  {m ? <MemberAvatar member={m} size="sm" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{fmt.date(localDateInstant(c.date))}</p>
                    {c.note ? <p className="truncate text-xs text-muted">{c.note}</p> : null}
                  </div>
                  <span
                    className={
                      c.amountMinor < 0
                        ? 'text-sm font-medium text-danger tabular-nums'
                        : 'text-sm font-medium text-success tabular-nums'
                    }
                  >
                    {fmt.money(c.amountMinor, goal?.currency)}
                  </span>
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tc('delete')}
                      onClick={() => remove.mutate(c.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
