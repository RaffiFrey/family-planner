'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';
import { HouseholdSwitcher } from './household-switcher';
import { isActive, NAV_GROUPS } from './nav-items';

export function AppLogo() {
  const t = useTranslations('common');
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md px-2 py-1 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#1d5ef1" />
        <path d="M14 32 32 16l18 16v16a2 2 0 0 1-2 2H38V38H26v12H16a2 2 0 0 1-2-2Z" fill="#fff" />
      </svg>
      <span>{t('appName')}</span>
    </Link>
  );
}

export function Sidebar() {
  const t = useTranslations('nav');
  const ts = useTranslations('shell');
  const tg = useTranslations('modules.navGroups');
  const pathname = usePathname();
  const { can } = useHousehold();
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.requires || can(item.requires)),
  })).filter((g) => g.items.length > 0);
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 lg:flex">
      <AppLogo />
      <HouseholdSwitcher />
      <nav aria-label={ts('mainNavigation')} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {groups.map((group) => (
          <div key={group.key} className="mb-3">
            {group.key !== 'main' ? (
              <h2
                id={`nav-group-${group.key}`}
                className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                {tg(group.key)}
              </h2>
            ) : null}
            <ul
              className="grid gap-0.5"
              aria-labelledby={group.key !== 'main' ? `nav-group-${group.key}` : undefined}
            >
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-surface-muted',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {t(item.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
