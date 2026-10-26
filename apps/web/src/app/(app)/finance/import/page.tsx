import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ImportWizard } from '@/features/finance/import-wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.import');
  return { title: t('title') };
}

export default function Page() {
  return <ImportWizard />;
}
