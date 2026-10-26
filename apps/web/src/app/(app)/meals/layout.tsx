import type * as React from 'react';
import { MealsShell } from '@/features/meals/meals-shell';

export default function MealsLayout({ children }: { children: React.ReactNode }) {
  return <MealsShell>{children}</MealsShell>;
}
