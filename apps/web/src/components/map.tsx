import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

/**
 * OpenStreetMap tiles with attribution, used within the OSM tile usage policy for a low-traffic
 * demo (ARCHITECTURE §7). Production needs a licensed tile provider.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; مساهمو <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const SAUDI_CENTER: [number, number] = [23.8, 44.5];

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind?: 'mine' | 'factory' | 'carrier';
}

const COLORS = { mine: '#B8734F', factory: '#4A6F8A', carrier: '#25292B' };

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 8);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export function MapView({ points, height = 320, line }: { points: MapPoint[]; height?: number; line?: boolean }) {
  return (
    <div style={{ height }} className="overflow-hidden rounded-card border border-line">
      <MapContainer center={SAUDI_CENTER} zoom={5} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitBounds points={points} />
        {line && points.length >= 2 && <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#B8734F', dashArray: '6 6', weight: 2 }} />}
        {points.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: '#F7F6F1', weight: 2, fillColor: COLORS[p.kind ?? 'mine'], fillOpacity: 1 }}>
            <Tooltip>{p.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

/** Map + synced lat/lng fields (SCR-MINE-02): click the map or type coordinates. */
export function LocationPicker({ lat, lng, onChange, disabled }: { lat: number | ''; lng: number | ''; onChange: (lat: number, lng: number) => void; disabled?: boolean }) {
  const has = lat !== '' && lng !== '';
  const pts: MapPoint[] = has ? [{ id: 'p', lat: Number(lat), lng: Number(lng), label: 'الموقع المختار' }] : [];
  return (
    <div className="space-y-2">
      <div style={{ height: 260 }} className="overflow-hidden rounded-card border border-line">
        <MapContainer center={has ? [Number(lat), Number(lng)] : SAUDI_CENTER} zoom={has ? 8 : 5} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
          {!disabled && <ClickHandler onPick={onChange} />}
          {pts.map((p) => (
            <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: '#F7F6F1', weight: 2, fillColor: '#B8734F', fillOpacity: 1 }} />
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-muted">{disabled ? 'تعديل الموقع غير متاح.' : 'انقر على الخريطة لتحديد الموقع، أو أدخل الإحداثيات.'}</p>
    </div>
  );
}
