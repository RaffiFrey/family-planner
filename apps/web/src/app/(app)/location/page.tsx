import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LocationPage } from '@/features/location/location-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('location');
  return { title: t('title') };
}

export default function Page() {
  return <LocationPage />;
}
