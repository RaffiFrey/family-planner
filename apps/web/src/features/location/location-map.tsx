'use client';

import 'leaflet/dist/leaflet.css';
import * as React from 'react';
import * as RL from 'react-leaflet';

/**
 * Leaflet map (client only — imported via next/dynamic with `ssr: false`).
 * Uses CircleMarkers instead of default image markers, so no marker icon assets are needed.
 * Only a tiny typed slice of the Leaflet map API is used (see `MiniMap`).
 */

export interface MapMember {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface MapFocus {
  lat: number;
  lng: number;
  /** Changes whenever the same point should be focused again. */
  nonce: number;
}

// `@types/leaflet` is not installed, so the react-leaflet components we use are re-typed with
// the small prop surface this page needs.
type LatLng = [number, number];
interface PathOptions {
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  dashArray?: string;
}
const MapContainer = RL.MapContainer as unknown as React.ComponentType<{
  center: LatLng;
  zoom: number;
  scrollWheelZoom?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}>;
const TileLayer = RL.TileLayer as unknown as React.ComponentType<{
  url: string;
  attribution: string;
}>;
const Circle = RL.Circle as unknown as React.ComponentType<{
  center: LatLng;
  radius: number;
  pathOptions?: PathOptions;
  children?: React.ReactNode;
}>;
const CircleMarker = RL.CircleMarker as unknown as React.ComponentType<{
  center: LatLng;
  radius: number;
  pathOptions?: PathOptions;
  children?: React.ReactNode;
}>;
const Tooltip = RL.Tooltip as unknown as React.ComponentType<{
  direction?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto';
  offset?: LatLng;
  permanent?: boolean;
  children?: React.ReactNode;
}>;
const useMap = RL.useMap as unknown as () => MiniMap;
const useMapEvents = RL.useMapEvents as unknown as (handlers: {
  click?: (e: { latlng: { lat: number; lng: number } }) => void;
}) => unknown;

interface MiniMap {
  flyTo(center: [number, number], zoom?: number): void;
  fitBounds(
    bounds: [number, number][],
    options?: { padding?: [number, number]; maxZoom?: number },
  ): void;
  invalidateSize(): void;
}

interface LocationMapProps {
  members: MapMember[];
  places: MapPlace[];
  focus: MapFocus | null;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  draft: { lat: number; lng: number; radiusM: number } | null;
  ariaLabel: string;
  attribution: string;
}

const GERMANY: [number, number] = [51.16, 10.45];

function useMiniMap(): MiniMap {
  return useMap();
}

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMiniMap();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1 && points[0]) map.flyTo(points[0], 14);
    else map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function FocusOn({ focus }: { focus: MapFocus | null }) {
  const map = useMiniMap();
  React.useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 15);
  }, [map, focus]);
  return null;
}

function PickHandler({
  picking,
  onPick,
}: {
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!picking) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationMap({
  members,
  places,
  focus,
  picking,
  onPick,
  draft,
  ariaLabel,
  attribution,
}: LocationMapProps) {
  const points = React.useMemo<[number, number][]>(
    () => [
      ...members.map((m): [number, number] => [m.lat, m.lng]),
      ...places.map((p): [number, number] => [p.lat, p.lng]),
    ],
    [members, places],
  );

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={
        picking ? 'h-full w-full [&_.leaflet-container]:cursor-crosshair' : 'h-full w-full'
      }
    >
      <MapContainer
        center={GERMANY}
        zoom={6}
        scrollWheelZoom
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">${attribution}</a>`}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitOnce points={points} />
        <FocusOn focus={focus} />
        <PickHandler picking={picking} onPick={onPick} />
        {places.map((p) => (
          <Circle
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.radiusM}
            pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.12, weight: 2 }}
          >
            <Tooltip direction="top">{p.name}</Tooltip>
          </Circle>
        ))}
        {draft ? (
          <Circle
            center={[draft.lat, draft.lng]}
            radius={draft.radiusM}
            pathOptions={{ color: '#1d5ef1', dashArray: '6 4', fillOpacity: 0.1, weight: 2 }}
          />
        ) : null}
        {members.map((m) => (
          <React.Fragment key={m.id}>
            {m.accuracyM > 25 ? (
              <Circle
                center={[m.lat, m.lng]}
                radius={m.accuracyM}
                pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.08, weight: 1 }}
              />
            ) : null}
            <CircleMarker
              center={[m.lat, m.lng]}
              radius={10}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: m.color, fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]} permanent>
                {m.name}
              </Tooltip>
            </CircleMarker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
