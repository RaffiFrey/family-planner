import type * as React from 'react';
import { PublicShell } from '@/features/shell/public-shell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
