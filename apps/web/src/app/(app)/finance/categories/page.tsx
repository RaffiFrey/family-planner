import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CategoriesPage } from '@/features/finance/categories-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.categories');
  return { title: t('title') };
}

export default function Page() {
  return <CategoriesPage />;
}
