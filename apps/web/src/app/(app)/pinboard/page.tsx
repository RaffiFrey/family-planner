import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { PinboardPage } from '@/features/pinboard/pinboard-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pinboard');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <PinboardPage />
    </Suspense>
  );
}
