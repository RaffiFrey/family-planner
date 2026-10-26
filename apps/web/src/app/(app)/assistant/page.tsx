import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssistantPage } from '@/features/assistant/assistant-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('assistant');
  return { title: t('title') };
}

export default function Page() {
  return <AssistantPage />;
}
