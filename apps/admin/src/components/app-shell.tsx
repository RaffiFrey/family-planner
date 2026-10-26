'use client';

import {
  ActivityIcon,
  FileSpreadsheetIcon,
  FlagIcon,
  GaugeIcon,
  HomeIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MegaphoneIcon,
  MenuIcon,
  MoonIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShieldUserIcon,
  SunIcon,
  TagsIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/lib/auth-actions';
import { can, type Permission, ROLE_LABELS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useStaff } from './staff-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Hidden for staff without this permission (the API enforces it anyway). */
  permission?: Permission;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboardIcon }] },
  {
    section: 'Customers',
    items: [
      { href: '/users', label: 'Users', icon: UsersIcon, permission: 'users.view' },
      { href: '/households', label: 'Households', icon: HomeIcon, permission: 'households.view' },
      { href: '/gdpr', label: 'GDPR queue', icon: ShieldCheckIcon, permission: 'gdpr.view' },
    ],
  },
  {
    section: 'Product',
    items: [
      { href: '/flags', label: 'Feature flags', icon: FlagIcon, permission: 'flags.view' },
      {
        href: '/announcements',
        label: 'Announcements',
        icon: MegaphoneIcon,
        permission: 'announcements.view',
      },
      { href: '/finance', label: 'Finance defaults', icon: TagsIcon, permission: 'finance.view' },
      {
        href: '/finance/csv-presets',
        label: 'CSV presets',
        icon: FileSpreadsheetIcon,
        permission: 'finance.view',
      },
    ],
  },
  {
    section: 'Operations',
    items: [{ href: '/system', label: 'System', icon: GaugeIcon, permission: 'system.view' }],
  },
  {
    section: 'Staff',
    items: [
      { href: '/staff', label: 'Staff', icon: ShieldUserIcon, permission: 'staff.view' },
      { href: '/audit', label: 'Audit log', icon: ScrollTextIcon },
    ],
  },
];

const ALL_HREFS = NAV.flatMap((g) => g.items.map((i) => i.href));

function matches(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific nav entry wins, so /finance/csv-presets does not also highlight /finance. */
function isActive(pathname: string, href: string) {
  if (!matches(pathname, href)) return false;
  return !ALL_HREFS.some((o) => o.length > href.length && matches(pathname, o));
}

function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('fp-admin-theme', next);
    } catch {
      // storage unavailable: theme still applies for this page view
    }
  };
  return (
    <Button size="icon" variant="ghost" onClick={toggle} aria-label="Toggle dark mode">
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const staff = useStaff();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const visibleNav = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !i.permission || can(staff.roles, i.permission)),
  })).filter((group) => group.items.length > 0);

  const nav = (
    <nav className="grid gap-4 p-3" aria-label="Main">
      {visibleNav.map((group) => (
        <div key={group.section} className="grid gap-0.5">
          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {group.section}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => {
                setMobileOpen(false);
              }}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground',
                isActive(pathname, href) && 'bg-surface-muted font-medium text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <ActivityIcon className="size-4 text-primary" />
          <span className="text-sm font-semibold">FP Admin</span>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setMobileOpen(false);
            }}
          />
          <aside className="absolute inset-y-0 left-0 w-60 overflow-y-auto border-r border-border bg-surface">
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => {
              setMobileOpen(true);
            }}
          >
            <MenuIcon />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="user-menu">
                <span className="max-w-40 truncate">{staff.name}</span>
                <span className="hidden gap-1 sm:flex">
                  {staff.roles.map((r) => (
                    <Badge key={r} variant={r === 'superadmin' ? 'primary' : 'outline'}>
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{staff.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOutIcon />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
