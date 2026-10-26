import type { Action } from '@fp/domain/permissions';
import {
  Bot,
  CalendarDays,
  Car,
  CheckSquare,
  FileLock2,
  FolderOpen,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Image,
  type LucideIcon,
  MapPin,
  Megaphone,
  Plane,
  ShoppingCart,
  Siren,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

export type NavLabel =
  | 'home'
  | 'calendar'
  | 'tasks'
  | 'lists'
  | 'finance'
  | 'storage'
  | 'household'
  | 'meals'
  | 'rewards'
  | 'pinboard'
  | 'travel'
  | 'photos'
  | 'vault'
  | 'contacts'
  | 'health'
  | 'school'
  | 'homeAssets'
  | 'location'
  | 'assistant';

export interface NavItem {
  href: string;
  /** Key in the shared `nav` messages. */
  label: NavLabel;
  icon: LucideIcon;
  requires?: Action;
  /** Shown in the mobile bottom bar; the rest go into the "more" sheet. */
  primary?: boolean;
}

export type NavGroupKey = 'main' | 'daily' | 'family' | 'household' | 'more';

export interface NavGroup {
  key: NavGroupKey;
  items: NavItem[];
}

/** Sidebar / "more" sheet structure. Group labels live in `modules.navGroups`. */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'main',
    items: [
      { href: '/', label: 'home', icon: House, primary: true },
      {
        href: '/calendar',
        label: 'calendar',
        icon: CalendarDays,
        requires: 'calendar.read',
        primary: true,
      },
      { href: '/tasks', label: 'tasks', icon: CheckSquare, requires: 'tasks.read', primary: true },
      {
        href: '/lists',
        label: 'lists',
        icon: ShoppingCart,
        requires: 'lists.read',
        primary: true,
      },
    ],
  },
  {
    key: 'daily',
    items: [
      { href: '/meals', label: 'meals', icon: UtensilsCrossed, requires: 'meals.read' },
      { href: '/pinboard', label: 'pinboard', icon: Megaphone, requires: 'pinboard.read' },
      { href: '/rewards', label: 'rewards', icon: Gift, requires: 'rewards.read' },
    ],
  },
  {
    key: 'family',
    items: [
      { href: '/contacts', label: 'contacts', icon: Siren, requires: 'contacts.read' },
      { href: '/health', label: 'health', icon: HeartPulse, requires: 'health.read' },
      { href: '/school', label: 'school', icon: GraduationCap, requires: 'school.read' },
      { href: '/location', label: 'location', icon: MapPin, requires: 'location.read' },
    ],
  },
  {
    key: 'household',
    items: [
      { href: '/finance', label: 'finance', icon: Wallet, requires: 'finance.read' },
      { href: '/vault', label: 'vault', icon: FileLock2, requires: 'vault.read' },
      { href: '/files', label: 'storage', icon: FolderOpen, requires: 'storage.read' },
      { href: '/home-assets', label: 'homeAssets', icon: Car, requires: 'home.read' },
      { href: '/travel', label: 'travel', icon: Plane, requires: 'travel.read' },
      { href: '/photos', label: 'photos', icon: Image, requires: 'photos.read' },
    ],
  },
  {
    key: 'more',
    items: [
      { href: '/assistant', label: 'assistant', icon: Bot, requires: 'assistant.read' },
      { href: '/settings', label: 'household', icon: Users },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
