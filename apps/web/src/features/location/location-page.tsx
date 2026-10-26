'use client';

import { apiQuery } from '@fp/api-client';
import type { GeoPlace, LocationShare, MemberLocation } from '@fp/contracts';
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Crosshair,
  LocateFixed,
  MapPin,
  MapPinned,
  MoreVertical,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/member-avatar';
import { MemberPicker } from '@/components/member-picker';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/misc';
import { ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { useToastError } from '@/lib/errors';
import { useFormat } from '@/lib/use-format';
import type { MapFocus, MapMember, MapPlace } from './location-map';
import { getCurrentPosition, useLocationPings } from './use-location-pings';

function MapLoading() {
  const t = useTranslations('location.map');
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true">
      <Skeleton className="absolute inset-0" />
      <span className="relative text-sm text-muted" role="status">
        {t('loading')}
      </span>
    </div>
  );
}

const LocationMap = dynamic(() => import('./location-map'), {
  ssr: false,
  loading: () => <MapLoading />,
});

const DURATIONS = ['15', '60', '240', '480', '1440', '4320', '10080'] as const;
type Duration = (typeof DURATIONS)[number];

type Subscription = Awaited<ReturnType<typeof api.location.subscriptions.list>>[number];

function isShareActive(share: LocationShare | null | undefined): share is LocationShare {
  return Boolean(share?.active && new Date(share.until).getTime() > Date.now());
}

export function LocationPage() {
  return (
    <ModuleGate action="location.read">
      <LocationContent />
    </ModuleGate>
  );
}

function usePlaces(householdId: string) {
  return useQuery({
    queryKey: ['location', 'places', householdId],
    queryFn: () => api.location.places.list({ params: { householdId } }),
  });
}

function useSubscriptions(householdId: string) {
  return useQuery({
    queryKey: ['location', 'subscriptions', householdId],
    queryFn: () => api.location.subscriptions.list({ params: { householdId } }),
  });
}

function LocationContent() {
  const t = useTranslations('location');
  const { householdId, can, memberById } = useHousehold();
  const canWrite = can('location.write');

  const shareQuery = useQuery(apiQuery(api, 'location', 'myShare', { params: { householdId } }));
  const latestQuery = useQuery({
    ...apiQuery(api, 'location', 'latest', { params: { householdId } }),
    refetchInterval: 30_000,
  });
  const placesQuery = usePlaces(householdId);

  const sharing = canWrite && isShareActive(shareQuery.data);
  const pings = useLocationPings(householdId, sharing);

  const [focus, setFocus] = React.useState<MapFocus | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [placeDialog, setPlaceDialog] = React.useState<{
    open: boolean;
    place: GeoPlace | null;
    initial: { lat: number; lng: number } | null;
    nonce: number;
  }>({ open: false, place: null, initial: null, nonce: 0 });
  const [draft, setDraft] = React.useState<{ lat: number; lng: number; radiusM: number } | null>(
    null,
  );

  const mapMembers = React.useMemo<MapMember[]>(
    () =>
      (latestQuery.data ?? []).flatMap((loc) => {
        const m = memberById(loc.memberId);
        return m
          ? [
              {
                id: loc.memberId,
                name: m.displayName,
                color: m.color,
                lat: loc.lat,
                lng: loc.lng,
                accuracyM: loc.accuracyM,
              },
            ]
          : [];
      }),
    [latestQuery.data, memberById],
  );
  const mapPlaces = React.useMemo<MapPlace[]>(
    () =>
      (placesQuery.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        radiusM: p.radiusM,
      })),
    [placesQuery.data],
  );

  const onPick = React.useCallback((lat: number, lng: number) => {
    setPicking(false);
    setPlaceDialog({ open: true, place: null, initial: { lat, lng }, nonce: Date.now() });
  }, []);

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />

      <div
        className="mb-6 flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
        role="note"
        aria-labelledby="location-privacy-title"
      >
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p id="location-privacy-title" className="font-semibold">
            {t('privacy.title')}
          </p>
          <p className="mt-1 text-muted">{t('privacy.body')}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-3">
          {picking ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <Crosshair className="size-4" aria-hidden />
                {t('map.pickHint')}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setPicking(false)}>
                {t('map.cancelPick')}
              </Button>
            </div>
          ) : null}
          <Card className="relative h-[55vh] min-h-80 overflow-hidden">
            <LocationMap
              members={mapMembers}
              places={mapPlaces}
              focus={focus}
              picking={picking}
              onPick={onPick}
              draft={placeDialog.open ? draft : null}
              ariaLabel={t('map.label')}
              attribution={t('map.attribution')}
            />
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {canWrite ? (
            <ShareCard
              query={shareQuery}
              sharing={sharing}
              geoStatus={pings.status}
              lastSentAt={pings.lastSentAt}
            />
          ) : null}
          <MembersCard
            query={latestQuery}
            places={placesQuery.data ?? []}
            onFocus={(loc) => setFocus({ lat: loc.lat, lng: loc.lng, nonce: Date.now() })}
          />
        </div>
      </div>

      <PlacesSection
        query={placesQuery}
        canWrite={canWrite}
        onAdd={() =>
          setPlaceDialog({ open: true, place: null, initial: pings.lastFix, nonce: Date.now() })
        }
        onPickOnMap={() => setPicking(true)}
        onEdit={(place) => setPlaceDialog({ open: true, place, initial: null, nonce: Date.now() })}
        onFocus={(p) => setFocus({ lat: p.lat, lng: p.lng, nonce: Date.now() })}
      />

      <PlaceDialog
        key={placeDialog.nonce}
        open={placeDialog.open}
        onOpenChange={(open) => {
          setPlaceDialog((d) => ({ ...d, open }));
          if (!open) setDraft(null);
        }}
        place={placeDialog.place}
        initial={placeDialog.initial}
        onDraftChange={setDraft}
      />
    </div>
  );
}

// ---------------------------------------------------------------- sharing

function ShareCard({
  query,
  sharing,
  geoStatus,
  lastSentAt,
}: {
  query: UseQueryResult<LocationShare | null>;
  sharing: boolean;
  geoStatus: ReturnType<typeof useLocationPings>['status'];
  lastSentAt: Date | null;
}) {
  const t = useTranslations('location');
  const fmt = useFormat();
  const { householdId, members, member: me, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [duration, setDuration] = React.useState<Duration>('60');
  const [audience, setAudience] = React.useState<'all' | 'some'>('all');
  const [sharedWith, setSharedWith] = React.useState<string[]>([]);
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [audienceError, setAudienceError] = React.useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['location'] });

  const start = useMutation({
    mutationFn: () =>
      api.location.startSharing({
        params: { householdId },
        body: {
          durationMinutes: Number(duration),
          sharedWith: audience === 'all' ? null : sharedWith,
        },
      }),
    onSuccess: async (share) => {
      queryClient.setQueryData(['location', 'myShare', { params: { householdId } }], share);
      toast.success(t('share.started'));
      await invalidate();
    },
    onError: toastError,
  });

  const stop = useMutation({
    mutationFn: () => api.location.stopSharing({ params: { householdId } }),
    onSuccess: async () => {
      setConfirmStop(false);
      toast.success(t('share.stopped'));
      await invalidate();
    },
    onError: toastError,
  });

  const others = members.filter((m) => m.id !== me.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LocateFixed className="size-4" aria-hidden />
          {t('share.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : sharing && query.data ? (
          <>
            <div className="grid gap-1 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span className="relative flex size-2.5" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
                {t('share.activeUntil', { date: fmt.dateTime(query.data.until) })}
              </p>
              <p className="text-muted">
                {query.data.sharedWith === null
                  ? t('share.sharedWithAll')
                  : t('share.sharedWithSome', {
                      names: query.data.sharedWith
                        .map((id) => memberById(id)?.displayName ?? '?')
                        .join(', '),
                    })}
              </p>
            </div>
            <GeoStatusLine status={geoStatus} lastSentAt={lastSentAt} />
            <Button variant="destructive" onClick={() => setConfirmStop(true)}>
              {t('share.stop')}
            </Button>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (audience === 'some' && sharedWith.length === 0) {
                setAudienceError(t('share.pickMembers'));
                return;
              }
              setAudienceError(null);
              start.mutate();
            }}
          >
            <p className="text-sm text-muted">{t('share.inactive')}</p>
            <Field label={t('share.duration')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as Duration)}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {t(`share.durations.${d}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t('share.audience')} error={audienceError ?? undefined}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as 'all' | 'some')}
                >
                  <option value="all">{t('share.audienceAll')}</option>
                  <option value="some">{t('share.audienceSome')}</option>
                </NativeSelect>
              )}
            </Field>
            {audience === 'some' ? (
              <MemberPicker
                value={sharedWith}
                onChange={setSharedWith}
                members={others}
                label={t('share.audienceSome')}
              />
            ) : null}
            <Button type="submit" loading={start.isPending}>
              <MapPin aria-hidden />
              {t('share.start')}
            </Button>
          </form>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title={t('share.stopTitle')}
        description={t('share.stopBody')}
        confirmLabel={t('share.stop')}
        destructive
        loading={stop.isPending}
        onConfirm={() => stop.mutate()}
      />
    </Card>
  );
}

function GeoStatusLine({
  status,
  lastSentAt,
}: {
  status: ReturnType<typeof useLocationPings>['status'];
  lastSentAt: Date | null;
}) {
  const t = useTranslations('location');
  const fmt = useFormat();
  if (status === 'denied')
    return (
      <p role="alert" className="rounded-md bg-warning/10 p-2 text-sm text-warning">
        {t('privacy.geoDenied')}
      </p>
    );
  if (status === 'unsupported')
    return (
      <p role="alert" className="rounded-md bg-warning/10 p-2 text-sm text-warning">
        {t('privacy.geoUnsupported')}
      </p>
    );
  return (
    <div className="grid gap-0.5 text-xs text-muted" aria-live="polite">
      <p>{t('share.sending')}</p>
      <p>{lastSentAt ? t('share.lastSent', { time: fmt.time(lastSentAt) }) : t('share.waiting')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- members

function MembersCard({
  query,
  places,
  onFocus,
}: {
  query: UseQueryResult<MemberLocation[]>;
  places: GeoPlace[];
  onFocus: (loc: MemberLocation) => void;
}) {
  const t = useTranslations('location.members');
  const fmt = useFormat();
  const { memberById } = useHousehold();
  const placeName = (id: string) => places.find((p) => p.id === id)?.name;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {query.data.map((loc) => {
              const m = memberById(loc.memberId);
              if (!m) return null;
              const at = loc.placeIds.map(placeName).filter(Boolean).join(', ');
              return (
                <li key={loc.memberId}>
                  <button
                    type="button"
                    onClick={() => onFocus(loc)}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${m.displayName}: ${t('showOnMap')}`}
                  >
                    <MemberAvatar member={m} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {m.displayName}
                        {at ? (
                          <span className="font-normal text-muted">
                            {' '}
                            · {t('atPlace', { place: at })}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted">
                        {t('seen', { time: fmt.dateTime(loc.at) })} ·{' '}
                        {t('until', { date: fmt.dateTime(loc.until) })}
                      </span>
                    </span>
                    <MapPinned className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- places

function PlacesSection({
  query,
  canWrite,
  onAdd,
  onPickOnMap,
  onEdit,
  onFocus,
}: {
  query: ReturnType<typeof usePlaces>;
  canWrite: boolean;
  onAdd: () => void;
  onPickOnMap: () => void;
  onEdit: (place: GeoPlace) => void;
  onFocus: (place: GeoPlace) => void;
}) {
  const t = useTranslations('location');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId, memberById } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const subsQuery = useSubscriptions(householdId);
  const [deleting, setDeleting] = React.useState<GeoPlace | null>(null);
  const [subscribing, setSubscribing] = React.useState<GeoPlace | null>(null);

  const remove = useMutation({
    mutationFn: (p: GeoPlace) =>
      api.location.places.remove({ params: { householdId, placeId: p.id } }),
    onMutate: async (p) => {
      const key = ['location', 'places', householdId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<GeoPlace[]>(key);
      queryClient.setQueryData<GeoPlace[]>(key, (old) => old?.filter((x) => x.id !== p.id));
      return { prev };
    },
    onError: (err, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['location', 'places', householdId], ctx.prev);
      toastError(err);
    },
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('places.deleted'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['location'] }),
  });

  const unsubscribe = useMutation({
    mutationFn: (s: Subscription) =>
      api.location.subscriptions.remove({ params: { householdId, subscriptionId: s.id } }),
    onSuccess: async () => {
      toast.success(t('subscriptions.removed'));
      await queryClient.invalidateQueries({ queryKey: ['location', 'subscriptions'] });
    },
    onError: toastError,
  });

  const subsFor = (placeId: string) => (subsQuery.data ?? []).filter((s) => s.placeId === placeId);

  const actions = canWrite ? (
    <>
      <Button variant="secondary" onClick={onPickOnMap}>
        <Crosshair aria-hidden />
        {t('places.pickOnMap')}
      </Button>
      <Button onClick={onAdd}>
        <Plus aria-hidden />
        {t('places.add')}
      </Button>
    </>
  ) : null;

  return (
    <section className="mt-8" aria-labelledby="places-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="places-title" className="text-lg font-semibold">
            {t('places.title')}
          </h2>
          <p className="text-sm text-muted">{t('places.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {query.isPending ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<MapPin />} title={t('places.empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data.map((p) => {
            const subs = subsFor(p.id);
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <CardContent className="grid gap-2 pt-4">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onFocus(p)}
                        className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block text-xs text-muted">
                          {t('places.radiusShort', { meters: p.radiusM })}
                        </span>
                      </button>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSubscribing(p)}
                          aria-label={`${t('subscriptions.notify')}: ${p.name}`}
                        >
                          <Bell aria-hidden />
                          <span className="hidden sm:inline">{t('subscriptions.notify')}</span>
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={tu('actions')}>
                              <MoreVertical aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onEdit(p)}>
                              <Pencil aria-hidden />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                              <Trash2 aria-hidden />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    {subs.length > 0 ? (
                      <ul className="flex flex-wrap gap-1" aria-label={t('subscriptions.title')}>
                        {subs.map((s) => (
                          <li key={s.id}>
                            <Badge variant="secondary" className="gap-1 pr-1">
                              <Bell aria-hidden />
                              {s.targetMemberId
                                ? (memberById(s.targetMemberId)?.displayName ?? '?')
                                : t('subscriptions.anyoneShort')}
                              <button
                                type="button"
                                className="rounded-full p-0.5 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary"
                                aria-label={t('subscriptions.remove')}
                                onClick={() => unsubscribe.mutate(s)}
                              >
                                <BellOff aria-hidden />
                              </button>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('places.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('places.deleteBody')}
        confirmLabel={tc('delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
      <SubscribeDialog
        key={subscribing?.id ?? 'none'}
        place={subscribing}
        onClose={() => setSubscribing(null)}
      />
    </section>
  );
}

function SubscribeDialog({ place, onClose }: { place: GeoPlace | null; onClose: () => void }) {
  const t = useTranslations('location.subscriptions');
  const tc = useTranslations('common');
  const { householdId, members, member: me } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  const [target, setTarget] = React.useState('');

  const create = useMutation({
    mutationFn: (p: GeoPlace) =>
      api.location.subscriptions.create({
        params: { householdId, placeId: p.id },
        body: { targetMemberId: target || null },
      }),
    onSuccess: async () => {
      toast.success(t('subscribed'));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['location', 'subscriptions'] });
    },
    onError: toastError,
  });

  return (
    <Dialog open={place !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('subscribeTitle', { place: place?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('subscribeHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (place) create.mutate(place);
          }}
        >
          <Field label={t('target')}>
            {(p) => (
              <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t('anyone')}</option>
                {members
                  .filter((m) => m.id !== me.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              <Bell aria-hidden />
              {t('notify')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PlaceForm {
  name: string;
  lat: string;
  lng: string;
  radius: string;
}

function PlaceDialog({
  open,
  onOpenChange,
  place,
  initial,
  onDraftChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  place: GeoPlace | null;
  initial: { lat: number; lng: number } | null;
  onDraftChange: (draft: { lat: number; lng: number; radiusM: number } | null) => void;
}) {
  const t = useTranslations('location.places');
  const tc = useTranslations('common');
  const tu = useTranslations('ui');
  const { householdId } = useHousehold();
  const queryClient = useQueryClient();
  const toastError = useToastError();
  // The parent remounts this dialog (via `key`) each time it opens, so props seed the form.
  const [form, setForm] = React.useState<PlaceForm>(() => {
    const coords = place ?? initial;
    return {
      name: place?.name ?? '',
      lat: coords ? coords.lat.toFixed(6) : '',
      lng: coords ? coords.lng.toFixed(6) : '',
      radius: String(place?.radiusM ?? 100),
    };
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof PlaceForm, string>>>({});
  const [locating, setLocating] = React.useState(false);

  const parsed = React.useMemo(() => {
    const lat = Number(form.lat.replace(',', '.'));
    const lng = Number(form.lng.replace(',', '.'));
    const radiusM = Math.round(Number(form.radius));
    return { lat, lng, radiusM };
  }, [form]);

  const coordsValid =
    form.lat !== '' &&
    form.lng !== '' &&
    Number.isFinite(parsed.lat) &&
    Number.isFinite(parsed.lng) &&
    Math.abs(parsed.lat) <= 90 &&
    Math.abs(parsed.lng) <= 180;
  const radiusValid =
    Number.isFinite(parsed.radiusM) && parsed.radiusM >= 30 && parsed.radiusM <= 5000;

  React.useEffect(() => {
    if (open && coordsValid)
      onDraftChange({
        lat: parsed.lat,
        lng: parsed.lng,
        radiusM: radiusValid ? parsed.radiusM : 100,
      });
    else onDraftChange(null);
  }, [open, coordsValid, radiusValid, parsed, onDraftChange]);

  const save = useMutation({
    mutationFn: (body: { name: string; lat: number; lng: number; radiusM: number }) =>
      place
        ? api.location.places.update({ params: { householdId, placeId: place.id }, body })
        : api.location.places.create({ params: { householdId }, body }),
    onSuccess: async () => {
      toast.success(t('saved'));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['location'] });
    },
    onError: toastError,
  });

  const locateMe = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setForm((f) => ({ ...f, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
    } catch {
      toast.error(t('invalidCoords'));
    } finally {
      setLocating(false);
    }
  };

  const onSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = tu('required');
    if (!coordsValid) next.lat = t('invalidCoords');
    if (!radiusValid) next.radius = t('radiusHint');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.mutate({
      name: form.name.trim(),
      lat: parsed.lat,
      lng: parsed.lng,
      radiusM: parsed.radiusM,
    });
  };

  const set = (key: keyof PlaceForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{place ? t('edit') : t('add')}</DialogTitle>
          <DialogDescription className="sr-only">{place ? t('edit') : t('add')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label={t('name')} error={errors.name}>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                onChange={set('name')}
                placeholder={t('namePlaceholder')}
                maxLength={100}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('lat')} error={errors.lat}>
              {(p) => <Input {...p} inputMode="decimal" value={form.lat} onChange={set('lat')} />}
            </Field>
            <Field label={t('lng')}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={form.lng}
                  onChange={set('lng')}
                  aria-invalid={Boolean(errors.lat)}
                />
              )}
            </Field>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={locating}
            onClick={() => void locateMe()}
          >
            <LocateFixed aria-hidden />
            {t('useMyPosition')}
          </Button>
          <Field label={t('radius')} hint={t('radiusHint')} error={errors.radius}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={30}
                max={5000}
                step={10}
                value={form.radius}
                onChange={set('radius')}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
