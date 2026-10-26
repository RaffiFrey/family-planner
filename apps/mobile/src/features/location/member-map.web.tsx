import { MapPin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import type { MemberMapProps } from './map-types';

/** Web build: react-native-maps is native-only, so the member/place lists below stand in for the map. */
export function MemberMap({ members, places }: MemberMapProps) {
  const { t } = useTranslation();
  const colors = useColors();
  if (members.length === 0 && places.length === 0) return null;
  return (
    <View
      className="flex-row items-center gap-3 rounded-lg border border-border bg-surface-muted p-4"
      testID="location-map-fallback"
    >
      <MapPin size={20} color={colors.textMuted} />
      <Text variant="caption" className="flex-1">
        {t('m.location.mapWebFallback')}
      </Text>
    </View>
  );
}
