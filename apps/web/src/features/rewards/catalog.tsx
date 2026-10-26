'use client';

import { apiQuery } from '@fp/api-client';
import type { Reward } from '@fp/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Gift, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useEarners, useInvalidateRewards, useIsRewardsAdult } from './hooks';

export function RewardsCatalog() {
  const t = useTranslations('rewards.catalog');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId, member, can } = useHousehold();
  const adult = useIsRewardsAdult();
  const canRedeem = can('rewards.write');
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const catalog = useQuery(apiQuery(api, 'rewards', 'catalog', { params: { householdId } }));
  const balances = useQuery(apiQuery(api, 'rewards', 'balances', { params: { householdId } }));
  const myAvailable = balances.data?.find((b) => b.memberId === member.id)?.available ?? 0;

  const [editing, setEditing] = React.useState<{ reward: Reward | null } | null>(null);
  const [deleting, setDeleting] = React.useState<Reward | null>(null);
  const [redeeming, setRedeeming] = React.useState<Reward | null>(null);

  const remove = useMutation({
    mutationFn: (r: Reward) =>
      api.rewards.removeReward({ params: { householdId, rewardId: r.id } }),
    onSuccess: async () => {
      setDeleting(null);
      toast.success(t('deleted'));
      await invalidate();
    },
    onError: toastError,
  });

  const addButton = adult ? (
    <Button onClick={() => setEditing({ reward: null })}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  // Non-adults only see what they can redeem.
  const rewards = (catalog.data ?? []).filter((r) => adult || r.active);

  return (
    <div className="grid gap-4">
      {addButton ? <div className="flex justify-end">{addButton}</div> : null}
      {catalog.isPending ? (
        <LoadingState rows={3} />
      ) : catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : rewards.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title={t('empty')}
          description={adult ? t('emptyHint') : undefined}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((r) => {
            const affordable = adult || myAvailable >= r.costPoints;
            return (
              <li key={r.id}>
                <Card className={cn('h-full', !r.active && 'opacity-70')}>
                  <CardContent className="flex h-full flex-col gap-3 pt-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl"
                        aria-hidden
                      >
                        {r.icon ?? <Gift className="size-6 text-primary" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">{r.title}</p>
                        <p className="text-sm font-semibold text-primary tabular-nums">
                          {t('cost', { count: r.costPoints })}
                        </p>
                        {!r.active ? <Badge variant="secondary">{t('inactive')}</Badge> : null}
                      </div>
                      {adult ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                              <MoreVertical aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing({ reward: r })}>
                              <Pencil aria-hidden />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
                              <Trash2 aria-hidden />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    {r.description ? <p className="text-sm text-muted">{r.description}</p> : null}
                    {canRedeem && r.active ? (
                      <Button
                        className="mt-auto"
                        variant={affordable ? 'default' : 'secondary'}
                        disabled={!affordable}
                        onClick={() => setRedeeming(r)}
                      >
                        {affordable ? t('redeem') : t('notEnough')}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <RewardDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        reward={editing?.reward ?? null}
      />
      <RedeemDialog
        open={redeeming !== null}
        onOpenChange={(o) => !o && setRedeeming(null)}
        reward={redeeming}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function RewardBody({
  reward,
  onOpenChange,
}: {
  reward: Reward | null;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations('rewards.catalog');
  const tf = useTranslations('rewards.catalog.form');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const [title, setTitle] = React.useState(reward?.title ?? '');
  const [description, setDescription] = React.useState(reward?.description ?? '');
  const [cost, setCost] = React.useState(reward ? String(reward.costPoints) : '');
  const [icon, setIcon] = React.useState(reward?.icon ?? '');
  const [active, setActive] = React.useState(reward?.active ?? true);
  const [errors, setErrors] = React.useState<{ title?: string; cost?: string }>({});
  const id = React.useId();

  const save = useMutation({
    mutationFn: (costPoints: number) => {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        costPoints,
        icon: icon.trim() || null,
        active,
      };
      return reward
        ? api.rewards.updateReward({ params: { householdId, rewardId: reward.id }, body })
        : api.rewards.createReward({ params: { householdId }, body });
    },
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{reward ? t('edit') : t('add')}</DialogTitle>
        <DialogDescription className="sr-only">{reward ? t('edit') : t('add')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(cost);
          const next: typeof errors = {};
          if (!title.trim()) next.title = tu('required');
          if (!Number.isInteger(n) || n < 1 || n > 100_000) next.cost = tu('required');
          setErrors(next);
          if (Object.keys(next).length === 0) save.mutate(n);
        }}
      >
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
          <Field label={tf('icon')} hint={tf('iconHint')}>
            {(p) => (
              <Input
                {...p}
                maxLength={40}
                value={icon}
                className="text-center text-lg"
                onChange={(e) => setIcon(e.target.value)}
              />
            )}
          </Field>
          <Field label={tf('title')} error={errors.title}>
            {(p) => (
              <Input
                {...p}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={tf('description')}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <Field label={tf('cost')} error={errors.cost}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={1}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          )}
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-active`}
            checked={active}
            onCheckedChange={(v) => setActive(v === true)}
          />
          <Label htmlFor={`${id}-active`} className="font-normal">
            {tf('active')}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {tc('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function RewardDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reward: Reward | null;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <RewardBody reward={props.reward} onOpenChange={props.onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function RedeemBody({
  reward,
  onOpenChange,
}: {
  reward: Reward;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations('rewards.catalog');
  const tc = useTranslations('common');
  const { householdId, member } = useHousehold();
  const adult = useIsRewardsAdult();
  const earners = useEarners();
  const invalidate = useInvalidateRewards();
  const toastError = useToastError();
  const [memberId, setMemberId] = React.useState(adult ? (earners[0]?.id ?? member.id) : member.id);
  const [note, setNote] = React.useState('');

  const redeem = useMutation({
    mutationFn: () =>
      api.rewards.redeem({
        params: { householdId, rewardId: reward.id },
        body: {
          ...(memberId !== member.id ? { memberId } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(t('requested'));
      onOpenChange(false);
      await invalidate();
    },
    onError: toastError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('redeemTitle', { title: reward.title })}</DialogTitle>
        <DialogDescription>
          {t('cost', { count: reward.costPoints })} · {t('redeemBody')}
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate();
        }}
      >
        {adult ? (
          <Field label={t('requestFor')}>
            {(p) => (
              <NativeSelect {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                {earners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}
        <Field label={t('note')}>
          {(p) => (
            <Input {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={redeem.isPending}>
            {t('redeem')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function RedeemDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reward: Reward | null;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {props.reward ? (
          <RedeemBody reward={props.reward} onOpenChange={props.onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
