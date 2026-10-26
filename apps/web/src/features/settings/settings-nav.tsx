'use client';

import { Bell, ClipboardList, CreditCard, House, Mail, Plug, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/settings/members', key: 'members', icon: Users },
  { href: '/settings/invitations', key: 'invitations', icon: Mail },
  { href: '/settings/household', key: 'household', icon: House },
  { href: '/settings/notifications', key: 'notifications', icon: Bell },
  { href: '/settings/integrations', key: 'integrations', icon: Plug },
  { href: '/settings/billing', key: 'billing', icon: CreditCard },
  { href: '/settings/audit', key: 'audit', icon: ClipboardList },
  { href: '/settings/account', key: 'account', icon: User },
] as const;

export function SettingsNav() {
  const t = useTranslations('settings');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('sections')}
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-muted',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
