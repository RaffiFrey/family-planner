import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SchoolPage } from '@/features/school/school-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('school');
  return { title: t('title') };
}

export default function Page() {
  return <SchoolPage />;
}
