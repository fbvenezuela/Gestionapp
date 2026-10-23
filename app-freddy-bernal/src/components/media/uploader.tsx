'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload as TusUpload } from 'tus-js-client';
import { Pause, Play, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { createUpload, failUpload, finishUpload, type UploadTicket } from '@/lib/actions/media';
import { compressImage, probeFile, type Probe } from '@/lib/media/probe';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Item = { key: string; name: string; size: number; progress: number; state: 'preparing' | 'uploading' | 'paused' | 'waiting' | 'done' | 'error'; error?: string; upload?: TusUpload; mediaId?: string };

export type UploadedAsset = { id: string; probe: Probe };

function fmtSize(b: number) {
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

const ticketKey = (scope: string, f: File) => `upload:${scope}:${f.name}:${f.size}:${f.lastModified}`;

/**
 * Resumable uploads: the file goes in chunks; if the signal drops it waits and goes on
 * by itself; if the page is closed, choosing the same file again continues where it was.
 */
export function Uploader({
  eventId, kind, label, hint, accept = 'video/*', multiple = true, onUploaded, compact,
}: { eventId: string | null; kind: string; label: string; hint?: string; accept?: string; multiple?: boolean; onUploaded?: (a: UploadedAsset) => void; compact?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scope = `${eventId ?? 'none'}:${kind}`;

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  // When the signal comes back, restart anything that was waiting.
  useEffect(() => {
    const onOnline = () => setItems((list) => {
      for (const i of list) if ((i.state === 'waiting' || i.state === 'error') && i.upload) i.upload.start();
      return list.map((i) => (i.state === 'waiting' ? { ...i, state: 'uploading' } : i));
    });
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  async function start(original: File) {
    const key = `${original.name}-${original.size}-${Date.now()}`;
    setItems((l) => [...l, { key, name: original.name, size: original.size, progress: 0, state: 'preparing' }]);
    try {
      const file = await compressImage(original);
      const probe = await probeFile(file);
      const ext = (file.name.split('.').pop() || 'bin').slice(0, 5);
      let ticket: UploadTicket | null = null;
      try {
        ticket = JSON.parse(localStorage.getItem(ticketKey(scope, original)) ?? 'null');
      } catch {}
      if (!ticket) {
        const r = await createUpload({ eventId, kind, mime: file.type || 'application/octet-stream', sizeBytes: file.size, ext, probe });
        if (!r.ok) throw new Error(r.error);
        ticket = r.data!;
        try {
          localStorage.setItem(ticketKey(scope, original), JSON.stringify(ticket));
        } catch {}
      }
      const t = ticket;
      const sb = t.mode === 'supabase' ? supabaseBrowser() : null;
      const upload = new TusUpload(file, {
        endpoint: t.endpoint,
        chunkSize: t.chunkSize,
        retryDelays: [0, 2000, 5000, 10000, 20000, 30000, 60000, 60000, 120000, 120000, 300000],
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: true,
        metadata: { mediaId: t.id, bucketName: t.bucket, objectName: t.path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
        headers: t.mode === 'supabase' ? { 'x-upsert': 'true' } : {},
        onBeforeRequest: async (req) => {
          if (t.mode === 'supabase') {
            const token = (await sb?.auth.getSession())?.data.session?.access_token ?? t.token;
            req.setHeader('authorization', `Bearer ${token}`);
          }
        },
        onProgress: (sent, total) => patch(key, { progress: total ? sent / total : 0, state: 'uploading' }),
        onShouldRetry: () => {
          if (!navigator.onLine) patch(key, { state: 'waiting' });
          return true;
        },
        onError: async (err) => {
          if (!navigator.onLine) return patch(key, { state: 'waiting' });
          patch(key, { state: 'error', error: 'Se cortó la subida. Toca «Seguir» para continuar.' });
          console.error(err);
        },
        onSuccess: async () => {
          const r = await finishUpload({ id: t.id });
          try {
            localStorage.removeItem(ticketKey(scope, original));
          } catch {}
          if (!r.ok) return patch(key, { state: 'error', error: r.error });
          patch(key, { state: 'done', progress: 1 });
          onUploaded?.({ id: t.id, probe });
          router.refresh();
        },
      });
      patch(key, { upload, state: 'uploading', mediaId: t.id });
      const previous = await upload.findPreviousUploads();
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    } catch (e) {
      patch(key, { state: 'error', error: (e as Error).message || 'No se pudo preparar el archivo.' });
      toast.error((e as Error).message || 'No se pudo preparar el archivo.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) start(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex w-full items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-border bg-surface text-left hover:border-accent hover:bg-accent-soft',
          compact ? 'min-h-14 px-3 py-2' : 'min-h-24 px-4 py-4',
        )}
      >
        <UploadCloud className="h-7 w-7 shrink-0 text-accent-ink" aria-hidden />
        <span>
          <span className="block font-semibold">{label}</span>
          {hint ? <span className="block text-sm text-text-2">{hint}</span> : null}
        </span>
      </button>
      {items.filter((i) => i.state !== 'done').map((i) => (
        <div key={i.key} className="rounded-[var(--radius-control)] border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{i.name}</p>
            <span className="text-sm text-text-2 tabular">{Math.round(i.progress * 100)}% de {fmtSize(i.size)}</span>
            {i.upload && (i.state === 'uploading' || i.state === 'waiting') ? (
              <Button variant="ghost" size="icon" aria-label="Pausar" onClick={() => { i.upload!.abort(); patch(i.key, { state: 'paused' }); }}><Pause className="h-4 w-4" /></Button>
            ) : null}
            {i.upload && (i.state === 'paused' || i.state === 'error') ? (
              <Button variant="ghost" size="icon" aria-label="Seguir" onClick={() => { i.upload!.start(); patch(i.key, { state: 'uploading', error: undefined }); }}><Play className="h-4 w-4" /></Button>
            ) : null}
            {i.state !== 'uploading' ? (
              <Button variant="ghost" size="icon" aria-label="Quitar de la lista" onClick={() => {
                if (i.mediaId && i.state !== 'paused') failUpload({ id: i.mediaId });
                setItems((l) => l.filter((x) => x.key !== i.key));
              }}><X className="h-4 w-4" /></Button>
            ) : null}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Subiendo ${i.name}`}>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${i.progress * 100}%` }} />
          </div>
          <p className={cn('mt-1 text-sm', i.state === 'error' ? 'text-danger' : 'text-text-2')} role="status">
            {i.state === 'preparing' ? 'Preparando el archivo…' : i.state === 'waiting' ? 'Sin señal: sigue sola cuando vuelva.' : i.state === 'paused' ? 'En pausa.' : i.state === 'error' ? i.error : 'Subiendo…'}
          </p>
        </div>
      ))}
    </div>
  );
}
