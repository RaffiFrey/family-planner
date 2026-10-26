'use client';

import { apiQuery } from '@fp/api-client';
import type { CalendarSubscription, GoogleCalendarConnection } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Link2, Lock, RefreshCw, Rss, Trash2, Unplug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/color-picker';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
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
import { Section } from '@/features/settings/section';
import { api } from '@/lib/api';
import { applyFieldErrors, useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { randomPresetColor } from '@/lib/utils';
import { GOOGLE_PENDING_KEY } from './google-pending';

const REFRESH_OPTIONS = ['60', '360', '720', '1440', '10080'] as const;

export function IntegrationsPage() {
  const t = useTranslations('integrations');
  const { can } = useHousehold();
  if (!can('calendar.read')) {
    return <EmptyState icon={<Lock />} title={t('noPermission')} />;
  }
  return (
    <div className="grid gap-6">
      <SubscriptionsSection />
      <GoogleSection />
    </div>
  );
}

function statusVariant(status: string): 'success' | 'danger' | 'secondary' {
  if (status === 'ok' || status === 'active') return 'success';
  if (status === 'error' || status === 'revoked') return 'danger';
  return 'secondary';
}

// ---------------------------------------------------------------- ICS subscriptions

function SubscriptionsSection() {
  const t = useTranslations('integrations.ics');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('calendar.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery(
    apiQuery(api, 'calendarSync', 'listSubscriptions', { params: { householdId } }),
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<CalendarSubscription | null>(null);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendarSync'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    ]);

  const refresh = useMutation({
    mutationFn: (s: CalendarSubscription) =>
      api.calendarSync.refreshSubscription({ params: { householdId, subscriptionId: s.id } }),
    onSuccess: async (res) => {
      if (res.subscription.status === 'error')
        toast.error(res.subscription.lastError ?? t('status.error'));
      else if (res.stats) toast.success(t('refreshed', res.stats));
      await invalidate();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (s: CalendarSubscription) =>
      api.calendarSync.deleteSubscription({ params: { householdId, subscriptionId: s.id } }),
    onSuccess: async () => {
      setRemoving(null);
      toast.success(t('removed'));
      await invalidate();
    },
    onError: toastError,
  });

  const addButton = canWrite ? (
    <Button onClick={() => setAddOpen(true)}>
      <Rss aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  return (
    <Section title={t('title')} description={t('description')} actions={addButton}>
      {query.isPending ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Rss />} title={t('empty')} description={t('emptyHint')} />
      ) : (
        <ul className="grid gap-3">
          {query.data.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant={statusVariant(s.status)}>{t(`status.${s.status}`)}</Badge>
                  <Badge variant="outline">
                    <Lock aria-hidden />
                    {t('events', { count: s.eventCount })}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {s.urlHost} ·{' '}
                  {s.lastFetchedAt
                    ? t('lastFetched', { date: fmt.dateTime(s.lastFetchedAt) })
                    : t('neverFetched')}
                  {s.failureCount > 0 ? ` · ${t('failures', { count: s.failureCount })}` : ''}
                </p>
                {s.status === 'error' && s.lastError ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {s.lastError}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/calendar">{t('openCalendar')}</Link>
                </Button>
                {canWrite ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={refresh.isPending && refresh.variables.id === s.id}
                      onClick={() => refresh.mutate(s)}
                    >
                      <RefreshCw aria-hidden />
                      {t('refresh')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t('remove')}: ${s.name}`}
                      onClick={() => setRemoving(s)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddSubscriptionDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        description={t('removeBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </Section>
  );
}

interface SubscriptionValues {
  name: string;
  url: string;
  color: string;
  refreshMinutes: (typeof REFRESH_OPTIONS)[number];
}

function AddSubscriptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('integrations.ics');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const form = useForm<SubscriptionValues>({
    defaultValues: { name: '', url: '', color: '#64748b', refreshMinutes: '360' },
  });
  const { reset } = form;
  React.useEffect(() => {
    if (open) reset({ name: '', url: '', color: randomPresetColor(), refreshMinutes: '360' });
  }, [open, reset]);

  const create = useMutation({
    mutationFn: (v: SubscriptionValues) =>
      api.calendarSync.createSubscription({
        params: { householdId },
        body: {
          name: v.name.trim(),
          url: v.url.trim(),
          color: v.color,
          refreshMinutes: Number(v.refreshMinutes),
        },
      }),
    onSuccess: async (res) => {
      onOpenChange(false);
      if (res.subscription.status === 'error')
        toast.error(res.subscription.lastError ?? t('status.error'));
      else toast.success(t('created', { count: res.subscription.eventCount }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendarSync'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  const color = useWatch({ control: form.control, name: 'color' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addTitle')}</DialogTitle>
          <DialogDescription>{t('addDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
        >
          <Field label={t('name')} error={form.formState.errors.name?.message}>
            {(p) => (
              <Input
                {...p}
                maxLength={60}
                placeholder={t('namePlaceholder')}
                {...form.register('name', {
                  validate: (v) => v.trim().length > 0 || tu('required'),
                })}
              />
            )}
          </Field>
          <Field label={t('url')} hint={t('urlHint')} error={form.formState.errors.url?.message}>
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder={t('urlPlaceholder')}
                {...form.register('url', {
                  validate: (v) => /^(https|webcal):\/\/\S{3,}$/i.test(v.trim()) || t('urlInvalid'),
                })}
              />
            )}
          </Field>
          <Field label={t('refreshEvery')}>
            {(p) => (
              <NativeSelect {...p} {...form.register('refreshMinutes')}>
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {t(`refreshOptions.${o}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <ColorPicker value={color} onChange={(c) => form.setValue('color', c)} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              <CalendarPlus aria-hidden />
              {t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Google Calendar

function GoogleSection() {
  const t = useTranslations('integrations.google');
  const fmt = useFormat();
  const { householdId, can } = useHousehold();
  const canWrite = can('calendar.write');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const query = useQuery(apiQuery(api, 'calendarSync', 'listGoogle', { params: { householdId } }));
  const calendarsQuery = useQuery(
    apiQuery(api, 'calendar', 'listCalendars', { params: { householdId } }),
  );
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<GoogleCalendarConnection | null>(null);

  const calendarName = (id: string) => calendarsQuery.data?.find((c) => c.id === id)?.name ?? '–';

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendarSync'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    ]);

  const sync = useMutation({
    mutationFn: (c: GoogleCalendarConnection) =>
      api.calendarSync.syncGoogle({ params: { householdId, connectionId: c.id } }),
    onSuccess: async (res) => {
      toast.success(
        t('synced', {
          pulled: res.pulled.created + res.pulled.updated + res.pulled.deleted,
          pushed: res.pushed.created + res.pushed.updated + res.pushed.deleted,
        }),
      );
      await invalidate();
    },
    onError: toastError,
  });

  const disconnect = useMutation({
    mutationFn: (c: GoogleCalendarConnection) =>
      api.calendarSync.disconnectGoogle({ params: { householdId, connectionId: c.id } }),
    onSuccess: async () => {
      setDisconnecting(null);
      toast.success(t('disconnected'));
      await invalidate();
    },
    onError: toastError,
  });

  const connectButton = canWrite ? (
    <Button variant="secondary" onClick={() => setConnectOpen(true)}>
      <Link2 aria-hidden />
      {t('connect')}
    </Button>
  ) : null;

  return (
    <Section title={t('title')} description={t('description')} actions={connectButton}>
      {query.isPending ? (
        <LoadingState rows={1} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3">
          {query.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.googleCalendarId}</span>
                  <Badge variant={statusVariant(c.status)}>{t(`status.${c.status}`)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t('linkedTo', { calendar: calendarName(c.calendarId) })} ·{' '}
                  {c.lastSyncedAt
                    ? t('lastSynced', { date: fmt.dateTime(c.lastSyncedAt) })
                    : t('neverSynced')}
                </p>
                {c.lastError ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {c.lastError}
                  </p>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={c.status === 'revoked'}
                    loading={sync.isPending && sync.variables.id === c.id}
                    onClick={() => sync.mutate(c)}
                  >
                    <RefreshCw aria-hidden />
                    {t('syncNow')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDisconnecting(c)}>
                    <Unplug aria-hidden />
                    {t('disconnect')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConnectGoogleDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(o) => !o && setDisconnecting(null)}
        title={t('disconnectTitle')}
        description={t('disconnectBody')}
        confirmLabel={t('disconnect')}
        destructive
        loading={disconnect.isPending}
        onConfirm={() => disconnecting && disconnect.mutate(disconnecting)}
      />
    </Section>
  );
}

function ConnectGoogleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('integrations.google');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const toastError = useToastError();
  const calendarsQuery = useQuery(
    apiQuery(api, 'calendar', 'listCalendars', { params: { householdId } }),
  );
  const subsQuery = useQuery(
    apiQuery(api, 'calendarSync', 'listSubscriptions', { params: { householdId } }),
  );
  const readOnly = new Set(subsQuery.data?.map((s) => s.calendarId) ?? []);
  const writable = (calendarsQuery.data ?? []).filter((c) => !readOnly.has(c.id));
  const form = useForm<{ calendarId: string; googleCalendarId: string }>({
    defaultValues: { calendarId: '', googleCalendarId: 'primary' },
  });
  const { reset } = form;
  const firstId = writable[0]?.id ?? '';
  React.useEffect(() => {
    if (open) reset({ calendarId: firstId, googleCalendarId: 'primary' });
  }, [open, reset, firstId]);

  const connect = useMutation({
    mutationFn: (v: { calendarId: string; googleCalendarId: string }) =>
      api.calendarSync.connectGoogle({
        params: { householdId },
        body: {
          calendarId: v.calendarId,
          googleCalendarId: v.googleCalendarId.trim() || 'primary',
        },
      }),
    onSuccess: ({ authUrl, state }) => {
      try {
        sessionStorage.setItem(GOOGLE_PENDING_KEY, JSON.stringify({ householdId, state }));
      } catch {
        // Without storage the callback falls back to the current household.
      }
      toast.message(t('redirecting'));
      window.location.assign(authUrl);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toastError(err);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('connectTitle')}</DialogTitle>
          <DialogDescription>{t('connectDescription')}</DialogDescription>
        </DialogHeader>
        {calendarsQuery.isPending ? (
          <LoadingState rows={2} />
        ) : writable.length === 0 ? (
          <p className="text-sm text-muted">{t('noWritableCalendars')}</p>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={form.handleSubmit((v) => connect.mutate(v))}
          >
            <Field label={t('calendar')} error={form.formState.errors.calendarId?.message}>
              {(p) => (
                <NativeSelect {...p} {...form.register('calendarId', { required: tu('required') })}>
                  {writable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field
              label={t('googleCalendarId')}
              hint={t('googleCalendarIdHint')}
              error={form.formState.errors.googleCalendarId?.message}
            >
              {(p) => <Input {...p} maxLength={300} {...form.register('googleCalendarId')} />}
            </Field>
            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={connect.isPending}>
                <Link2 aria-hidden />
                {t('connect')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
