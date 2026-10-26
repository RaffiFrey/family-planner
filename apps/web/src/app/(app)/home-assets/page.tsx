import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HomeAssetsPage } from '@/features/home-assets/home-assets-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('homeAssets');
  return { title: t('title') };
}

export default function Page() {
  return <HomeAssetsPage />;
}
