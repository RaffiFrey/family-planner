import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useColors } from '@/lib/theme';
import { type LatLng, regionFor } from './share';

/** Native map of a member's route over the last 24 hours. */
export function HistoryMap({ points, color }: { points: readonly LatLng[]; color: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const region = regionFor(points);
  const last = points.at(-1);
  if (!region || !last) return null;
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return (
    <View
      className="h-72 overflow-hidden rounded-lg border border-border"
      accessibilityLabel={t('m.location.historyMapLabel', { count: points.length })}
    >
      <MapView style={{ flex: 1 }} initialRegion={region}>
        <Polyline coordinates={coords} strokeColor={color} strokeWidth={4} />
        <Marker
          coordinate={{ latitude: last.lat, longitude: last.lng }}
          pinColor={color || colors.primary}
          title={t('m.location.lastPosition')}
        />
      </MapView>
    </View>
  );
}
