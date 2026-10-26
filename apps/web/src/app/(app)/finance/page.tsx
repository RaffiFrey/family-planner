import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FinanceOverview } from '@/features/finance/finance-overview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('title') };
}

export default function FinancePage() {
  return <FinanceOverview />;
}
