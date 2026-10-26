import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarPage } from '@/features/calendar/calendar-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calendar');
  return { title: t('title') };
}

export default function Page() {
  return <CalendarPage />;
}
