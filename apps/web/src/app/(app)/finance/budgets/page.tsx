import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BudgetsPage } from '@/features/finance/budgets-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.budgets');
  return { title: t('title') };
}

export default function Page() {
  return <BudgetsPage />;
}
