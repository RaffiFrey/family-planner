import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { IntegrationsPage } from '@/features/integrations/integrations-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('integrations');
  return { title: t('title') };
}

export default function Page() {
  return <IntegrationsPage />;
}
