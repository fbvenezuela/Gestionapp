'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, FileText, ImageIcon, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { pickWebMedia } from '@/lib/actions/web';
import type { MediaInfo } from '@/lib/data/web-admin';
import { cn } from '@/lib/cn';
import { useEditor } from './editor-context';
import { UploadForm } from './upload-form';

// Choosing photos and PDFs of the library from a form (design §3): what is chosen shows with its alternative text, and
// «Elegir» opens the library (search, newest first) or «Subir una nueva» right there. Only ids go into the draft; the
// photo's words live in the library and are frozen into the item when it is published.

type Kind = 'image' | 'document';

export function Thumb({ m, className, sizes = '96px' }: { m: MediaInfo; className?: string; sizes?: string }) {
  if (m.kind === 'document') {
    return (
      <span className={cn('grid place-items-center bg-surface-2 text-accent-ink', className)}>
        <FileText className="h-6 w-6" aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', className)}>
      <Image src={m.url} alt={m.alt} fill sizes={sizes} className="object-cover" style={{ objectPosition: `${m.focalX * 100}% ${m.focalY * 100}%` }} />
    </span>
  );
}

function Chosen({ id, onRemove, extra }: { id: string; onRemove?: () => void; extra?: ReactNode }) {
  const { media, readOnly } = useEditor();
  const m = media[id];
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface p-2">
      {m ? <Thumb m={m} className="h-16 w-16 shrink-0 rounded-[var(--radius-control)]" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface-2"><ImageIcon className="h-5 w-5 text-muted" aria-hidden /></span>}
      <span className="min-w-0 flex-1 text-sm">
        {m ? (
          <>
            <span className="line-clamp-2 block font-medium">{m.kind === 'image' ? m.alt : m.title}</span>
            {m.archived ? <span className="block font-semibold text-danger">Archivado en la biblioteca: cámbialo antes de publicar.</span> : null}
            {m.credit ? <span className="block text-text-2">Crédito: {m.credit}</span> : null}
          </>
        ) : (
          <span className="text-text-2">Un archivo que ya no está en la biblioteca.</span>
        )}
      </span>
      {extra}
      {onRemove && !readOnly ? (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Quitar ${m ? (m.kind === 'image' ? m.alt : m.title) : 'el archivo'}`}>
          <X className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function Picker({ open, onOpenChange, kind, onPick, title }: { open: boolean; onOpenChange: (o: boolean) => void; kind: Kind; onPick: (m: MediaInfo) => void; title: string }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MediaInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'library' | 'upload'>('library');

  useEffect(() => {
    if (!open || mode !== 'library') return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await pickWebMedia({ kind, q: q.trim() || undefined });
      if (!live) return;
      if (r.ok) {
        setItems(r.data ?? []);
        setError(null);
      } else setError(r.error);
    }, q ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, q, kind, mode]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={kind === 'image' ? 'Elige una foto de la biblioteca o sube una nueva.' : 'Elige un PDF de la biblioteca o sube uno nuevo.'}>
      <div className="mb-4 flex gap-1" role="group" aria-label="De dónde">
        <Button type="button" size="sm" variant={mode === 'library' ? 'slate' : 'secondary'} aria-pressed={mode === 'library'} onClick={() => setMode('library')}>
          De la biblioteca
        </Button>
        <Button type="button" size="sm" variant={mode === 'upload' ? 'slate' : 'secondary'} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>
          <Plus className="h-4 w-4" aria-hidden /> Subir {kind === 'image' ? 'una nueva' : 'uno nuevo'}
        </Button>
      </div>
      {mode === 'upload' ? (
        <UploadForm
          kind={kind}
          submitLabel={kind === 'image' ? 'Subir y usar esta foto' : 'Subir y usar este PDF'}
          onUploaded={(m) => {
            onPick(m);
            onOpenChange(false);
            setMode('library');
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor={id} className="sr-only">
            Buscar en la biblioteca
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por texto alternativo, pie o crédito" className="pl-9" />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {items === null ? <p className="text-sm text-text-2">Cargando…</p> : null}
          {items && !items.length ? <p className="text-sm text-text-2">{q ? 'Nada coincide con esa búsqueda.' : 'La biblioteca está vacía: sube el primero.'}</p> : null}
          <ul className={kind === 'image' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex flex-col gap-2'}>
            {(items ?? []).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(m);
                    onOpenChange(false);
                  }}
                  className="flex w-full flex-col gap-1 rounded-[var(--radius-control)] border border-border bg-surface p-1.5 text-left text-xs hover:border-accent focus-visible:border-accent"
                >
                  {kind === 'image' ? <Thumb m={m} className="aspect-square w-full rounded-[var(--radius-control)]" sizes="160px" /> : null}
                  <span className={cn('line-clamp-2', kind === 'document' && 'flex items-center gap-2 text-sm')}>
                    {kind === 'document' ? <FileText className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden /> : null}
                    {kind === 'image' ? m.alt : m.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

/** One photo (or PDF) of the library. */
export function MediaField({ label, hint, kind = 'image', value, onChange, required }: { label: string; hint?: ReactNode; kind?: Kind; value: unknown; onChange: (id: string | null) => void; required?: boolean }) {
  const { addMedia, readOnly } = useEditor();
  const [open, setOpen] = useState(false);
  const id = typeof value === 'string' && value ? value : null;
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-sm font-semibold">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {id ? <Chosen id={id} onRemove={() => onChange(null)} /> : null}
      {!readOnly ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          {kind === 'image' ? <ImageIcon className="h-4 w-4" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
          {id ? 'Cambiar' : kind === 'image' ? 'Elegir foto' : 'Elegir PDF'}
        </Button>
      ) : null}
      {hint ? <p className="text-sm text-text-2">{hint}</p> : null}
      <Picker
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        title={label}
        onPick={(m) => {
          addMedia(m);
          onChange(m.id);
        }}
      />
    </div>
  );
}

/** Several photos in order (a gallery, the evidence of a project). */
export function MediaListField({ label, hint, value, onChange, max = 24 }: { label: string; hint?: ReactNode; value: unknown; onChange: (ids: string[]) => void; max?: number }) {
  const { addMedia, readOnly } = useEditor();
  const [open, setOpen] = useState(false);
  const ids = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-sm font-semibold">{label}</span>
      {ids.length ? (
        <ol className="flex flex-col gap-2">
          {ids.map((id, i) => (
            <li key={`${id}-${i}`}>
              <Chosen
                id={id}
                onRemove={() => onChange(ids.filter((_, j) => j !== i))}
                extra={
                  readOnly ? null : (
                    <span className="flex shrink-0 flex-col">
                      <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir la foto ${i + 1}`}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`Bajar la foto ${i + 1}`}>
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </Button>
                    </span>
                  )
                }
              />
            </li>
          ))}
        </ol>
      ) : null}
      {!readOnly && ids.length < max ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar foto
        </Button>
      ) : null}
      {hint ? <p className="text-sm text-text-2">{hint}</p> : null}
      <Picker
        open={open}
        onOpenChange={setOpen}
        kind="image"
        title={label}
        onPick={(m) => {
          addMedia(m);
          if (!ids.includes(m.id)) onChange([...ids, m.id]);
        }}
      />
    </div>
  );
}
