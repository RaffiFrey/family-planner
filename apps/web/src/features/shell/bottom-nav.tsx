'use client';

import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';
import { isActive, NAV_GROUPS, NAV_ITEMS } from './nav-items';

export function BottomNav() {
  const t = useTranslations('nav');
  const ts = useTranslations('shell');
  const tg = useTranslations('modules.navGroups');
  const pathname = usePathname();
  const { can } = useHousehold();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const items = NAV_ITEMS.filter((item) => !item.requires || can(item.requires));
  const primary = items.filter((i) => i.primary);
  const secondary = items.filter((i) => !i.primary);
  const secondaryActive = secondary.some((i) => isActive(pathname, i.href));
  const secondaryGroups = NAV_GROUPS.map((g) => ({
    key: g.key,
    items: g.items.filter((i) => !i.primary && (!i.requires || can(i.requires))),
  })).filter((g) => g.items.length > 0);

  const linkClass = (active: boolean) =>
    cn(
      'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
      active ? 'text-primary' : 'text-muted',
    );

  return (
    <>
      <nav
        aria-label={ts('mainNavigation')}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={linkClass(active)}
            >
              <Icon className="size-5" aria-hidden />
              {t(item.label)}
            </Link>
          );
        })}
        {secondary.length > 0 ? (
          <button
            type="button"
            className={linkClass(secondaryActive)}
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            {ts('more')}
          </button>
        ) : null}
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetTitle>{ts('more')}</SheetTitle>
          <SheetDescription className="sr-only">{ts('mainNavigation')}</SheetDescription>
          <div className="grid max-h-[70dvh] gap-3 overflow-y-auto">
            {secondaryGroups.map((group) => (
              <section key={group.key} aria-labelledby={`more-group-${group.key}`}>
                <h3
                  id={`more-group-${group.key}`}
                  className="px-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  {tg(group.key)}
                </h3>
                <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active ? 'bg-primary/10 text-primary' : 'hover:bg-surface-muted',
                          )}
                        >
                          <Icon className="size-5 shrink-0" aria-hidden />
                          <span className="truncate">{t(item.label)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
