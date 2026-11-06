'use client';

import { useId } from 'react';

// The focal point of a photo (design §3): the part that must always show when the site crops it (a face, the work). Tap
// or click on the photo; with the keyboard, the arrows move it (Shift: finer) or the two sliders set it. The two small
// frames show how a square and a wide crop would look. The site uses it as the crop's center (object-position).

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));

export function FocalPicker({ src, alt, x, y, onChange, disabled }: { src: string; alt: string; x: number; y: number; onChange: (x: number, y: number) => void; disabled?: boolean }) {
  const id = useId();
  const pos = `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
  };
  const keys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.01 : 0.05;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onChange(clamp(x + m[0]), clamp(y + m[1]));
  };
  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-help`} className="text-sm text-text-2">
        <b>Punto de interés:</b> toca en la foto lo que siempre debe verse (una cara, la obra). Con el teclado, las flechas lo mueven.
      </p>
      <div
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Punto de interés de la foto: ${Math.round(x * 100)} % desde la izquierda, ${Math.round(y * 100)} % desde arriba`}
        aria-describedby={`${id}-help`}
        onPointerDown={pick}
        onKeyDown={keys}
        className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-[var(--radius-control)] bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (object URL) or the library's file, shown whole */}
        <img src={src} alt={alt} className="block h-auto max-h-80 w-full object-contain" draggable={false} />
        <span
          aria-hidden
          className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-surface bg-accent/40 shadow-[0_0_0_2px_var(--c-text)]"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Horizontal: {Math.round(x * 100)} %
          <input type="range" min={0} max={100} value={Math.round(x * 100)} onChange={(e) => onChange(clamp(Number(e.target.value) / 100), y)} disabled={disabled} className="accent-[var(--c-accent)]" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Vertical: {Math.round(y * 100)} %
          <input type="range" min={0} max={100} value={Math.round(y * 100)} onChange={(e) => onChange(x, clamp(Number(e.target.value) / 100))} disabled={disabled} className="accent-[var(--c-accent)]" />
        </label>
      </div>
      <div className="flex items-end gap-3" aria-hidden>
        <figure className="flex flex-col gap-1 text-xs text-text-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the same preview, cropped as the site would */}
          <img src={src} alt="" className="h-16 w-16 rounded-[var(--radius-control)] object-cover" style={{ objectPosition: pos }} />
          Cuadrada
        </figure>
        <figure className="flex flex-col gap-1 text-xs text-text-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the same preview, cropped as the site would */}
          <img src={src} alt="" className="h-16 w-36 rounded-[var(--radius-control)] object-cover" style={{ objectPosition: pos }} />
          Ancha
        </figure>
      </div>
    </div>
  );
}
