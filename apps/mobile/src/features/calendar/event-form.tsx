import type { Event } from '@fp/contracts';
import { MEMBER_COLORS } from '@fp/ui-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, addHours, setHours, startOfHour } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, View } from 'react-native';
import {
  Button,
  Card,
  ChipMultiSelect,
  ChipSelect,
  DateField,
  ScreenScroll,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { useHousehold, useMembers } from '@/features/household/household';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/dialogs';
import { errorMessage, FormError } from '@/lib/errors';
import { allDayEndIso, allDayIso, allDayKey, dayKey, parseDayKey } from './dates';
import { useCalendars } from './hooks';
import {
  presetToRRule,
  RECURRENCE_PRESETS,
  type RecurrenceChoice,
  rruleToPreset,
} from './rrule-presets';

type Scope = 'this' | 'following' | 'all';
const REMINDER_MINUTES = ['0', '10', '30', '60', '1440'] as const;

function initialTimes(
  event: Event | undefined,
  occurrenceStart: string | undefined,
  initialDate: string | undefined,
) {
  if (!event) {
    const base = initialDate ? parseDayKey(initialDate) : new Date();
    const start = initialDate ? setHours(base, 9) : startOfHour(addHours(base, 1));
    return { start, end: addHours(start, 1) };
  }
  const seriesStart = new Date(event.start);
  const duration = new Date(event.end).getTime() - seriesStart.getTime();
  const startIso = occurrenceStart && event.rrule ? occurrenceStart : event.start;
  const endIso = new Date(new Date(startIso).getTime() + duration).toISOString();
  if (event.allDay) {
    const first = parseDayKey(allDayKey(startIso));
    const lastExclusive = parseDayKey(allDayKey(endIso));
    return { start: first, end: lastExclusive > first ? addDays(lastExclusive, -1) : first };
  }
  return { start: new Date(startIso), end: new Date(endIso) };
}

function askScope(t: (k: string) => string, title: string): Promise<Scope | null> {
  if (Platform.OS === 'web') {
    // react-native-web ignores Alert buttons: ask one yes/no question per scope instead.
    for (const scope of ['this', 'following', 'all'] as const) {
      if (window.confirm(`${title}: ${t(`recurrence.editScope.${scope}`)}?`))
        return Promise.resolve(scope);
    }
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      undefined,
      [
        ...(['this', 'following', 'all'] as const).map((scope) => ({
          text: t(`recurrence.editScope.${scope}`),
          onPress: () => {
            resolve(scope);
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
          onPress: () => {
            resolve(null);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(null);
        },
      },
    );
  });
}

/** Create or edit an event; recurring events ask whether to change this, following or all occurrences. */
export function EventForm({
  event,
  occurrenceStart,
  initialDate,
}: {
  event?: Event;
  occurrenceStart?: string;
  initialDate?: string;
}) {
  const { t } = useTranslation();
  const { householdId, household, can } = useHousehold();
  const members = useMembers();
  const calendars = useCalendars();
  const queryClient = useQueryClient();
  const initial = initialTimes(event, occurrenceStart, initialDate);
  const originalRule = event?.rrule ?? null;
  const originalChoice = rruleToPreset(originalRule);

  const [calendarId, setCalendarId] = useState<string | null>(event?.calendarId ?? null);
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState<Date>(initial.start);
  const [end, setEnd] = useState<Date>(initial.end);
  const [choice, setChoice] = useState<RecurrenceChoice>(originalChoice);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [attendees, setAttendees] = useState<string[]>(event?.attendeeMemberIds ?? []);
  const [reminders, setReminders] = useState<string[]>((event?.reminders ?? []).map(String));
  const [error, setError] = useState<string | null>(null);
  // Subscribed (ICS) calendars are read-only: no new events there, and their events cannot be edited.
  const writableCalendars = (calendars.data ?? []).filter((c) => !c.readOnly);
  const eventCalendar = event ? calendars.data?.find((c) => c.id === event.calendarId) : undefined;
  const readOnly = eventCalendar?.readOnly === true;
  const effectiveCalendarId = calendarId ?? writableCalendars[0]?.id ?? null;
  const editable = can('calendar.write') && !readOnly;
  const occurrenceParam = occurrenceStart && originalRule ? occurrenceStart : undefined;

  function times(): { start: string; end: string } {
    if (allDay) {
      const first = dayKey(start);
      const last = end >= start ? dayKey(end) : first;
      return { start: allDayIso(first), end: allDayEndIso(last) };
    }
    if (end < start) throw new FormError(t('m.calendar.endBeforeStart'));
    return { start: start.toISOString(), end: end.toISOString() };
  }

  function rrule(): string | null {
    if (choice === originalChoice) return originalRule;
    if (choice === 'custom') return originalRule;
    return presetToRRule(choice);
  }

  async function ensureCalendar(): Promise<string> {
    if (effectiveCalendarId) return effectiveCalendarId;
    const created = await api.calendar.createCalendar({
      params: { householdId },
      body: { name: t('m.calendar.defaultCalendarName'), color: MEMBER_COLORS[5] },
    });
    return created.id;
  }

  const save = useMutation({
    mutationFn: async (scope: Scope) => {
      const tm = times();
      const common = {
        title: title.trim(),
        description: description.trim() === '' ? null : description.trim(),
        location: location.trim() === '' ? null : location.trim(),
        allDay,
        rrule: rrule(),
        attendeeMemberIds: attendees,
        reminders: reminders.map(Number),
      };
      if (!event) {
        return api.calendar.createEvent({
          params: { householdId },
          body: {
            ...common,
            ...tm,
            calendarId: await ensureCalendar(),
            timezone: household.timezone,
          },
        });
      }
      const initialIso =
        allDay === event.allDay
          ? (() => {
              const i = initialTimes(event, occurrenceStart, undefined);
              return allDay
                ? { start: allDayIso(dayKey(i.start)), end: allDayEndIso(dayKey(i.end)) }
                : { start: i.start.toISOString(), end: i.end.toISOString() };
            })()
          : null;
      let timeChange: { start?: string; end?: string } = {};
      if (!initialIso) timeChange = tm;
      else if (initialIso.start !== tm.start || initialIso.end !== tm.end) {
        if (scope === 'all') {
          // Shift the whole series by the same delta the user applied to this occurrence.
          const ds = new Date(tm.start).getTime() - new Date(initialIso.start).getTime();
          const de = new Date(tm.end).getTime() - new Date(initialIso.end).getTime();
          timeChange = {
            start: new Date(new Date(event.start).getTime() + ds).toISOString(),
            end: new Date(new Date(event.end).getTime() + de).toISOString(),
          };
        } else timeChange = tm;
      }
      return api.calendar.updateEvent({
        params: { householdId, eventId: event.id },
        body: {
          ...common,
          ...timeChange,
          ...(effectiveCalendarId && effectiveCalendarId !== event.calendarId
            ? { calendarId: effectiveCalendarId }
            : {}),
          scope,
          ...(occurrenceParam ? { occurrenceStart: occurrenceParam } : {}),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const remove = useMutation({
    mutationFn: (scope: Scope) =>
      api.calendar.deleteEvent({
        params: { householdId, eventId: event?.id ?? '' },
        query: { scope, ...(occurrenceParam ? { occurrenceStart: occurrenceParam } : {}) },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      router.back();
    },
    onError: (e) => {
      setError(errorMessage(e, t));
    },
  });

  const onSave = async () => {
    setError(null);
    const scope =
      event && originalRule && occurrenceParam
        ? await askScope(t, t('m.calendar.saveScope'))
        : 'all';
    if (scope) save.mutate(scope);
  };

  const onDelete = async () => {
    if (!event) return;
    if (originalRule && occurrenceParam) {
      const scope = await askScope(t, t('m.calendar.deleteScope'));
      if (scope) remove.mutate(scope);
      return;
    }
    void confirmAsync(t('m.calendar.deleteTitle'), event.title, {
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) remove.mutate('all');
    });
  };

  const recurrenceOptions = [
    ...RECURRENCE_PRESETS.map((p) => ({ value: p, label: t(`m.recurrence.${p}`) })),
    ...(originalChoice === 'custom'
      ? [{ value: 'custom' as const, label: t('m.recurrence.custom') }]
      : []),
  ];
  const reminderLabel = (m: string) =>
    m === '0' ? t('m.calendar.reminderAtStart') : t(`m.calendar.reminder${m}`);

  return (
    <ScreenScroll>
      <TextField
        label={t('m.calendar.title')}
        value={title}
        onChangeText={setTitle}
        autoFocus={!event}
        editable={editable}
      />
      {readOnly ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {t('m.calendar.readOnlyHint', { name: eventCalendar.name })}
        </Text>
      ) : null}
      {editable && writableCalendars.length > 1 ? (
        <ChipSelect
          label={t('nav.calendar')}
          options={writableCalendars.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
          value={effectiveCalendarId}
          onChange={setCalendarId}
          scroll
        />
      ) : null}
      <Card className="p-0">
        <SwitchRow title={t('m.calendar.allDay')} value={allDay} onValueChange={setAllDay} />
      </Card>
      <DateField
        label={t('m.calendar.start')}
        value={start}
        mode={allDay ? 'date' : 'datetime'}
        onChange={(d) => {
          if (!d) return;
          // Keep the duration when the start moves.
          const duration = end.getTime() - start.getTime();
          setStart(d);
          setEnd(new Date(d.getTime() + Math.max(0, duration)));
        }}
      />
      <DateField
        label={allDay ? t('m.calendar.lastDay') : t('m.calendar.end')}
        value={end}
        mode={allDay ? 'date' : 'datetime'}
        onChange={(d) => {
          if (d) setEnd(d);
        }}
      />
      <ChipSelect
        label={t('m.calendar.repeat')}
        options={recurrenceOptions}
        value={choice}
        onChange={setChoice}
      />
      <TextField label={t('m.calendar.location')} value={location} onChangeText={setLocation} />
      <ChipMultiSelect
        label={t('m.calendar.attendees')}
        options={members.map((m) => ({ value: m.id, label: m.displayName, color: m.color }))}
        value={attendees}
        onChange={setAttendees}
      />
      <ChipMultiSelect
        label={t('m.calendar.reminders')}
        options={REMINDER_MINUTES.map((m) => ({ value: m, label: reminderLabel(m) }))}
        value={reminders}
        onChange={(v) => {
          setReminders(v.slice(0, 5));
        }}
      />
      <TextField
        label={t('m.calendar.description')}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      {error ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {editable ? (
        <View className="gap-2">
          <Button
            title={t('common.save')}
            disabled={title.trim() === ''}
            loading={save.isPending}
            onPress={() => void onSave()}
          />
          {event ? (
            <Button
              variant="ghost"
              title={t('common.delete')}
              loading={remove.isPending}
              onPress={() => void onDelete()}
            />
          ) : null}
        </View>
      ) : null}
    </ScreenScroll>
  );
}
