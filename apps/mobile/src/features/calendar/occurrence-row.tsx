import type { Calendar, Occurrence } from '@fp/contracts';
import { router } from 'expo-router';
import { MapPin, Repeat } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { useIntlLocale } from '@/i18n';
import { useColors } from '@/lib/theme';

export function OccurrenceRow({
  occurrence,
  calendar,
}: {
  occurrence: Occurrence;
  calendar: Calendar | undefined;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const locale = useIntlLocale();
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const time = occurrence.allDay
    ? t('m.calendar.allDay')
    : `${timeFmt.format(new Date(occurrence.start))} - ${timeFmt.format(new Date(occurrence.end))}`;
  const color = occurrence.color ?? calendar?.color ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${occurrence.title}, ${time}${occurrence.location ? `, ${occurrence.location}` : ''}`}
      onPress={() => {
        router.push({
          pathname: '/events/[eventId]',
          params: { eventId: occurrence.eventId, occurrenceStart: occurrence.originalStart },
        });
      }}
      className="min-h-14 flex-row items-stretch gap-3 px-4 py-2 active:bg-surface-muted"
    >
      <View className="w-1 rounded-full" style={{ backgroundColor: color }} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{occurrence.title}</Text>
        <View className="flex-row items-center gap-2">
          <Text variant="caption">{time}</Text>
          {occurrence.rrule ? <Repeat size={12} color={colors.textMuted} /> : null}
        </View>
        {occurrence.location ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color={colors.textMuted} />
            <Text variant="caption" numberOfLines={1}>
              {occurrence.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
