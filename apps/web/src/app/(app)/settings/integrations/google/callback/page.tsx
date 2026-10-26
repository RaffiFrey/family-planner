import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { GoogleCallback } from '@/features/integrations/google-callback';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('integrations.google');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={1} />}>
      <GoogleCallback />
    </Suspense>
  );
}
