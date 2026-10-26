'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
import { EmptyState } from '@/components/states';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/finance', key: 'overview' },
  { href: '/finance/transactions', key: 'transactions' },
  { href: '/finance/budgets', key: 'budgets' },
  { href: '/finance/categories', key: 'categories' },
  { href: '/finance/rules', key: 'rules' },
  { href: '/finance/import', key: 'import' },
  { href: '/finance/reports', key: 'reports' },
] as const;

/** Extension sections (financePlus); plan gating happens inside the pages via upsells. */
const PLUS_SECTIONS = [
  { href: '/finance/contracts', key: 'contracts' },
  { href: '/finance/goals', key: 'goals' },
  { href: '/finance/shared', key: 'shared' },
  { href: '/finance/bank-sync', key: 'bankSync' },
] as const;

/** Permission gate + section navigation for every finance route. */
export function FinanceShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('finance');
  const tp = useTranslations('financePlus.nav');
  const pathname = usePathname();
  const { can } = useHousehold();

  if (!can('finance.read')) {
    return <EmptyState icon={<Lock />} title={t('forbidden')} className="mt-8" />;
  }

  const sections = [
    ...SECTIONS.filter((s) => s.key !== 'import' || can('finance.write')).map((s) => ({
      href: s.href,
      label: t(`nav.${s.key}`),
    })),
    ...PLUS_SECTIONS.map((s) => ({ href: s.href, label: tp(s.key) })),
  ];

  return (
    <div>
      <nav
        aria-label={t('nav.label')}
        className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {sections.map((s) => {
            const active =
              s.href === '/finance' ? pathname === '/finance' : pathname.startsWith(s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-foreground',
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
