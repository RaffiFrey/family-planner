import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssetDetail } from '@/features/home-assets/asset-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('homeAssets');
  return { title: t('title') };
}

export default async function Page({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <AssetDetail assetId={assetId} />;
}
