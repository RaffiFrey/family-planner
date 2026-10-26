'use client';

import { apiQuery } from '@fp/api-client';
import { useQuery } from '@tanstack/react-query';
import { Gift, History, Inbox, LayoutGrid, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureGate, ModuleGate } from '@/components/upsell';
import { useHousehold } from '@/features/household/household-context';
import { api } from '@/lib/api';
import { AllowanceSection } from './allowance';
import { RewardsCatalog } from './catalog';
import { useIsRewardsAdult } from './hooks';
import { RewardsOverview } from './overview';
import { PointsHistory, RewardRequests } from './requests';

const TABS = ['overview', 'catalog', 'requests', 'history', 'allowance'] as const;
type Tab = (typeof TABS)[number];

export function RewardsPage() {
  const t = useTranslations('rewards');
  return (
    <ModuleGate action="rewards.read">
      <PageHeader title={t('title')} description={t('description')} />
      <FeatureGate feature="rewards">
        <RewardsTabs />
      </FeatureGate>
    </ModuleGate>
  );
}

function RewardsTabs() {
  const t = useTranslations('rewards');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { householdId } = useHousehold();
  const adult = useIsRewardsAdult();
  const raw = params.get('tab');
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'overview';
  // Badge with the number of open requests for adults.
  const open = useQuery({
    ...apiQuery(api, 'rewards', 'redemptions', {
      params: { householdId },
      query: { status: 'requested' },
    }),
    enabled: adult,
  });
  const pending = open.data?.length ?? 0;

  const icons = {
    overview: LayoutGrid,
    catalog: Gift,
    requests: Inbox,
    history: History,
    allowance: Wallet,
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => router.replace(v === 'overview' ? pathname : `${pathname}?tab=${v}`)}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList aria-label={t('tabs.label')}>
          {TABS.map((key) => {
            const Icon = icons[key];
            return (
              <TabsTrigger key={key} value={key}>
                <Icon aria-hidden />
                {t(`tabs.${key}`)}
                {key === 'requests' && pending > 0 ? (
                  <span
                    className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                    aria-label={t('requests.pendingCount', { count: pending })}
                  >
                    {pending}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <TabsContent value="overview">
        <RewardsOverview />
      </TabsContent>
      <TabsContent value="catalog">
        <RewardsCatalog />
      </TabsContent>
      <TabsContent value="requests">
        <RewardRequests />
      </TabsContent>
      <TabsContent value="history">
        <PointsHistory />
      </TabsContent>
      <TabsContent value="allowance">
        <AllowanceSection />
      </TabsContent>
    </Tabs>
  );
}
