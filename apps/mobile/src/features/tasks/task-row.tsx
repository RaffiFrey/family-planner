import type { Task } from '@fp/contracts';
import { formatRelativeDays } from '@fp/i18n';
import { differenceInCalendarDays } from 'date-fns';
import { router } from 'expo-router';
import { Check, Repeat, SkipForward, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Avatar, Text } from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { useIntlLocale, useLocale } from '@/i18n';
import { confirmAsync, showError } from '@/lib/dialogs';
import { useColors } from '@/lib/theme';
import { useCompleteTask, useReopenTask } from './hooks';

export function dueLabel(
  dueAt: string,
  now: Date,
  locale: 'de' | 'en',
  intlLocale: string,
): string {
  const due = new Date(dueAt);
  const days = differenceInCalendarDays(due, now);
  const time = new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit' }).format(
    due,
  );
  const showTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  const day =
    Math.abs(days) <= 2
      ? formatRelativeDays(days, locale)
      : new Intl.DateTimeFormat(intlLocale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(due);
  return showTime ? `${day}, ${time}` : day;
}

/** A task with a large check target; completing animates it out of the list (no haptics). */
export function TaskRow({ task, now }: { task: Task; now: Date }) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useLocale();
  const intlLocale = useIntlLocale();
  const members = useMemberMap();
  const { can } = useHousehold();
  const complete = useCompleteTask();
  const reopen = useReopenTask();
  const assignee = task.assigneeMemberId ? members.get(task.assigneeMemberId) : undefined;
  const done = task.status !== 'open';
  const overdue = !done && task.dueAt !== null && new Date(task.dueAt) < now;
  const canComplete = can('tasks.complete');

  const onToggle = () => {
    if (done) {
      reopen.mutate(task.id);
      return;
    }
    complete.mutate(
      { task, skip: false },
      {
        onError: (e) => {
          showError(e, t);
        },
      },
    );
  };
  const onSkip = () => {
    if (done || !task.recurrence) return;
    void confirmAsync(t('m.tasks.skipTitle'), t('m.tasks.skipMessage', { title: task.title }), {
      confirmLabel: t('m.tasks.skip'),
      cancelLabel: t('common.cancel'),
    }).then((ok) => {
      if (ok) complete.mutate({ task, skip: true });
    });
  };

  const subtitle = [
    task.dueAt ? dueLabel(task.dueAt, now, locale, intlLocale) : null,
    task.checklist.length > 0
      ? `${task.checklist.filter((c) => c.done).length}/${task.checklist.length}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
      <View className="min-h-16 flex-row items-center gap-3 px-4 py-2">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: !canComplete }}
          accessibilityLabel={
            done
              ? t('m.tasks.reopenLabel', { title: task.title })
              : t('m.tasks.completeLabel', { title: task.title })
          }
          disabled={!canComplete}
          hitSlop={10}
          onPress={onToggle}
          className={`h-8 w-8 items-center justify-center rounded-full border-2 ${done ? 'border-success bg-success' : 'border-border'}`}
        >
          {done ? <Check size={18} color="#ffffff" /> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={task.recurrence ? t('m.tasks.longPressSkip') : undefined}
          className="flex-1 gap-0.5"
          onPress={() => {
            router.push({ pathname: '/tasks/[taskId]', params: { taskId: task.id } });
          }}
          onLongPress={onSkip}
        >
          <Text numberOfLines={2} className={done ? 'text-muted line-through' : ''}>
            {task.title}
          </Text>
          {subtitle ? (
            <Text variant="caption" className={overdue ? 'text-danger' : ''}>
              {subtitle}
            </Text>
          ) : null}
        </Pressable>
        {task.recurrence ? (
          <Repeat size={16} color={colors.textMuted} accessibilityLabel={t('m.tasks.recurring')} />
        ) : null}
        {task.points > 0 ? (
          <View
            className="flex-row items-center gap-0.5"
            accessible
            accessibilityLabel={t('m.tasks.pointsLabel', { count: task.points })}
          >
            <Star size={14} color={colors.warning} />
            <Text variant="caption">{task.points}</Text>
          </View>
        ) : null}
        {task.recurrence && !done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('m.tasks.skip')}
            hitSlop={8}
            onPress={onSkip}
          >
            <SkipForward size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {assignee ? <Avatar name={assignee.displayName} color={assignee.color} size={28} /> : null}
      </View>
    </Animated.View>
  );
}
