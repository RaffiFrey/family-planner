'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { MemberAvatarStack } from '@/components/member-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';

export function HouseholdSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('shell');
  const tp = useTranslations('plans');
  const { me, household, members, switchHousehold } = useHousehold();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary',
          compact && 'w-auto',
        )}
        aria-label={t('switchHousehold')}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{household.name}</div>
          {compact ? null : <div className="truncate text-xs text-muted">{tp(household.plan)}</div>}
        </div>
        {compact ? null : <MemberAvatarStack members={members} max={3} size="xs" />}
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('households')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={household.id} onValueChange={switchHousehold}>
          {me.memberships.map(({ household: h }) => (
            <DropdownMenuRadioItem key={h.id} value={h.id}>
              <span className="truncate">{h.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <Plus aria-hidden />
            {t('newHousehold')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
