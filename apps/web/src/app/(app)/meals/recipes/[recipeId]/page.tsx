'use client';

import { useParams } from 'next/navigation';
import { RecipeDetail } from '@/features/meals/recipe-detail';

export default function Page() {
  const { recipeId } = useParams<{ recipeId: string }>();
  return <RecipeDetail key={recipeId} recipeId={recipeId} />;
}
