import type * as React from 'react';
import { FinanceShell } from '@/features/finance/finance-shell';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <FinanceShell>{children}</FinanceShell>;
}
