'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadInChunks, downloadText, memorySink, opfsSink, saveToDevice, sizeText, DownloadError, type ChunkSink } from '@/lib/media/chunk-download';
import { cn } from '@/lib/cn';

// Downloads of files kept in Google Drive, in 4 MiB pieces through the platform (see
// lib/media/chunk-download.ts). One at a time, with the progress in a toast that stays until the
// file is saved, and a «Cancelar».

let queue: Promise<unknown> = Promise.resolve();

export type DriveFileRef = { id: string; label: string; size: number };

/** Queues one Drive file. `prefix` = «2 de 5 · » when downloading several. */
export function downloadDriveFile(f: DriveFileRef, prefix = ''): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const ctrl = new AbortController();
    const tid = toast.loading(`${prefix}Empezando la descarga…`, {
      duration: Infinity,
      action: { label: 'Cancelar', onClick: () => ctrl.abort() },
    });
    let sink: ChunkSink = memorySink();
    try {
      const disk = await opfsSink(f.id);
      if (disk) {
        const est = await (navigator.storage?.estimate?.() ?? Promise.resolve(undefined)).catch(() => undefined);
        const free = est?.quota != null && est.usage != null ? est.quota - est.usage : null;
        // While saving, the phone briefly holds the file twice.
        if (free != null && f.size && free < f.size * 1.1 - (await disk.size())) {
          throw new DownloadError('No hay espacio en el teléfono para este archivo. Libera espacio y vuelve a tocar «Descargar».', true);
        }
        sink = disk;
      }
      const r = await downloadInChunks(`/api/media/${f.id}`, {
        sink,
        signal: ctrl.signal,
        onState: (s) => toast.loading(`${prefix}${downloadText(s)}`, { id: tid, duration: Infinity, action: { label: 'Cancelar', onClick: () => ctrl.abort() } }),
      });
      await saveToDevice(sink, r.name, r.type);
      toast.success(`${prefix}Listo: ${f.label} (${sizeText(r.total)}) está en tus descargas.`, { id: tid, duration: 6000, action: undefined });
      return true;
    } catch (e) {
      const msg = e instanceof DownloadError ? e.message : 'No se pudo descargar. Revisa la señal y vuelve a tocar «Descargar».';
      if (ctrl.signal.aborted) {
        // Cancelled: what was kept is dropped.
        await sink.clear().catch(() => {});
        toast.dismiss(tid);
      } else toast.error(`${prefix}${msg}`, { id: tid, duration: 10000, action: undefined });
      return false;
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** The download button of a Drive file (icon in material lists, or a labelled button). */
export function DriveDownload({ file, children, className, iconOnly = true, icon = false }: { file: DriveFileRef; children?: React.ReactNode; className?: string; iconOnly?: boolean; icon?: boolean }) {
  const [busy, setBusy] = useState(false);
  const ic = iconOnly ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await downloadDriveFile(file);
        setBusy(false);
      }}
      className={cn(iconOnly ? 'grid h-11 w-11 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2' : '', className)}
      aria-label={iconOnly ? `Descargar ${file.label}` : undefined}
    >
      {busy ? <Loader2 className={cn(ic, 'animate-spin')} aria-hidden /> : iconOnly || icon ? <Download className={ic} aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * «Descargar» of any stored file: a plain link as before, or by pieces when the file is kept in
 * Drive (one long answer would be cut on a slow line, and a plain link would open a bare page
 * when Drive is down).
 */
export function DownloadLink({ file, drive, icon = false, className, children }: { file: DriveFileRef; drive: boolean; icon?: boolean; className?: string; children: React.ReactNode }) {
  if (drive) return <DriveDownload file={file} iconOnly={false} icon={icon} className={className}>{children}</DriveDownload>;
  return (
    <a href={`/api/media/${file.id}`} className={className}>
      {icon ? <Download className="h-4 w-4" aria-hidden /> : null}
      {children}
    </a>
  );
}
