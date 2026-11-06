'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Point } from './attention-map';

const AttentionMap = dynamic(() => import('./attention-map'), {
  ssr: false,
  loading: () => <p className="p-4 text-[15px] text-text-2" role="status">Cargando el mapa…</p>,
});

// Leaflet and the map's tiles load only when someone taps the button (design §5: «loaded on demand»): the page itself
// is light, and nothing goes to OpenStreetMap until then.
export function MapLoader({ points }: { points: Point[] }) {
  const [show, setShow] = useState(false);
  if (!points.length) return <p className="p-4 text-[15px] text-text-2">Ningún caso de estos tiene un punto marcado con permiso.</p>;
  return show ? (
    <div className="relative isolate overflow-hidden rounded-[var(--radius-control)] border border-border">
      <AttentionMap points={points} />
    </div>
  ) : (
    <div className="flex flex-col items-start gap-2 p-4">
      <p className="text-[15px] text-text-2">
        {points.length === 1 ? '1 caso tiene' : `${points.length} casos tienen`} el punto marcado con permiso de la persona. El mapa se carga al tocar el botón (usa los mapas de
        OpenStreetMap).
      </p>
      <Button type="button" variant="secondary" onClick={() => setShow(true)}>
        <MapIcon className="h-4 w-4" aria-hidden /> Ver el mapa
      </Button>
    </div>
  );
}
