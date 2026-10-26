import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AlbumsPage } from '@/features/photos/albums-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('photos');
  return { title: t('title') };
}

export default function Page() {
  return <AlbumsPage />;
}
