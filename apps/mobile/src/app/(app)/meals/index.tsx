import { addWeeks, isSameDay } from 'date-fns';
import { router, Stack } from 'expo-router';
import { BookOpen, ChevronLeft, ChevronRight, Plus, ShoppingCart } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ModuleGate } from '@/components/gates';
import { Button, ErrorState, IconButton, LoadingView, Text } from '@/components/ui';
import { useHousehold, useMemberMap } from '@/features/household/household';
import { useMealPlan } from '@/features/meals/hooks';
import { isoWeek, SLOTS, toLocalDate, weekDays } from '@/features/meals/utils';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

export default function MealPlanScreen() {
  return (
    <ModuleGate action="meals.read">
      <MealPlan />
    </ModuleGate>
  );
}

function MealPlan() {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const { can } = useHousehold();
  const members = useMemberMap();
  const [anchor, setAnchor] = useState(() => new Date());
  const days = weekDays(anchor);
  const from = toLocalDate(days[0] ?? anchor);
  const to = toLocalDate(days[6] ?? anchor);
  const plan = useMealPlan(from, to);
  const writable = can('meals.write');
  const today = new Date();
  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const rangeFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label={t('m.meals.recipes')}
              onPress={() => {
                router.push('/meals/recipes');
              }}
            >
              <BookOpen size={22} color={colors.text} />
            </IconButton>
          ),
        }}
      />
      <View className="flex-row items-center justify-between border-b border-border px-2 py-1">
        <IconButton
          label={t('m.meals.previousWeek')}
          onPress={() => {
            setAnchor((a) => addWeeks(a, -1));
          }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('m.meals.thisWeek')}
          onPress={() => {
            setAnchor(new Date());
          }}
          className="items-center"
        >
          <Text variant="subheading">{t('m.meals.week', { week: isoWeek(anchor) })}</Text>
          <Text variant="caption">
            {rangeFmt.format(days[0] ?? anchor)} – {rangeFmt.format(days[6] ?? anchor)}
          </Text>
        </Pressable>
        <IconButton
          label={t('m.meals.nextWeek')}
          onPress={() => {
            setAnchor((a) => addWeeks(a, 1));
          }}
        >
          <ChevronRight size={22} color={colors.text} />
        </IconButton>
      </View>
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-12"
        refreshControl={
          <RefreshControl refreshing={plan.isRefetching} onRefresh={() => void plan.refetch()} />
        }
      >
        {plan.isPending ? (
          <LoadingView />
        ) : plan.error && !plan.data ? (
          <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
        ) : (
          days.map((day) => {
            const date = toLocalDate(day);
            const entries = plan.data.filter((e) => e.date === date);
            const isToday = isSameDay(day, today);
            const dayLabel = dayFmt.format(day);
            return (
              <View
                key={date}
                className={`overflow-hidden rounded-lg border bg-surface ${isToday ? 'border-primary' : 'border-border'}`}
              >
                <View className="bg-surface-muted px-4 py-2">
                  <Text
                    accessibilityRole="header"
                    className={`font-semibold ${isToday ? 'text-primary' : ''}`}
                  >
                    {isToday ? `${t('common.today')} · ${dayLabel}` : dayLabel}
                  </Text>
                </View>
                {SLOTS.map((slot) => {
                  const entry = entries.find((e) => e.slot === slot);
                  const slotLabel = t(`m.meals.slots.${slot}`);
                  if (!entry && (!writable || slot === 'snack')) return null;
                  const cook = entry?.cookMemberId ? members.get(entry.cookMemberId) : undefined;
                  return (
                    <Pressable
                      key={slot}
                      disabled={!writable}
                      accessibilityRole="button"
                      accessibilityLabel={
                        entry
                          ? t('m.meals.editSlot', {
                              slot: slotLabel,
                              day: dayLabel,
                              title: entry.title,
                            })
                          : t('m.meals.planSlot', { slot: slotLabel, day: dayLabel })
                      }
                      onPress={() => {
                        router.push({ pathname: '/meals/entry', params: { date, slot } });
                      }}
                      className="min-h-12 flex-row items-center gap-3 border-t border-border px-4 py-2 active:bg-surface-muted"
                    >
                      <Text variant="caption" className="w-24">
                        {slotLabel}
                      </Text>
                      {entry ? (
                        <View className="flex-1">
                          <Text numberOfLines={2}>{entry.title}</Text>
                          {cook ? <Text variant="caption">{cook.displayName}</Text> : null}
                        </View>
                      ) : (
                        <View className="flex-1 flex-row items-center gap-1">
                          <Plus size={16} color={colors.textMuted} />
                          <Text variant="caption">{t('m.meals.emptySlot')}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
        {can('lists.write') && (plan.data?.length ?? 0) > 0 ? (
          <Button
            variant="secondary"
            icon={<ShoppingCart size={18} color={colors.text} />}
            title={t('m.meals.toShopping')}
            onPress={() => {
              router.push({ pathname: '/meals/to-shopping', params: { from, to } });
            }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
