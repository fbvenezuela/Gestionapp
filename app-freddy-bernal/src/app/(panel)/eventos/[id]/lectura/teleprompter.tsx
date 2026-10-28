'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus, X } from 'lucide-react';
import type { BeforeItem } from '@/lib/domain/ficha-tab';

// Simple teleprompter for the boss's iPad: big text, adjustable size and speed. `before`: «Antes de hablar» (who
// reported it, the liaison), read before starting and never aloud; only passed when the database returned it.
// `source`: where the text comes from when it is not the storyboard's (the obra ficha's FAB dialog).
export function Teleprompter({
  title, parts, backHref, before = [], source,
}: { title: string; parts: string[]; backHref: string; before?: BeforeItem[]; source?: string }) {
  const [size, setSize] = useState(40);
  const [speed, setSpeed] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!speed) return;
    const t = setInterval(() => box.current?.scrollBy({ top: speed }), 50);
    return () => clearInterval(t);
  }, [speed]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate text-on-slate">
      <div className="flex items-center gap-2 border-b border-on-slate/20 px-4 py-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
        <button className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] hover:bg-on-slate/10" onClick={() => setSize((s) => Math.max(24, s - 6))} aria-label="Letra más pequeña"><Minus /></button>
        <button className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] hover:bg-on-slate/10" onClick={() => setSize((s) => Math.min(96, s + 6))} aria-label="Letra más grande"><Plus /></button>
        <button className="grid h-12 min-w-12 place-items-center rounded-[var(--radius-control)] bg-accent px-3 font-semibold text-on-accent" onClick={() => setSpeed((s) => (s ? 0 : 1))} aria-label={speed ? 'Pausar' : 'Desplazar solo'}>
          {speed ? <Pause /> : <Play />}
        </button>
        {speed ? (
          <select aria-label="Velocidad" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="min-h-12 rounded-[var(--radius-control)] bg-on-slate/10 px-2 text-on-slate">
            <option value={1}>Lento</option><option value={2}>Medio</option><option value={3}>Rápido</option>
          </select>
        ) : null}
        <Link href={backHref} className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] hover:bg-on-slate/10" aria-label="Salir del modo lectura"><X /></Link>
      </div>
      {/* Focusable, so it also scrolls with the keyboard's arrows (axe: scrollable-region-focusable). */}
      <div ref={box} tabIndex={0} role="region" aria-label="Texto para leer" className="flex-1 overflow-y-auto px-6 py-10 sm:px-16">
        {before.length ? (
          <section aria-labelledby="antes-de-hablar" className="mx-auto mb-10 max-w-4xl rounded-[var(--radius-card)] border border-on-slate/30 bg-on-slate/10 p-4 sm:p-5">
            <h2 id="antes-de-hablar" className="text-lg font-semibold">Antes de hablar</h2>
            <p className="text-sm">Para ti: no es parte de lo que se lee.</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {before.map((b) => (
                <div key={b.label} className="min-w-0">
                  <dt className="text-sm font-semibold uppercase tracking-wide">{b.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-lg [overflow-wrap:anywhere]">{b.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {source && parts.length ? <p className="mx-auto mb-6 max-w-4xl text-sm">{source}</p> : null}
        {parts.length ? (
          parts.map((p, i) => (
            <p key={i} className="mx-auto mb-[1.2em] max-w-4xl whitespace-pre-wrap font-semibold leading-snug" style={{ fontSize: size }}>
              {p}
            </p>
          ))
        ) : (
          <p className="text-center text-xl">Todavía no hay texto para leer.</p>
        )}
        <div className="h-[60vh]" />
      </div>
    </div>
  );
}
