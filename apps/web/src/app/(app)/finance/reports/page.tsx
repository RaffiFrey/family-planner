import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ReportsPage } from '@/features/finance/reports-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.reports');
  return { title: t('title') };
}

export default function Page() {
  return <ReportsPage />;
}
