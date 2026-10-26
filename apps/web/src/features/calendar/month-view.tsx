'use client';

import type { Occurrence } from '@fp/contracts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { type DayKey, keyToDate } from './date-utils';
import { OccurrenceChip, occurrenceColor } from './occurrence-chip';

const MAX_VISIBLE = 3;

interface MonthViewProps {
  days: DayKey[];
  /** `YYYY-MM` of the displayed month; other days are dimmed. */
  month: string;
  today: DayKey;
  byDay: Map<DayKey, Occurrence[]>;
  colors: Map<string, string>;
  intlLocale: string;
  timeLabel: (o: Occurrence) => string | undefined;
  canWrite: boolean;
  onOpen: (o: Occurrence) => void;
  onCreate: (day: DayKey) => void;
  onShowDay: (day: DayKey) => void;
}

export function MonthView({
  days,
  month,
  today,
  byDay,
  colors,
  intlLocale,
  timeLabel,
  canWrite,
  onOpen,
  onCreate,
  onShowDay,
}: MonthViewProps) {
  const t = useTranslations('calendar');
  const weekdayFmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short', timeZone: 'UTC' });
  const longFmt = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'full', timeZone: 'UTC' });

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div
        className="grid grid-cols-7 border-b border-border bg-surface text-center text-xs font-medium text-muted"
        aria-hidden
      >
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2">
            {weekdayFmt.format(keyToDate(d))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const items = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          const isToday = d === today;
          const dateLabel = longFmt.format(keyToDate(d));
          return (
            <div
              key={d}
              className={cn(
                'group relative flex min-h-16 flex-col gap-1 border-border p-1 sm:min-h-28',
                i % 7 !== 6 && 'border-r',
                i < days.length - 7 && 'border-b',
                !inMonth && 'bg-surface-muted/40',
                canWrite && 'cursor-pointer hover:bg-surface-muted/60',
              )}
              onClick={canWrite ? () => onCreate(d) : undefined}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDay(d);
                }}
                aria-label={t('eventsOn', { date: dateLabel })}
                aria-current={isToday ? 'date' : undefined}
                className={cn(
                  'inline-flex size-7 items-center justify-center self-start rounded-full text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : inMonth
                      ? 'text-foreground hover:bg-surface-muted'
                      : 'text-muted',
                )}
              >
                {Number(d.slice(8))}
              </button>

              {/* Compact dots on phones. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                {items.slice(0, 4).map((o) => (
                  <span
                    key={`${o.eventId}-${o.originalStart}`}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: occurrenceColor(o, colors) }}
                  />
                ))}
              </div>

              <ul className="hidden min-w-0 gap-0.5 sm:grid">
                {items.slice(0, MAX_VISIBLE).map((o) => (
                  <li key={`${o.eventId}-${o.originalStart}`} className="min-w-0">
                    <OccurrenceChip
                      occurrence={o}
                      color={occurrenceColor(o, colors)}
                      timeLabel={timeLabel(o)}
                      onOpen={onOpen}
                    />
                  </li>
                ))}
                {items.length > MAX_VISIBLE ? (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDay(d);
                      }}
                      className="rounded-sm px-1.5 text-xs font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {t('more', { count: items.length - MAX_VISIBLE })}
                    </button>
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
