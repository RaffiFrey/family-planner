'use client';

import { ApiError, apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/misc';
import { HouseholdContextProvider } from '@/features/household/household-context';
import { useHouseholdSelection } from '@/features/household/household-store';
import { useRealtime } from '@/features/realtime/use-realtime';
import { api } from '@/lib/api';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

function ShellSkeleton() {
  const t = useTranslations('common');
  return (
    <div className="flex min-h-dvh" aria-busy="true">
      <span className="sr-only" role="status">
        {t('loading')}
      </span>
      <div className="hidden w-64 border-r border-border bg-surface p-4 lg:block">
        <Skeleton className="mb-6 h-10" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="mb-2 h-9" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

/** Auth + household gate for every in-app route, then the responsive chrome. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { householdId: storedId, setHouseholdId } = useHouseholdSelection();
  const meQuery = useQuery(apiQuery(api, 'households', 'me'));

  const memberships = meQuery.data?.memberships;
  const householdId =
    memberships?.find((m) => m.household.id === storedId)?.household.id ??
    memberships?.[0]?.household.id ??
    null;

  const detailQuery = useQuery({
    ...apiQuery(api, 'households', 'get', { params: { householdId: householdId ?? '' } }),
    enabled: householdId !== null,
  });

  useRealtime(householdId);

  const unauthorized = meQuery.error instanceof ApiError && meQuery.error.status === 401;
  const noHousehold = memberships?.length === 0;

  React.useEffect(() => {
    if (unauthorized) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (noHousehold) router.replace('/onboarding');
  }, [unauthorized, noHousehold, router, pathname]);

  React.useEffect(() => {
    if (householdId && householdId !== storedId) setHouseholdId(householdId);
  }, [householdId, storedId, setHouseholdId]);

  const switchHousehold = React.useCallback(
    (id: string) => {
      setHouseholdId(id);
      router.push('/');
    },
    [setHouseholdId, router],
  );

  const contextValue = React.useMemo(() => {
    if (!meQuery.data || !detailQuery.data || !householdId) return null;
    return {
      me: meQuery.data,
      householdId,
      household: detailQuery.data.household,
      member: detailQuery.data.me,
      members: detailQuery.data.members,
      switchHousehold,
    };
  }, [meQuery.data, detailQuery.data, householdId, switchHousehold]);

  if (meQuery.isError && !unauthorized) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
      </div>
    );
  }
  if (!contextValue) return <ShellSkeleton />;

  return (
    <HouseholdContextProvider value={contextValue}>
      <SkipLink />
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 outline-none sm:px-6 lg:pb-10"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </HouseholdContextProvider>
  );
}

function SkipLink() {
  const t = useTranslations('shell');
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('skipToContent')}
    </a>
  );
}
