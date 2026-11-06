'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { REQUEST_STATE_LABEL, type RequestState } from '@/lib/domain/attention';

// The cases' map (design §5): Leaflet with OpenStreetMap's tiles, loaded only when someone taps «Ver el mapa»
// (map-loader.tsx imports this file on demand). Only cases whose person consented to the point, and never a denuncia
// (the database never stores one for them). Simple clustering: at each zoom, the points that fall in the same 56 px
// square of the screen are one circle with their count; a tap on it zooms in; a single point opens a short card with
// the code and a link to the case. The list under the map has the same cases for the keyboard and screen readers.

export type Point = { id: string; reference: string; lat: number; lng: number; state: RequestState; categoryName: string };

const TACHIRA: L.LatLngTuple = [7.77, -72.22];
const CELL = 56;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function bubble(count: number): L.DivIcon {
  const size = count < 10 ? 34 : count < 100 ? 40 : 46;
  return L.divIcon({
    className: 'atencion-grupo',
    html: `<span class="grid place-items-center rounded-full border-2 border-surface bg-accent text-sm font-bold text-on-accent shadow-[var(--glass-shadow)]" style="width:${size}px;height:${size}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const PIN = L.divIcon({
  className: 'atencion-punto',
  html: '<span class="block h-6 w-6 -translate-x-1/2 -translate-y-full rotate-45 rounded-full rounded-br-none border-[3px] border-surface bg-action shadow-[var(--glass-shadow)]"></span>',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export default function AttentionMap({ points }: { points: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { center: TACHIRA, zoom: 9, keyboard: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.getContainer().setAttribute('aria-label', 'Mapa de las solicitudes con ubicación. Muévelo con las flechas; + y − para acercar. La lista de abajo tiene los mismos casos.');
    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      const zoom = map.getZoom();
      const cells = new Map<string, Point[]>();
      for (const p of points) {
        const px = map.project([p.lat, p.lng], zoom);
        const key = `${Math.floor(px.x / CELL)}:${Math.floor(px.y / CELL)}`;
        cells.set(key, [...(cells.get(key) ?? []), p]);
      }
      for (const group of cells.values()) {
        if (group.length === 1) {
          const p = group[0];
          L.marker([p.lat, p.lng], { icon: PIN, title: p.reference, keyboard: true })
            .bindPopup(
              `<p style="margin:0"><b>${esc(p.reference)}</b></p><p style="margin:2px 0">${esc(p.categoryName)} · ${esc(REQUEST_STATE_LABEL[p.state])}</p><a href="/admin/atencion/${esc(p.id)}">Abrir el caso</a>`,
            )
            .addTo(layer);
        } else {
          const lat = group.reduce((n, p) => n + p.lat, 0) / group.length;
          const lng = group.reduce((n, p) => n + p.lng, 0) / group.length;
          L.marker([lat, lng], { icon: bubble(group.length), title: `${group.length} casos aquí: acercar`, keyboard: true })
            .on('click', () => map.setView([lat, lng], Math.min(zoom + 2, 18)))
            .addTo(layer);
        }
      }
    };
    if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)).pad(0.2), { maxZoom: 15 });
    draw();
    map.on('zoomend', draw);
    return () => {
      map.remove();
    };
  }, [points]);
  return <div ref={box} className="h-80 w-full sm:h-[28rem]" />;
}
