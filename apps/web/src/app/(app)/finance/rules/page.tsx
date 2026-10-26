import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RulesPage } from '@/features/finance/rules-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.rules');
  return { title: t('title') };
}

export default function Page() {
  return <RulesPage />;
}
