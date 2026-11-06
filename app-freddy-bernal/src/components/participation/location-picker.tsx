'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { LocateFixed, MapPinned, Trash2 } from 'lucide-react';
import { Btn, FieldError, Notice } from './kit';
import type { Point } from './form-core';

// Leaflet and its tiles come only after the tap (design §2: near-zero JavaScript until it is needed).
const MapPicker = dynamic(() => import('./map-picker'), {
  ssr: false,
  loading: () => <p className="rounded-2xl border border-border bg-surface-2 p-6 text-center text-[15px] text-text-2">Cargando el mapa…</p>,
});

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * The exact place, only if the person wants (design §4): «Usar mi ubicación» (the browser asks for its own permission)
 * or a pin on the map. Tapping either is the explicit consent; «Quitar ubicación» takes it back. The team sees the
 * point; it is never public.
 */
export function LocationPicker({ point, onChange, error }: { point: Point | null; onChange: (p: Point | null) => void; error?: string }) {
  const [geo, setGeo] = useState<'idle' | 'asking' | 'denied' | 'failed'>('idle');
  const [showMap, setShowMap] = useState(false);

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setGeo('failed');
      return;
    }
    setGeo('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo('idle');
        onChange({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <fieldset id="f-point" tabIndex={-1} className="flex flex-col gap-3 outline-none" aria-describedby={error ? 'f-locationConsent-error' : 'f-point-hint'}>
      <legend className="text-base font-semibold text-text">
        Ubicación exacta <span className="font-normal text-text-2">(opcional)</span>
      </legend>
      <p id="f-point-hint" className="-mt-1 text-[15px] leading-snug text-text-2">
        Solo si tú quieres: al tocar un botón das tu permiso para guardar el punto con tu solicitud. Lo ve solo el equipo que la atiende.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Btn id="f-locationConsent" tone="soft" size="sm" onClick={locateMe} disabled={geo === 'asking'}>
          <LocateFixed className="h-5 w-5" aria-hidden />
          {geo === 'asking' ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
        </Btn>
        <Btn tone="soft" size="sm" onClick={() => setShowMap((s) => !s)} aria-expanded={showMap}>
          <MapPinned className="h-5 w-5" aria-hidden />
          {showMap ? 'Ocultar el mapa' : 'Marcar en el mapa'}
        </Btn>
      </div>
      <div aria-live="polite">
        {geo === 'denied' ? (
          <Notice tone="info">No diste permiso para usar tu ubicación. Puedes marcar el punto en el mapa o seguir sin él.</Notice>
        ) : geo === 'failed' ? (
          <Notice tone="info">No pudimos leer tu ubicación. Puedes marcar el punto en el mapa o seguir sin él.</Notice>
        ) : null}
        {point ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-[15px] text-text">
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">Punto guardado con tu permiso.</strong>{' '}
              <span className="tabular">
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </span>
            </span>
            <Btn tone="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Quitar ubicación
            </Btn>
          </div>
        ) : null}
      </div>
      {showMap ? <MapPicker point={point} onPick={(p) => onChange(p)} /> : null}
      {error ? <FieldError id="f-locationConsent-error">{error}</FieldError> : null}
    </fieldset>
  );
}
