'use client';

import { apiQuery } from '@fp/api-client';
import type { Trip } from '@fp/contracts';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, MapPin, Plane, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { MemberAvatarStack } from '@/components/member-avatar';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/use-format';
import { TripDialog } from './trip-dialog';
import { daysBetween, noon, todayLocalDate, tripPhase } from './utils';

type When = 'upcoming' | 'past' | 'all';

export function TripsPage() {
  return (
    <ModuleGate action="travel.read">
      <TripsInner />
    </ModuleGate>
  );
}

function TripsInner() {
  const t = useTranslations('travel');
  const { householdId, can } = useHousehold();
  const canWrite = can('travel.write');
  const [when, setWhen] = React.useState<When>('upcoming');
  const [creating, setCreating] = React.useState(false);
  const query = useQuery(
    apiQuery(api, 'travel', 'list', { params: { householdId }, query: { when } }),
  );

  const addButton = canWrite ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  ) : null;

  const sorted = React.useMemo(() => {
    const list = query.data ?? [];
    return [...list].sort((a, b) =>
      when === 'past'
        ? b.startDate.localeCompare(a.startDate)
        : a.startDate.localeCompare(b.startDate),
    );
  }, [query.data, when]);

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} actions={addButton} />
      <Tabs value={when} onValueChange={(v) => setWhen(v as When)} className="mb-4">
        <TabsList aria-label={t('filter.label')}>
          <TabsTrigger value="upcoming">{t('filter.upcoming')}</TabsTrigger>
          <TabsTrigger value="past">{t('filter.past')}</TabsTrigger>
          <TabsTrigger value="all">{t('filter.all')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title={t('empty')}
          description={t('emptyHint')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
      <TripDialog open={creating} onOpenChange={setCreating} trip={null} />
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const t = useTranslations('travel');
  const fmt = useFormat();
  const { members } = useHousehold();
  const phase = tripPhase(trip);
  const travellers = members.filter((m) => trip.memberIds.includes(m.id));
  const duration = daysBetween(trip.startDate, trip.endDate) + 1;
  return (
    <Card className="relative h-full p-4 transition-colors focus-within:ring-2 focus-within:ring-primary hover:bg-surface-muted/50">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate font-semibold">
          <Link href={`/travel/${trip.id}`} className="outline-none after:absolute after:inset-0">
            {trip.name}
          </Link>
        </h2>
        {phase === 'upcoming' ? (
          <Badge variant="secondary">
            {t('startsIn', { count: daysBetween(todayLocalDate(), trip.startDate) })}
          </Badge>
        ) : phase === 'ongoing' ? (
          <Badge variant="success">{t('ongoing')}</Badge>
        ) : (
          <Badge variant="outline">{t('past')}</Badge>
        )}
      </div>
      {trip.destination ? (
        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <MapPin className="size-3.5" aria-hidden />
          {trip.destination}
        </p>
      ) : null}
      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
        <CalendarRange className="size-3.5" aria-hidden />
        {t('dateRange', {
          from: fmt.date(noon(trip.startDate)),
          to: fmt.date(noon(trip.endDate)),
        })}{' '}
        · {t('days', { count: duration })}
      </p>
      {travellers.length > 0 ? (
        <div className="mt-3">
          <MemberAvatarStack members={travellers} />
        </div>
      ) : null}
    </Card>
  );
}
