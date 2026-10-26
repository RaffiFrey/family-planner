import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TripsPage } from '@/features/travel/trips-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('travel');
  return { title: t('title') };
}

export default function Page() {
  return <TripsPage />;
}
