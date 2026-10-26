'use client';

import { BarChart3, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleGate } from '@/components/upsell';
import { PollsSection } from './polls-section';
import { PostsFeed } from './posts-feed';

export function PinboardPage() {
  const t = useTranslations('pinboard');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'polls' ? 'polls' : 'posts';

  return (
    <ModuleGate action="pinboard.read">
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs
        value={tab}
        onValueChange={(v) => router.replace(v === 'posts' ? pathname : `${pathname}?tab=${v}`)}
      >
        <TabsList aria-label={t('tabs.label')}>
          <TabsTrigger value="posts">
            <StickyNote aria-hidden />
            {t('tabs.posts')}
          </TabsTrigger>
          <TabsTrigger value="polls">
            <BarChart3 aria-hidden />
            {t('tabs.polls')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="posts">
          <PostsFeed />
        </TabsContent>
        <TabsContent value="polls">
          <PollsSection />
        </TabsContent>
      </Tabs>
    </ModuleGate>
  );
}
