'use client';

import type { Calendar } from '@fp/contracts';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface CalendarsPanelProps {
  calendars: Calendar[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string, visible: boolean) => void;
  onEdit: (calendar: Calendar) => void;
  onCreate: () => void;
  canWrite: boolean;
  idPrefix: string;
  /** Calendars backed by an ICS subscription (events are read-only). */
  readOnlyIds?: ReadonlySet<string>;
}

export function CalendarsPanel({
  calendars,
  hidden,
  onToggle,
  onEdit,
  onCreate,
  canWrite,
  idPrefix,
  readOnlyIds,
}: CalendarsPanelProps) {
  const t = useTranslations('calendar');
  const ti = useTranslations('integrations.readOnly');
  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="grid gap-2">
      <h2 id={`${idPrefix}-heading`} className="text-sm font-semibold">
        {t('calendars')}
      </h2>
      {calendars.length === 0 ? <p className="text-sm text-muted">{t('noCalendars')}</p> : null}
      <ul className="grid gap-1">
        {calendars.map((c) => {
          const id = `${idPrefix}-${c.id}`;
          return (
            <li
              key={c.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-muted"
            >
              <Checkbox
                id={id}
                checked={!hidden.has(c.id)}
                onCheckedChange={(v) => onToggle(c.id, v === true)}
                aria-label={t('showCalendar', { name: c.name })}
                style={{
                  borderColor: c.color,
                  backgroundColor: hidden.has(c.id) ? undefined : c.color,
                }}
              />
              <Label htmlFor={id} className="min-w-0 flex-1 truncate font-normal">
                {c.name}
              </Label>
              {readOnlyIds?.has(c.id) ? (
                <span title={ti('label')} className="inline-flex items-center text-muted">
                  <Lock className="size-3.5" aria-hidden />
                  <span className="sr-only">{ti('label')}</span>
                </span>
              ) : null}
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onEdit(c)}
                  aria-label={`${t('manage.editTitle')}: ${c.name}`}
                >
                  <Pencil aria-hidden />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <Button variant="outline" size="sm" onClick={onCreate} className="justify-start">
          <Plus aria-hidden />
          {t('manage.newCalendar')}
        </Button>
      ) : null}
    </section>
  );
}
