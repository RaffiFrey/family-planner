'use client';

import { apiQuery } from '@fp/api-client';
import { NOTIFICATION_TYPES, type Preferences } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { Section } from './section';

type Channel = 'push' | 'email' | 'in_app';
const CHANNELS: readonly Channel[] = ['push', 'email', 'in_app'];
/** Assumed server default for types missing from `channels`. */
const DEFAULT_CHANNELS: Channel[] = ['push', 'in_app'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function typeKey(type: (typeof NOTIFICATION_TYPES)[number]) {
  return type.replaceAll('.', '_') as
    | 'event_reminder'
    | 'task_assigned'
    | 'task_due'
    | 'list_item_added'
    | 'budget_warning'
    | 'budget_exceeded'
    | 'household_member_joined'
    | 'storage_file_infected'
    | 'digest_daily'
    | 'system_announcement';
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function NotificationsPage() {
  const query = useQuery(apiQuery(api, 'notifications', 'getPreferences'));
  if (query.isPending) return <LoadingState rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <PreferencesForm initial={query.data} />;
}

function PreferencesForm({ initial }: { initial: Preferences }) {
  const t = useTranslations('settings.notifications');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const id = React.useId();
  const [prefs, setPrefs] = React.useState<Preferences>(() => ({
    ...initial,
    channels: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, initial.channels[type] ?? DEFAULT_CHANNELS]),
    ),
  }));

  const save = useMutation({
    mutationFn: (body: Preferences) => api.notifications.updatePreferences({ body }),
    onSuccess: async (data) => {
      queryClient.setQueryData(apiQuery(api, 'notifications', 'getPreferences').queryKey, data);
      toast.success(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'getPreferences'] });
    },
    onError: toastError,
  });

  const toggle = (type: string, channel: Channel, on: boolean) => {
    setPrefs((p) => {
      const current = p.channels[type] ?? [];
      const next = on ? [...new Set([...current, channel])] : current.filter((c) => c !== channel);
      return { ...p, channels: { ...p.channels, [type]: next } };
    });
  };

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(prefs);
      }}
    >
      <Section title={t('title')} description={t('description')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('type')}
                </th>
                {CHANNELS.map((c) => (
                  <th key={c} scope="col" className="w-20 py-2 text-center font-medium">
                    {t(`channel.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {NOTIFICATION_TYPES.map((type) => {
                const label = t(`types.${typeKey(type)}`);
                return (
                  <tr key={type}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {label}
                    </th>
                    {CHANNELS.map((c) => (
                      <td key={c} className="py-2 text-center">
                        <Checkbox
                          aria-label={`${label}: ${t(`channel.${c}`)}`}
                          checked={prefs.channels[type]?.includes(c) ?? false}
                          onCheckedChange={(v) => toggle(type, c, v === true)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t('digest')}>
        <div className="flex flex-wrap gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-digest`}>{t('digest')}</Label>
            <NativeSelect
              id={`${id}-digest`}
              className="w-40"
              value={prefs.digest}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, digest: e.target.value as Preferences['digest'] }))
              }
            >
              {(['off', 'daily', 'weekly'] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`digestOptions.${d}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-hour`}>{t('digestHour')}</Label>
            <NativeSelect
              id={`${id}-hour`}
              className="w-28"
              disabled={prefs.digest === 'off'}
              value={prefs.digestHour}
              onChange={(e) => setPrefs((p) => ({ ...p, digestHour: Number(e.target.value) }))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </Section>

      <Section
        title={t('quietHours')}
        description={t('quietHoursHint')}
        actions={
          <Switch
            aria-label={t('quietHours')}
            checked={prefs.quietHours !== null}
            onCheckedChange={(on) =>
              setPrefs((p) => ({ ...p, quietHours: on ? { from: 22, to: 7 } : null }))
            }
          />
        }
      >
        {prefs.quietHours ? (
          <div className="flex flex-wrap gap-4">
            {(['from', 'to'] as const).map((k) => (
              <div key={k} className="grid gap-1.5">
                <Label htmlFor={`${id}-${k}`}>{t(k)}</Label>
                <NativeSelect
                  id={`${id}-${k}`}
                  className="w-28"
                  value={prefs.quietHours?.[k] ?? 0}
                  onChange={(e) =>
                    setPrefs((p) =>
                      p.quietHours
                        ? { ...p, quietHours: { ...p.quietHours, [k]: Number(e.target.value) } }
                        : p,
                    )
                  }
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <div>
        <Button type="submit" loading={save.isPending}>
          {tc('save')}
        </Button>
      </div>
    </form>
  );
}
