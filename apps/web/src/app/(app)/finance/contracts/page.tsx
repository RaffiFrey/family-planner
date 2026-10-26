import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ContractsPage } from '@/features/finance-plus/contracts-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('financePlus');
  return { title: t('pageTitles.contracts') };
}

export default function Page() {
  return <ContractsPage />;
}
