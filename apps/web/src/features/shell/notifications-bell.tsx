'use client';

import { apiQuery } from '@fp/api-client';
import type { Notification } from '@fp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import { cn } from '@/lib/utils';

export function NotificationsBell() {
  const t = useTranslations('shell.notifications');
  const tn = useTranslations('nav');
  const router = useRouter();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [open, setOpen] = React.useState(false);
  const query = useQuery({
    ...apiQuery(api, 'notifications', 'list', { query: { limit: 20 } }),
    refetchInterval: 120_000,
  });
  const unread = query.data?.unreadCount ?? 0;

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.notifications.markRead({ body: ids ? { ids } : {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: toastError,
  });

  const openNotification = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link?.startsWith('/')) {
      setOpen(false);
      router.push(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('open', { count: unread })}
        >
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{tn('notifications')}</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0}
            loading={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            <CheckCheck aria-hidden />
            {t('markAllRead')}
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.isPending ? (
            <LoadingState rows={3} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.data.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">{t('empty')}</p>
          ) : (
            <ul className="grid gap-1">
              {query.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      'grid w-full gap-0.5 rounded-md px-3 py-2 text-left outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary',
                      !n.readAt && 'bg-primary/5',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {!n.readAt ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-primary"
                          aria-label={t('unread')}
                        />
                      ) : null}
                      {n.title}
                    </span>
                    <span className="text-sm text-muted">{n.body}</span>
                    <span className="text-xs text-muted">{fmt.dateTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
