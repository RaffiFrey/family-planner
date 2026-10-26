import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { GoalsPage } from '@/features/finance-plus/goals-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('financePlus');
  return { title: t('pageTitles.goals') };
}

export default function Page() {
  return <GoalsPage />;
}
