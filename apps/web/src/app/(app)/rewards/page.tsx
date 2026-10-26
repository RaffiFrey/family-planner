import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { RewardsPage } from '@/features/rewards/rewards-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rewards');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <RewardsPage />
    </Suspense>
  );
}
