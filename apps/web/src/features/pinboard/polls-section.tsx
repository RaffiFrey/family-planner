'use client';

import { apiQuery } from '@fp/api-client';
import type { Poll } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Check, Lock, MoreVertical, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';
import { isAdultRole } from './posts-feed';

type Status = 'all' | 'open' | 'closed';

export function PollsSection() {
  const t = useTranslations('pinboard.polls');
  const { householdId, can } = useHousehold();
  const [status, setStatus] = React.useState<Status>('all');
  const [creating, setCreating] = React.useState(false);
  const query = useQuery(
    apiQuery(api, 'pinboard', 'polls', { params: { householdId }, query: { status } }),
  );
  const canWrite = can('pinboard.write');

  const newButton = canWrite ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('new')}
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t('filter')} className="w-40">
          {(p) => (
            <NativeSelect
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              <option value="all">{t('all')}</option>
              <option value="open">{t('openOnly')}</option>
              <option value="closed">{t('closedOnly')}</option>
            </NativeSelect>
          )}
        </Field>
        {newButton}
      </div>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<BarChart3 />}
          title={t('empty')}
          description={t('emptyHint')}
          action={newButton}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {query.data.map((poll) => (
            <li key={poll.id}>
              <PollCard poll={poll} />
            </li>
          ))}
        </ul>
      )}
      <CreatePollDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function PollCard({ poll }: { poll: Poll }) {
  const t = useTranslations('pinboard.polls');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const fmt = useFormat();
  const { householdId, member, memberById, can } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  // null = follow the server's `myVotes`; a local draft while (re)voting.
  const [draft, setSelection] = React.useState<number[] | null>(null);
  const selection = draft ?? poll.myVotes;
  const [changing, setChanging] = React.useState(false);
  const [confirm, setConfirm] = React.useState<'close' | 'delete' | null>(null);

  const canWrite = can('pinboard.write');
  const canManage = canWrite && (poll.authorMemberId === member.id || isAdultRole(member.role));
  const hasVoted = poll.myVotes.length > 0;
  const showBallot = poll.open && canWrite && (!hasVoted || changing);
  const author = memberById(poll.authorMemberId);

  const setPoll = (updated: Poll) => {
    queryClient.setQueriesData<Poll[]>({ queryKey: ['pinboard', 'polls'] }, (list) =>
      list?.map((p) => (p.id === updated.id ? updated : p)),
    );
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pinboard'] });

  const vote = useMutation({
    mutationFn: (optionIndexes: number[]) =>
      api.pinboard.vote({ params: { householdId, pollId: poll.id }, body: { optionIndexes } }),
    onSuccess: async (updated) => {
      setPoll(updated);
      setChanging(false);
      setSelection(null);
      toast.success(t('voted'));
      await refresh();
    },
    onError: toastError,
  });
  const unvote = useMutation({
    mutationFn: () => api.pinboard.unvote({ params: { householdId, pollId: poll.id } }),
    onSuccess: async (updated) => {
      setPoll(updated);
      setChanging(false);
      await refresh();
    },
    onError: toastError,
  });
  const close = useMutation({
    mutationFn: () => api.pinboard.closePoll({ params: { householdId, pollId: poll.id } }),
    onSuccess: async (updated) => {
      setPoll(updated);
      setConfirm(null);
      await refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => api.pinboard.removePoll({ params: { householdId, pollId: poll.id } }),
    onSuccess: async () => {
      setConfirm(null);
      toast.success(t('deleted'));
      await refresh();
    },
    onError: toastError,
  });

  const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
  const maxVotes = Math.max(0, ...poll.options.map((o) => o.votes));
  const groupName = `poll-${poll.id}`;

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle id={`${groupName}-q`} className="break-words">
            {poll.question}
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            {author?.displayName ?? ''} · {fmt.dateTime(poll.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant={poll.open ? 'success' : 'secondary'}>
              {poll.open ? t('open') : t('closed')}
            </Badge>
            {poll.anonymous ? (
              <Badge variant="outline">
                <Lock aria-hidden />
                {t('anonymousBadge')}
              </Badge>
            ) : null}
            {poll.multiple ? <Badge variant="outline">{t('multipleBadge')}</Badge> : null}
          </div>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {poll.open ? (
                <>
                  <DropdownMenuItem onSelect={() => setConfirm('close')}>
                    <X aria-hidden />
                    {t('close')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')}>
                <Trash2 aria-hidden />
                {tc('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {showBallot ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selection.length > 0) vote.mutate(selection);
            }}
            className="grid gap-3"
          >
            <fieldset className="grid gap-2">
              <legend className="sr-only">{poll.question}</legend>
              {poll.options.map((o) => {
                const id = `${groupName}-${o.index}`;
                const checked = selection.includes(o.index);
                return (
                  <div
                    key={o.index}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2',
                      checked ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    {poll.multiple ? (
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelection(
                            v === true
                              ? [...selection, o.index]
                              : selection.filter((i) => i !== o.index),
                          )
                        }
                      />
                    ) : (
                      <input
                        id={id}
                        type="radio"
                        name={groupName}
                        checked={checked}
                        onChange={() => setSelection([o.index])}
                        className="size-4 accent-primary"
                      />
                    )}
                    <Label htmlFor={id} className="flex-1 font-normal">
                      {o.text}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={vote.isPending} disabled={selection.length === 0}>
                <Check aria-hidden />
                {t('vote')}
              </Button>
              {changing ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setChanging(false);
                    setSelection(null);
                  }}
                >
                  {tc('cancel')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="grid gap-3" aria-label={t('results')} role="group">
            {poll.options.map((o) => {
              const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
              const mine = poll.myVotes.includes(o.index);
              const leading = o.votes > 0 && o.votes === maxVotes;
              return (
                <div key={o.index} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className={cn('min-w-0 break-words', leading && 'font-semibold')}>
                      {o.text}
                      {mine ? (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          {t('yourVote')}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {t('votes', { count: o.votes })} · {pct}%
                    </span>
                  </div>
                  <Progress value={pct} aria-label={`${o.text}: ${pct}%`} />
                  {!poll.anonymous && o.voterMemberIds.length > 0 ? (
                    <p className="text-xs text-muted">
                      {t('votedBy', {
                        names: o.voterMemberIds
                          .map((id) => memberById(id)?.displayName ?? '?')
                          .join(', '),
                      })}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{t('voters', { count: poll.totalVoters })}</span>
          <span>
            {poll.closedAt
              ? t('closedOn', { date: fmt.dateTime(poll.closedAt) })
              : poll.closesAt
                ? t('closesOn', { date: fmt.dateTime(poll.closesAt) })
                : null}
          </span>
        </div>
        {poll.open && canWrite && hasVoted && !changing ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChanging(true)}>
              {t('changeVote')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={unvote.isPending}
              onClick={() => unvote.mutate()}
            >
              {t('withdraw')}
            </Button>
          </div>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('closeTitle')}
        description={t('closeBody')}
        confirmLabel={t('close')}
        loading={close.isPending}
        onConfirm={() => close.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('deleteTitle')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

function CreatePollDialogBody({
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('pinboard.polls');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [question, setQuestion] = React.useState('');
  const [options, setOptions] = React.useState<string[]>(['', '']);
  const [multiple, setMultiple] = React.useState(false);
  const [anonymous, setAnonymous] = React.useState(false);
  const [closesAt, setClosesAt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  const create = useMutation({
    mutationFn: (opts: string[]) =>
      api.pinboard.createPoll({
        params: { householdId },
        body: {
          question: question.trim(),
          options: opts,
          multiple,
          anonymous,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        },
      }),
    onSuccess: async () => {
      toast.success(t('created'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['pinboard'] });
    },
    onError: toastError,
  });

  const submit = () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError(tu('required'));
    if (opts.length < 2) return setError(t('minOptions'));
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
      return setError(t('duplicateOptions'));
    setError(null);
    create.mutate(opts);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('new')}</DialogTitle>
        <DialogDescription className="sr-only">{t('new')}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t('question')}>
          {(p) => (
            <Input
              {...p}
              value={question}
              maxLength={300}
              placeholder={t('questionPlaceholder')}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('options')}</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={t('option', { n: i + 1 })}
                value={o}
                maxLength={120}
                onChange={(e) =>
                  setOptions((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
              {options.length > 2 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeOption', { n: i + 1 })}
                  onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          {options.length < 12 ? (
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() => setOptions((list) => [...list, ''])}
            >
              <Plus aria-hidden />
              {t('addOption')}
            </Button>
          ) : null}
        </fieldset>
        <div className="grid gap-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-multi`}
              checked={multiple}
              onCheckedChange={(v) => setMultiple(v === true)}
            />
            <Label htmlFor={`${id}-multi`} className="leading-snug font-normal">
              {t('multiple')}
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-anon`}
              checked={anonymous}
              onCheckedChange={(v) => setAnonymous(v === true)}
            />
            <Label htmlFor={`${id}-anon`} className="leading-snug font-normal">
              {t('anonymous')}
            </Label>
          </div>
        </div>
        <Field label={`${t('closesAt')} (${tc('optional')})`}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          )}
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {tc('create')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function CreatePollDialog(props: React.ComponentProps<typeof CreatePollDialogBody>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <CreatePollDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
