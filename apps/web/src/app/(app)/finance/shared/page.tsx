import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SharedExpensesPage } from '@/features/finance-plus/shared-expenses-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('financePlus');
  return { title: t('pageTitles.shared') };
}

export default function Page() {
  return <SharedExpensesPage />;
}
