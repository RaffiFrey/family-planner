import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RecipesPage } from '@/features/meals/recipes-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meals.recipes');
  return { title: t('title') };
}

export default function Page() {
  return <RecipesPage />;
}
