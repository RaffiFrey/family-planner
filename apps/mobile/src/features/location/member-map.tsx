import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useColors } from '@/lib/theme';
import type { MemberMapProps } from './map-types';
import { regionFor } from './share';

/** Native map of shared member positions and places (geofence circles). */
export function MemberMap({ members, places, onPlacePress }: MemberMapProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const region = regionFor([...members, ...places]);
  if (!region) return null;
  return (
    <View
      className="h-72 overflow-hidden rounded-lg border border-border"
      accessibilityLabel={t('m.location.mapLabel', { count: members.length })}
    >
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation={false}>
        {places.map((p) => (
          <Circle
            key={`c-${p.id}`}
            center={{ latitude: p.lat, longitude: p.lng }}
            radius={p.radiusM}
            strokeColor={colors.primary}
            fillColor="rgba(29, 94, 241, 0.12)"
          />
        ))}
        {places.map((p) => (
          <Marker
            key={`p-${p.id}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.name}
            pinColor={colors.primary}
            onCalloutPress={() => onPlacePress?.(p)}
          />
        ))}
        {members.map((m) => (
          <Marker
            key={m.memberId}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.name}
            pinColor={m.color}
          />
        ))}
      </MapView>
    </View>
  );
}
