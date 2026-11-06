'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import { Btn } from './kit';
import type { Point } from './form-core';

// The pin map of «¿Dónde?» (design §4): Leaflet with OpenStreetMap's tiles, loaded only when the person taps «Marcar en
// el mapa» (location-picker.tsx imports this file on demand), never for a denuncia. Tap or click to put the pin, drag it
// to adjust. With the keyboard: the map takes the focus, the arrows move it, + and − zoom, and «Marcar el centro del
// mapa» puts the pin under the cross in the middle. The point is rounded to about a meter (the database keeps 5
// decimals). The pin is drawn with the site's tokens (no image files).

const TACHIRA: L.LatLngTuple = [7.77, -72.22];
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const toPoint = (ll: L.LatLng): Point => ({ lat: round(ll.lat), lng: round(ll.lng) });

const PIN = L.divIcon({
  className: 'atencion-pin',
  html: '<span class="block h-7 w-7 -translate-x-1/2 -translate-y-full rounded-full rounded-br-none rotate-45 border-[3px] border-surface bg-action shadow-[var(--glass-shadow)]"></span>',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export default function MapPicker({ point, onPick }: { point: Point | null; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { center: point ? [point.lat, point.lng] : TACHIRA, zoom: point ? 17 : 9, keyboard: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.getContainer().setAttribute('aria-label', 'Mapa para marcar el lugar. Toca el mapa para poner el punto, o muévelo con las flechas y usa «Marcar el centro del mapa».');
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(toPoint(e.latlng)));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is made once; the point is followed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!point) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const at: L.LatLngTuple = [point.lat, point.lng];
    if (!marker.current) {
      marker.current = L.marker(at, { icon: PIN, draggable: true, keyboard: false, title: 'El punto marcado' }).addTo(m);
      marker.current.on('dragend', () => marker.current && pick.current(toPoint(marker.current.getLatLng())));
    } else marker.current.setLatLng(at);
    if (!m.getBounds().contains(at)) m.setView(at, Math.max(m.getZoom(), 16));
  }, [point]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative isolate overflow-hidden rounded-2xl border border-border">
        <div ref={box} className="h-72 w-full sm:h-96" />
        <Crosshair className="pointer-events-none absolute left-1/2 top-1/2 z-[500] h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-text" aria-hidden />
      </div>
      <Btn tone="soft" size="sm" onClick={() => map.current && pick.current(toPoint(map.current.getCenter()))}>
        Marcar el centro del mapa
      </Btn>
    </div>
  );
}
