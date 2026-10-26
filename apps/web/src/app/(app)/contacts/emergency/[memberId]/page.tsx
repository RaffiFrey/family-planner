import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmergencyPrint } from '@/features/contacts/emergency-print';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contacts.emergency');
  return { title: t('cardTitle') };
}

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <EmergencyPrint memberId={memberId} />;
}
