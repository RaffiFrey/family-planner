import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MealPlanPage } from '@/features/meals/meal-plan-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meals');
  return { title: t('title') };
}

export default function Page() {
  return <MealPlanPage />;
}
