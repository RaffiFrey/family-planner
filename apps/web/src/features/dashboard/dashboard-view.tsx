'use client';

import { apiQuery } from '@fp/api-client';
import { addInZone, startOfDayInZone } from '@fp/domain/time';
import { categoryLabel } from '@fp/i18n';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CheckSquare, ShoppingCart, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { MemberAvatar } from '@/components/member-avatar';
import { PageHeader, QueryView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';

function useToday(timeZone: string) {
  return React.useMemo(() => {
    const start = startOfDayInZone(new Date(), timeZone);
    return { start, end: addInZone(start, 1, 'day', timeZone) };
  }, [timeZone]);
}

function SectionCard({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('dashboard');
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
          {title}
        </CardTitle>
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {t('viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="sr-only">: {title}</span>
        </Link>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TodayEvents() {
  const t = useTranslations('dashboard');
  const { householdId, household } = useHousehold();
  const fmt = useFormat();
  const today = useToday(household.timezone);
  const query = useQuery(
    apiQuery(api, 'calendar', 'occurrences', {
      params: { householdId },
      query: { from: today.start.toISOString(), to: today.end.toISOString() },
    }),
  );
  return (
    <SectionCard title={t('todayEvents')} icon={<CalendarDays />} href="/calendar">
      <QueryView query={query} rows={2}>
        {(items) =>
          items.length === 0 ? (
            <p className="text-sm text-muted">{t('noEvents')}</p>
          ) : (
            <ul className="grid gap-2">
              {[...items]
                .sort(
                  (a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
                )
                .map((o) => (
                  <li key={`${o.eventId}-${o.originalStart}`} className="flex items-center gap-3">
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: o.color ?? 'var(--color-primary)' }}
                      aria-hidden
                    />
                    <span className="w-20 shrink-0 text-sm text-muted tabular-nums">
                      {o.allDay ? t('allDay') : fmt.time(o.start)}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">{o.title}</span>
                  </li>
                ))}
            </ul>
          )
        }
      </QueryView>
    </SectionCard>
  );
}

function DueTasks() {
  const t = useTranslations('dashboard');
  const { householdId, household, memberById } = useHousehold();
  const fmt = useFormat();
  const today = useToday(household.timezone);
  const query = useQuery(
    apiQuery(api, 'tasks', 'list', {
      params: { householdId },
      query: { status: 'open', dueBefore: today.end.toISOString() },
    }),
  );
  return (
    <SectionCard title={t('openTasks')} icon={<CheckSquare />} href="/tasks">
      <QueryView query={query} rows={3}>
        {(tasks) => {
          const due = tasks
            .filter((task) => task.dueAt !== null)
            .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
          if (due.length === 0) return <p className="text-sm text-muted">{t('noTasks')}</p>;
          return (
            <ul className="grid gap-2">
              {due.slice(0, 8).map((task) => {
                const overdue = new Date(task.dueAt ?? 0) < today.start;
                const assignee = memberById(task.assigneeMemberId);
                return (
                  <li key={task.id}>
                    <Link
                      href={`/tasks?task=${task.id}`}
                      className="flex items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {assignee ? (
                        <MemberAvatar member={assignee} size="xs" />
                      ) : (
                        <span className="size-5" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                      <Badge variant={overdue ? 'danger' : 'secondary'}>
                        {overdue
                          ? `${t('overdue')} · ${fmt.date(task.dueAt ?? '', { day: 'numeric', month: 'short' })}`
                          : t('dueToday')}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryView>
    </SectionCard>
  );
}

function ListsSummary() {
  const t = useTranslations('dashboard');
  const tk = useTranslations('listKinds');
  const { householdId } = useHousehold();
  const query = useQuery(apiQuery(api, 'lists', 'list', { params: { householdId } }));
  return (
    <SectionCard title={t('shopping')} icon={<ShoppingCart />} href="/lists">
      <QueryView query={query} rows={2}>
        {(lists) =>
          lists.length === 0 ? (
            <p className="text-sm text-muted">{t('noLists')}</p>
          ) : (
            <ul className="grid gap-1">
              {[...lists]
                .sort(
                  (a, b) =>
                    Number(b.kind === 'shopping') - Number(a.kind === 'shopping') ||
                    b.openCount - a.openCount,
                )
                .slice(0, 6)
                .map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/lists/${l.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{l.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted">{tk(l.kind)}</span>
                        <Badge variant={l.openCount > 0 ? 'default' : 'secondary'}>
                          {t('openItems', { count: l.openCount })}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )
        }
      </QueryView>
    </SectionCard>
  );
}

function FinanceSummary() {
  const t = useTranslations('dashboard');
  const tl = useTranslations('budgetLevels');
  const locale = useLocale();
  const { householdId } = useHousehold();
  const fmt = useFormat();
  const overview = useQuery(apiQuery(api, 'finance', 'overview', { params: { householdId } }));
  const categories = useQuery(
    apiQuery(api, 'finance', 'listCategories', { params: { householdId } }),
  );
  const categoryName = (id: string) => {
    const c = categories.data?.find((x) => x.id === id);
    return c ? categoryLabel(locale, c) : '';
  };
  return (
    <SectionCard title={t('finance')} icon={<Wallet />} href="/finance">
      <QueryView query={overview} rows={3}>
        {(o) => (
          <div className="grid gap-4">
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dt className="text-xs text-muted">{t('income')}</dt>
                <dd className="font-semibold text-success tabular-nums">
                  {fmt.money(o.incomeMinor, o.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('expenses')}</dt>
                <dd className="font-semibold text-danger tabular-nums">
                  {fmt.money(Math.abs(o.expenseMinor), o.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('netWorth')}</dt>
                <dd className="font-semibold tabular-nums">
                  {fmt.money(o.netWorthMinor, o.currency)}
                </dd>
              </div>
            </dl>
            {o.budgets.length > 0 ? (
              <div className="grid gap-3">
                <h3 className="text-sm font-medium">{t('budgets')}</h3>
                {o.budgets.slice(0, 5).map((b) => (
                  <div key={b.budget.id} className="grid gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{categoryName(b.budget.categoryId)}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {t('spentOf', {
                          spent: fmt.money(b.spentMinor, o.currency),
                          limit: fmt.money(b.availableMinor, o.currency),
                        })}
                      </span>
                    </div>
                    <Progress
                      value={Math.round(b.ratio * 100)}
                      tone={b.level}
                      aria-label={`${categoryName(b.budget.categoryId)}: ${tl(b.level)}`}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {o.uncategorizedCount > 0 ? (
              <Link
                href="/finance/transactions?uncategorized=1"
                className="text-sm text-primary hover:underline"
              >
                {t('uncategorized', { count: o.uncategorizedCount })}
              </Link>
            ) : null}
          </div>
        )}
      </QueryView>
    </SectionCard>
  );
}

export function DashboardView() {
  const t = useTranslations('dashboard');
  const tn = useTranslations('nav');
  const { member, household, can } = useHousehold();
  const fmt = useFormat();
  return (
    <>
      <PageHeader
        title={t('greeting', { name: member.displayName })}
        description={`${tn('home')} · ${household.name} · ${fmt.date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {can('calendar.read') ? <TodayEvents /> : null}
        {can('tasks.read') ? <DueTasks /> : null}
        {can('lists.read') ? <ListsSummary /> : null}
        {can('finance.read') ? <FinanceSummary /> : null}
      </div>
    </>
  );
}
