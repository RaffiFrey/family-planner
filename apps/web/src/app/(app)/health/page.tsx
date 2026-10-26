import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthPage } from '@/features/health/health-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('health');
  return { title: t('title') };
}

export default function Page() {
  return <HealthPage />;
}
