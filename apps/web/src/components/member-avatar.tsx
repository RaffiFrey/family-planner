'use client';

import type { Member } from '@fp/contracts';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn, initials, readableTextColor } from '@/lib/utils';

const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-base',
} as const;

export function MemberAvatar({
  member,
  size = 'sm',
  className,
  ring = false,
}: {
  member: Pick<Member, 'displayName' | 'color' | 'avatarUrl'>;
  size?: keyof typeof sizes;
  className?: string;
  ring?: boolean;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        ring && 'ring-2 ring-background',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: member.color, color: readableTextColor(member.color) }}
      title={member.displayName}
    >
      {member.avatarUrl ? (
        <AvatarPrimitive.Image src={member.avatarUrl} alt="" className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback aria-hidden>
        {initials(member.displayName)}
      </AvatarPrimitive.Fallback>
      <span className="sr-only">{member.displayName}</span>
    </AvatarPrimitive.Root>
  );
}

export function MemberAvatarStack({
  members,
  max = 4,
  size = 'sm',
}: {
  members: Member[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((m) => (
        <MemberAvatar key={m.id} member={m} size={size} ring />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-surface-muted font-medium text-muted ring-2 ring-background',
            sizes[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
