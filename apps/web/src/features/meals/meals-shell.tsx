'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
import { ModuleGate } from '@/components/upsell';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/meals', key: 'plan' },
  { href: '/meals/recipes', key: 'recipes' },
] as const;

/** Permission gate + section tabs for every meals route. */
export function MealsShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('meals');
  const pathname = usePathname();
  return (
    <ModuleGate action="meals.read">
      <nav
        aria-label={t('nav.label')}
        className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {SECTIONS.map((s) => {
            const active =
              s.href === '/meals' ? pathname === '/meals' : pathname.startsWith(s.href);
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
                  {t(`nav.${s.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </ModuleGate>
  );
}
