'use client';

import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { GeoPoint } from '@/lib/shared/types';

/** Claimed place and resolved scene location on OpenStreetMap tiles. */
export default function LocationMap({ claim, scene }: { claim?: GeoPoint; scene?: GeoPoint }) {
  const points = [claim, scene].filter((p): p is GeoPoint => !!p);
  const bounds = points.map((p) => [p.lat, p.lng] as [number, number]);
  const single = bounds.length === 1;

  return (
    <div className="space-y-2">
      <MapContainer
        {...(single ? { center: bounds[0], zoom: claim?.scale === 'country' ? 4 : 9 } : { bounds, boundsOptions: { padding: [40, 40] } })}
        scrollWheelZoom={false}
        className="h-64 w-full rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {claim && (
          <CircleMarker center={[claim.lat, claim.lng]} radius={9} pathOptions={{ color: '#1f5fa8', fillOpacity: 0.6 }}>
            <Tooltip permanent direction="top">
              Claimed: {claim.label}
            </Tooltip>
          </CircleMarker>
        )}
        {scene && (
          <CircleMarker center={[scene.lat, scene.lng]} radius={9} pathOptions={{ color: '#b42318', fillOpacity: 0.6 }}>
            <Tooltip permanent direction="bottom">
              Scene: {scene.label}
            </Tooltip>
          </CircleMarker>
        )}
        {claim && scene && <Polyline positions={bounds} pathOptions={{ color: '#6b675e', dashArray: '6 6' }} />}
      </MapContainer>
      <p className="text-xs text-muted">Places resolved with Google Maps through SerpApi.</p>
    </div>
  );
}
