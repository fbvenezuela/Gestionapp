'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { compressImage } from '@/lib/media/probe';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { ALT_HELP, ALT_MISSING, WEB_MEDIA_LIMITS } from '@/lib/web/cms/media-file';
import type { MediaInfo } from '@/lib/data/web-admin';
import { FocalPicker } from './focal-picker';

// Uploading to the public media library (design §3, §6): a photo is made smaller and loses its metadata in this phone
// first (compressImage, the panel's own helper), and goes with its alternative text — required, with what makes a good
// one —, its caption, its credit and its focal point; a document is a PDF with its title. The server checks everything
// again (type by its bytes, size, dimensions) and the database requires the alternative text.

type Kind = 'image' | 'document';

// The largest file the server takes for each kind, read where the server runs (maxMediaBytes: on the hosting, 4 MB for
// every file) and passed down by src/app/(panel)/admin/web/layout.tsx, so the hint says the limit that applies. Without
// it, the smallest one.
export type UploadLimitsValue = Record<Kind, number>;
const LimitsContext = createContext<UploadLimitsValue>({ image: WEB_MEDIA_LIMITS.vercelBytes, document: WEB_MEDIA_LIMITS.vercelBytes });

export function UploadLimits({ value, children }: { value: UploadLimitsValue; children: React.ReactNode }) {
  return <LimitsContext.Provider value={value}>{children}</LimitsContext.Provider>;
}

const megabytes = (n: number) => Math.max(1, Math.round(n / (1024 * 1024)));

export function UploadForm({ kind, onUploaded, submitLabel }: { kind: Kind; onUploaded: (m: MediaInfo) => void; submitLabel?: string }) {
  const id = useId();
  const limits = useContext(LimitsContext);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const [words, setWords] = useState({ alt: '', caption: '', credit: '', title: '' });
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function choose(f: File | null) {
    setError(null);
    setFile(null);
    setPreview(null);
    if (!f) return;
    if (kind === 'document') {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
        setError('Los documentos van en PDF.');
        return;
      }
      setFile(f);
      if (!words.title) setWords((w) => ({ ...w, title: f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').slice(0, 200) }));
      return;
    }
    setPreparing(true);
    try {
      const small = await compressImage(f, 2560, 0.85);
      setFile(small);
      setPreview(URL.createObjectURL(small));
      setFocal({ x: 0.5, y: 0.5 });
    } catch (e) {
      setError((e as Error)?.message || 'No pudimos preparar esa foto. Elige otra.');
    } finally {
      setPreparing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(kind === 'image' ? 'Elige la foto.' : 'Elige el PDF.');
      return;
    }
    if (kind === 'image' && words.alt.trim().length < 3) {
      setAltError(ALT_MISSING);
      return;
    }
    if (kind === 'document' && words.title.trim().length < 3) {
      setError('Escribe el título del documento.');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('file', file, file.name);
    fd.set('kind', kind);
    for (const [k, v] of Object.entries(words)) fd.set(k, v);
    fd.set('focalX', String(focal.x));
    fd.set('focalY', String(focal.y));
    try {
      const res = await fetch(ADMIN_WEB.upload, { method: 'POST', body: fd, credentials: 'same-origin', cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; media?: MediaInfo; error?: string };
      if (res.ok && body.ok && body.media) {
        onUploaded(body.media);
        setFile(null);
        setPreview(null);
        setWords({ alt: '', caption: '', credit: '', title: '' });
        if (input.current) input.current.value = '';
      } else setError(body.error ?? (res.status === 413 ? 'El archivo es muy pesado para subirlo.' : 'No se pudo subir. Vuelve a intentarlo.'));
    } catch {
      setError('No se pudo subir: revisa la señal y vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-label={kind === 'image' ? 'Subir una foto' : 'Subir un documento PDF'}>
      <Field label={kind === 'image' ? 'Foto (JPG, PNG o WebP)' : 'Documento (PDF)'} htmlFor={`${id}-file`} hint={kind === 'image' ? 'Se achica y pierde la ubicación y los datos de la cámara antes de salir de este teléfono o de esta computadora.' : `Hasta ${megabytes(limits.document)} MB.`}>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept={kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'application/pdf,.pdf'}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-[15px] file:mr-3 file:min-h-11 file:rounded-[var(--radius-control)] file:border file:border-border file:bg-surface file:px-4 file:font-semibold file:text-text"
        />
      </Field>
      {preparing ? <p className="text-sm text-text-2" role="status">Preparando la foto…</p> : null}
      {kind === 'image' && preview ? <FocalPicker src={preview} alt={words.alt || 'Vista previa de la foto'} x={focal.x} y={focal.y} onChange={(x, y) => setFocal({ x, y })} /> : null}
      {kind === 'document' && file ? (
        <p className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden /> {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
        </p>
      ) : null}
      {kind === 'image' ? (
        <Field label={<>Texto alternativo <span className="text-danger">*</span></>} htmlFor={`${id}-alt`} hint={ALT_HELP} error={altError}>
          <Textarea
            id={`${id}-alt`}
            rows={2}
            maxLength={300}
            value={words.alt}
            aria-invalid={!!altError || undefined}
            onChange={(e) => {
              setAltError(null);
              setWords((w) => ({ ...w, alt: e.target.value }));
            }}
          />
        </Field>
      ) : (
        <Field label={<>Título del documento <span className="text-danger">*</span></>} htmlFor={`${id}-title`}>
          <Input id={`${id}-title`} maxLength={200} value={words.title} onChange={(e) => setWords((w) => ({ ...w, title: e.target.value }))} />
        </Field>
      )}
      {kind === 'image' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pie de foto" htmlFor={`${id}-caption`} hint="Lo que cuenta la foto, debajo de ella (opcional).">
            <Input id={`${id}-caption`} maxLength={500} value={words.caption} onChange={(e) => setWords((w) => ({ ...w, caption: e.target.value }))} />
          </Field>
          <Field label="Crédito" htmlFor={`${id}-credit`} hint="Quién la tomó (opcional).">
            <Input id={`${id}-credit`} maxLength={200} value={words.credit} onChange={(e) => setWords((w) => ({ ...w, credit: e.target.value }))} />
          </Field>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || preparing} className="self-start">
        <Upload className="h-4 w-4" aria-hidden /> {busy ? 'Subiendo…' : (submitLabel ?? (kind === 'image' ? 'Subir la foto' : 'Subir el PDF'))}
      </Button>
    </form>
  );
}
