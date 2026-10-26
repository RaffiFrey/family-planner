'use client';

import type { Occurrence } from '@fp/contracts';
import { toWallTime } from '@fp/domain/time';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type DayKey, isBanner, keyToDate, layoutTimed } from './date-utils';
import { chipStyle, OccurrenceChip, occurrenceColor } from './occurrence-chip';

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface TimeGridViewProps {
  days: DayKey[];
  today: DayKey;
  byDay: Map<DayKey, Occurrence[]>;
  colors: Map<string, string>;
  timeZone: string;
  intlLocale: string;
  timeLabel: (o: Occurrence) => string | undefined;
  canWrite: boolean;
  onOpen: (o: Occurrence) => void;
  onCreate: (day: DayKey, time?: string) => void;
  onShowDay: (day: DayKey) => void;
}

export function TimeGridView({
  days,
  today,
  byDay,
  colors,
  timeZone,
  intlLocale,
  timeLabel,
  canWrite,
  onOpen,
  onCreate,
  onShowDay,
}: TimeGridViewProps) {
  const t = useTranslations('calendar');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const now = useNow();
  const nowWall = toWallTime(now, timeZone);
  const nowMinutes = nowWall.hour * 60 + nowWall.minute;
  const headerFmt = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const longFmt = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'full', timeZone: 'UTC' });
  const hourFmt = new Intl.DateTimeFormat(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const single = days.length === 1;

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, []);

  const split = days.map((d) => {
    const items = byDay.get(d) ?? [];
    return {
      day: d,
      banners: items.filter((o) => isBanner(o, timeZone)),
      timed: layoutTimed(
        items.filter((o) => !isBanner(o, timeZone)),
        d,
        timeZone,
      ),
    };
  });
  const hasBanners = split.some((s) => s.banners.length > 0);
  const cols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Day headers */}
      <div className="grid border-b border-border bg-surface" style={cols}>
        <div />
        {days.map((d) => (
          <div key={d} className="border-l border-border px-1 py-2 text-center">
            <button
              type="button"
              onClick={() => onShowDay(d)}
              disabled={single}
              aria-current={d === today ? 'date' : undefined}
              aria-label={longFmt.format(keyToDate(d))}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default',
                d === today ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted',
              )}
            >
              {single ? longFmt.format(keyToDate(d)) : headerFmt.format(keyToDate(d))}
            </button>
          </div>
        ))}
      </div>

      {/* All-day / multi-day row */}
      {hasBanners ? (
        <div className="grid border-b border-border" style={cols}>
          <div className="px-1 py-1 text-right text-[10px] text-muted">{t('allDay')}</div>
          {split.map(({ day, banners }) => (
            <ul
              key={day}
              className="grid min-w-0 content-start gap-0.5 border-l border-border p-0.5"
            >
              {banners.map((o) => (
                <li key={`${o.eventId}-${o.originalStart}`} className="min-w-0">
                  <OccurrenceChip
                    occurrence={o}
                    color={occurrenceColor(o, colors)}
                    onOpen={onOpen}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      ) : null}

      {/* Hour grid */}
      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        <div className="relative grid" style={{ ...cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted tabular-nums"
                style={{ top: h * HOUR_PX }}
                aria-hidden
              >
                {h === 0 ? '' : hourFmt.format(new Date(Date.UTC(2024, 0, 1, h)))}
              </div>
            ))}
          </div>
          {split.map(({ day, timed }) => (
            <div
              key={day}
              className={cn('relative border-l border-border', canWrite && 'cursor-pointer')}
              onClick={
                canWrite
                  ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const hour = Math.min(
                        23,
                        Math.max(0, Math.floor((e.clientY - rect.top) / HOUR_PX)),
                      );
                      onCreate(day, `${String(hour).padStart(2, '0')}:00`);
                    }
                  : undefined
              }
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-border/60"
                  style={{ height: HOUR_PX }}
                  aria-hidden
                />
              ))}
              {day === today ? (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
                  style={{ top: (nowMinutes / 60) * HOUR_PX }}
                  aria-hidden
                />
              ) : null}
              <ul>
                {timed.map(({ item, top, bottom, column, columns }) => {
                  const color = occurrenceColor(item, colors);
                  const height = Math.max(((bottom - top) / 60) * HOUR_PX, 20);
                  return (
                    <li
                      key={`${item.eventId}-${item.originalStart}`}
                      className="absolute px-0.5"
                      style={{
                        top: (top / 60) * HOUR_PX,
                        height,
                        left: `${(column / columns) * 100}%`,
                        width: `${100 / columns}%`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(item);
                        }}
                        className="flex size-full flex-col overflow-hidden rounded-sm border-l-4 bg-background px-1.5 py-0.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={chipStyle(color)}
                      >
                        <span className="truncate font-medium">{item.title}</span>
                        {height > 32 ? (
                          <span className="truncate text-muted tabular-nums">
                            {timeLabel(item)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
