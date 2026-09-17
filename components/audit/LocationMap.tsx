'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { GeoPoint } from '@/lib/shared/types';

const pin = (color: string) =>
  L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="position:relative;display:block;width:22px;height:22px">
      <span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.35;animation:pulse-ring 1.8s cubic-bezier(.2,.6,.3,1) infinite"></span>
      <span style="position:absolute;inset:5px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px #ffffff"></span>
    </span>`,
  });

/** Claimed place and resolved scene on greyscale tiles, joined by a flowing dashed line. */
export default function LocationMap({ claim, scene, distanceKm }: { claim?: GeoPoint; scene?: GeoPoint; distanceKm?: number }) {
  const points = [claim, scene].filter((p): p is GeoPoint => !!p);
  const bounds = points.map((p) => [p.lat, p.lng] as [number, number]);
  const single = bounds.length === 1;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      <MapContainer
        {...(single ? { center: bounds[0], zoom: claim?.scale === 'country' ? 4 : 9 } : { bounds, boundsOptions: { padding: [50, 50] } })}
        scrollWheelZoom={false}
        attributionControl
        className="h-72 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark-tiles"
        />
        {claim && scene && (
          <Polyline positions={bounds} pathOptions={{ color: '#171717', weight: 2, dashArray: '8 8', className: 'dash-flow', opacity: 0.8 }} />
        )}
        {claim && (
          <Marker position={[claim.lat, claim.lng]} icon={pin('#525252')}>
            <Tooltip permanent direction="top" offset={[0, -12]}>
              Claimed · {claim.label}
            </Tooltip>
          </Marker>
        )}
        {scene && (
          <Marker position={[scene.lat, scene.lng]} icon={pin('#b42318')}>
            <Tooltip permanent direction="bottom" offset={[0, 12]}>
              Scene · {scene.label}
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
      {distanceKm !== undefined && (
        <div className="pointer-events-none absolute top-3 right-3 z-[500] rounded-lg border border-line-strong bg-bg/85 px-3 py-1.5 font-mono text-xs text-ink">
          Δ {distanceKm.toLocaleString()} km
        </div>
      )}
    </div>
  );
}
