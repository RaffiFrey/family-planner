import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, View } from 'react-native';
import { combineDayAndTime, dayKey, timeOf } from '@/features/calendar/dates';
import { useIntlLocale } from '@/i18n';
import { useColors, useThemeName } from '@/lib/theme';
import { Button, IconButton } from './button';
import { Chip } from './chips';
import { Text } from './text';
import { TextField } from './text-field';

/** Month grid used by the web date picker and the calendar (weeks start on Monday, as in DACH). */
export function MonthGrid({
  month,
  onMonthChange,
  selected,
  onSelect,
  marked,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
  selected: Date | null;
  onSelect: (d: Date) => void;
  marked?: ReadonlySet<string>;
}) {
  const colors = useColors();
  const locale = useIntlLocale();
  const { t } = useTranslation();
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  const today = new Date();
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <IconButton
          label={t('m.common.previousMonth')}
          onPress={() => {
            onMonthChange(addMonths(month, -1));
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <Text variant="subheading">
          {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
        </Text>
        <IconButton
          label={t('m.common.nextMonth')}
          onPress={() => {
            onMonthChange(addMonths(month, 1));
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      <View className="flex-row">
        {days.slice(0, 7).map((d) => (
          <Text key={d.toISOString()} variant="caption" className="flex-1 text-center">
            {weekdayFmt.format(d)}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {days.map((d) => {
          const isSelected = selected ? isSameDay(d, selected) : false;
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          return (
            <Pressable
              key={d.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={dayFmt.format(d)}
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                onSelect(d);
              }}
              className="items-center py-1"
              style={{ width: `${100 / 7}%` }}
            >
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${isSelected ? 'bg-primary' : isToday ? 'border border-primary' : ''}`}
              >
                <Text
                  maxFontSizeMultiplier={1.4}
                  className={
                    isSelected
                      ? 'font-semibold text-primary-text'
                      : inMonth
                        ? 'text-text'
                        : 'text-muted'
                  }
                >
                  {d.getDate()}
                </Text>
              </View>
              {marked?.has(dayKey(d)) ? (
                <View className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** `date` only picks a day; `datetime` also asks for HH:mm. */
  mode?: 'date' | 'datetime';
  clearable?: boolean;
  error?: string | undefined;
  minimumDate?: Date;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Default when nothing is picked yet: today, at 09:00 for date-times. */
function initialValue(value: Date | null, mode: 'date' | 'datetime'): Date {
  if (value) return value;
  const d = new Date();
  if (mode === 'datetime') d.setHours(9, 0, 0, 0);
  return d;
}

/** Android: the system date dialog, followed by the time dialog for date-times. */
function openAndroidPicker(
  value: Date,
  mode: 'date' | 'datetime',
  minimumDate: Date | undefined,
  onPicked: (d: Date) => void,
): void {
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    firstDayOfWeek: 1,
    ...(minimumDate ? { minimumDate } : {}),
    onValueChange: (_e, day) => {
      if (mode === 'date') {
        onPicked(startOfDay(day));
        return;
      }
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        onValueChange: (_t, time) => {
          const combined = new Date(day);
          combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
          onPicked(combined);
        },
      });
    },
  });
}

/**
 * Date (and optional time) input. Uses the platform pickers (Android system dialogs, iOS inline
 * calendar in a sheet); on web, where no native picker exists, a month grid plus a time field.
 */
export function DateField({
  label,
  value,
  onChange,
  mode = 'date',
  clearable,
  error,
  minimumDate,
}: DateFieldProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const [open, setOpen] = useState(false);

  const display = value
    ? new Intl.DateTimeFormat(
        locale,
        mode === 'datetime' ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
      ).format(value)
    : t('m.common.noDate');

  const openPicker = () => {
    if (Platform.OS === 'android') {
      openAndroidPicker(initialValue(value, mode), mode, minimumDate, onChange);
      return;
    }
    setOpen(true);
  };

  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display}`}
          onPress={openPicker}
          className={`min-h-12 flex-1 flex-row items-center gap-2 rounded-md border bg-background px-3 ${error ? 'border-danger' : 'border-border'}`}
        >
          <CalendarDays size={18} color={colors.textMuted} />
          <Text className={value ? 'text-text' : 'text-muted'}>{display}</Text>
        </Pressable>
        {clearable && value ? (
          <IconButton
            label={t('m.common.clear')}
            onPress={() => {
              onChange(null);
            }}
          >
            <X size={20} color={colors.textMuted} />
          </IconButton>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" className="text-danger">
          {error}
        </Text>
      ) : null}
      {open ? (
        <PickerModal
          label={label}
          initial={initialValue(value, mode)}
          mode={mode}
          minimumDate={minimumDate}
          onClose={() => {
            setOpen(false);
          }}
          onConfirm={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

const QUICK_TIMES = ['08:00', '09:00', '12:00', '15:00', '18:00', '20:00'];

/** Picker sheet: native inline picker on iOS, month grid + time field on web. */
function PickerModal({
  label,
  initial,
  mode,
  minimumDate,
  onClose,
  onConfirm,
}: {
  label: string;
  initial: Date;
  mode: 'date' | 'datetime';
  minimumDate: Date | undefined;
  onClose: () => void;
  onConfirm: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const theme = useThemeName();
  const locale = useIntlLocale();
  const [draft, setDraft] = useState<Date>(initial);
  const [month, setMonth] = useState<Date>(initial);
  const [time, setTime] = useState(timeOf(initial));
  const [timeError, setTimeError] = useState<string | undefined>();
  const native = Platform.OS === 'ios';

  const confirm = () => {
    if (mode === 'date') {
      onConfirm(startOfDay(draft));
      return;
    }
    if (native) {
      onConfirm(draft);
      return;
    }
    const combined = combineDayAndTime(dayKey(draft), time);
    if (!combined) {
      setTimeError(t('m.common.invalidTime'));
      return;
    }
    onConfirm(combined);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/50 p-4">
        <View className="gap-4 rounded-lg bg-background p-4" accessibilityViewIsModal>
          <Text variant="heading">{label}</Text>
          {native ? (
            <DateTimePicker
              value={draft}
              mode={mode}
              display="inline"
              locale={locale}
              themeVariant={theme}
              accentColor={colors.primary}
              {...(minimumDate ? { minimumDate } : {})}
              onValueChange={(_e, d) => {
                setDraft(d);
              }}
            />
          ) : (
            <>
              <MonthGrid
                month={month}
                onMonthChange={setMonth}
                selected={draft}
                onSelect={setDraft}
              />
              {mode === 'datetime' ? (
                <View className="gap-2">
                  <TextField
                    label={t('m.common.time')}
                    value={time}
                    onChangeText={setTime}
                    keyboardType="numbers-and-punctuation"
                    placeholder="09:00"
                    maxLength={5}
                    error={timeError}
                  />
                  <View className="flex-row flex-wrap gap-2">
                    {QUICK_TIMES.map((q) => (
                      <Chip
                        key={q}
                        label={q}
                        selected={q === time}
                        onPress={() => {
                          setTime(q);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              title={t('common.cancel')}
              onPress={onClose}
            />
            <Button className="flex-1" title={t('common.confirm')} onPress={confirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
