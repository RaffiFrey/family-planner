import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContactsPage } from '@/features/contacts/contacts-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contacts');
  return { title: t('title') };
}

export default function Page() {
  return <ContactsPage />;
}
