'use client';

import type { Member } from '@fp/contracts';
import { useTranslations } from 'next-intl';
import { useHousehold } from '@/features/household/household-context';
import { cn } from '@/lib/utils';
import { MemberAvatar } from './member-avatar';

interface MemberPickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Defaults to all members of the current household. */
  members?: Member[];
  /** Keeps the selection order (e.g. chore rotation order) and shows position numbers. */
  ordered?: boolean;
  label?: string;
  className?: string;
}

/** Toggle chips for choosing members (attendees, rotation, shared with). */
export function MemberPicker({
  value,
  onChange,
  members,
  ordered = false,
  label,
  className,
}: MemberPickerProps) {
  const { members: all } = useHousehold();
  const t = useTranslations('ui');
  const list = members ?? all;
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="group"
      aria-label={label ?? t('members')}
    >
      {list.map((m) => {
        const index = value.indexOf(m.id);
        const active = index >= 0;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(m.id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background hover:bg-surface-muted',
            )}
          >
            <MemberAvatar member={m} size="xs" />
            {m.displayName}
            {ordered && active ? (
              <span className="text-xs font-semibold text-primary">#{index + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
