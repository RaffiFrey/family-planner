'use client';

import type { Occurrence } from '@fp/contracts';
import { Repeat } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function occurrenceColor(o: Occurrence, calendarColors: Map<string, string>): string {
  return o.color ?? calendarColors.get(o.calendarId) ?? '#64748b';
}

/** Translucent fill + solid accent keeps text readable in light and dark mode. */
export function chipStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}26`, borderLeftColor: color };
}

export function OccurrenceChip({
  occurrence,
  color,
  timeLabel,
  onOpen,
  className,
  style,
}: {
  occurrence: Occurrence;
  color: string;
  timeLabel?: string;
  onOpen: (o: Occurrence) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(occurrence);
      }}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-sm border-l-4 px-1.5 py-0.5 text-left text-xs text-foreground outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      style={{ ...chipStyle(color), ...style }}
    >
      {timeLabel ? <span className="shrink-0 tabular-nums text-muted">{timeLabel}</span> : null}
      <span className="truncate font-medium">{occurrence.title}</span>
      {occurrence.rrule ? <Repeat className="size-3 shrink-0 text-muted" aria-hidden /> : null}
    </button>
  );
}
