import type { GeoPlace } from '@fp/contracts';

export interface MapMember {
  memberId: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface MemberMapProps {
  members: readonly MapMember[];
  places: readonly GeoPlace[];
  onPlacePress?: (place: GeoPlace) => void;
}
