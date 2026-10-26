import type { ListKind } from '@fp/contracts';
import { Gift, List, ListTodo, Luggage, type LucideIcon, ShoppingCart } from 'lucide-react';
import type { z } from 'zod';

export type Kind = z.infer<typeof ListKind>;

export const LIST_KINDS: readonly Kind[] = ['shopping', 'todo', 'packing', 'wishlist', 'other'];

const ICONS: Record<Kind, LucideIcon> = {
  shopping: ShoppingCart,
  todo: ListTodo,
  packing: Luggage,
  wishlist: Gift,
  other: List,
};

export function ListKindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} aria-hidden />;
}
