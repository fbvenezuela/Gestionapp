// «Descargar todo» into a folder the person chooses (cambios del 27/10/2026, §5): desktop Chrome, Edge and Opera
// (File System Access API). Every file of the plan (download-plan.ts) is written in turn, one at a time, into
// <chosen folder>/E-0042/<kind>/E-0042-<label>.<ext>, with E-0042-LEEME.txt first.
//   * Files kept in Drive go in 4 MiB pieces through the platform (chunk-download.ts: a dropped signal waits and
//     goes on); every other file in one plain download straight from storage (streamToSink).
//   * Running it again on the same folder skips every file that is already there whole (same size), so after a
//     stop at the daily Drive cap it goes on the next day. A file cut halfway starts again from zero.
//   * 429 (the person's share for today), 503 (Drive, or this month's cap) and 401 stop the whole run with their
//     own sentence; a 404 (a demo row with no real file behind it) skips that file and goes on.
// No date, time or address is ever written: the names and the LEEME come from the plan.

import { downloadInChunks, DownloadError, folderSink, streamToSink, type DownloadState, type FsDir } from './chunk-download';
import type { DownloadPlan } from './download-plan';

export type FilePhase = 'waiting' | 'downloading' | 'done' | 'skipped' | 'missing' | 'error';
export type FileRunState = { phase: FilePhase; received: number; total: number | null; error?: string };
export type FolderRun = { readme: boolean; files: FileRunState[]; stopped: string | null; cancelled: boolean };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type FolderRunOptions = {
  signal?: AbortSignal;
  fetcher?: Fetcher;
  retryDelays?: number[];
  waitForRetry?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onFile?: (index: number, s: FileRunState) => void;
};

type PickerWindow = { showDirectoryPicker?: (o?: Record<string, unknown>) => Promise<FsDir> };

/**
 * Opens the folder picker (call it straight from the tap: the browser asks for that). null when the person closed
 * it, or when this browser has no picker.
 */
export async function pickFolder(w: PickerWindow | undefined = typeof window === 'undefined' ? undefined : (window as unknown as PickerWindow)): Promise<FsDir | null> {
  const pick = w?.showDirectoryPicker;
  if (typeof pick !== 'function') return null;
  try {
    return await pick.call(w, { id: 'fb-material', mode: 'readwrite', startIn: 'downloads' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return null;
    throw e;
  }
}

/** The size of `name` in `dir`, or null when it is not there. */
export async function sizeIn(dir: FsDir, name: string): Promise<number | null> {
  try {
    return (await (await dir.getFileHandle(name)).getFile()).size;
  } catch {
    return null;
  }
}

const STOPS = new Set([401, 429, 503]);

export async function writePlanToFolder(root: FsDir, plan: DownloadPlan, o: FolderRunOptions = {}): Promise<FolderRun> {
  const files: FileRunState[] = plan.entries.map(() => ({ phase: 'waiting', received: 0, total: null }));
  const run: FolderRun = { readme: false, files, stopped: null, cancelled: false };
  const set = (i: number, s: FileRunState) => {
    files[i] = s;
    o.onFile?.(i, s);
  };
  const dir = await root.getDirectoryHandle(plan.root, { create: true });

  // The LEEME first, always written again (the notes may have changed since the last run).
  const readme = folderSink(dir, plan.readme.name);
  await readme.append(new TextEncoder().encode(plan.readme.text));
  await readme.close();
  run.readme = true;

  for (const [i, e] of plan.entries.entries()) {
    if (o.signal?.aborted) {
      run.cancelled = true;
      break;
    }
    const sub = await dir.getDirectoryHandle(e.folder, { create: true });
    const have = await sizeIn(sub, e.name);
    if (have != null && e.size > 0 && have === e.size) {
      set(i, { phase: 'skipped', received: have, total: have });
      continue;
    }
    const sink = folderSink(sub, e.name);
    const onState = (s: DownloadState) => set(i, { phase: 'downloading', received: s.received, total: s.total ?? (e.size || null) });
    set(i, { phase: 'downloading', received: 0, total: e.size || null });
    try {
      const url = `/api/media/${e.id}`;
      const r = e.drive
        ? await downloadInChunks(url, { sink, signal: o.signal, fetcher: o.fetcher, retryDelays: o.retryDelays, waitForRetry: o.waitForRetry, onState })
        : await streamToSink(url, { sink, signal: o.signal, fetcher: o.fetcher, onState });
      await sink.close();
      set(i, { phase: 'done', received: r.total, total: r.total });
    } catch (err) {
      await sink.abort();
      if (o.signal?.aborted) {
        set(i, { phase: 'waiting', received: 0, total: e.size || null });
        run.cancelled = true;
        break;
      }
      const status = err instanceof DownloadError ? err.status : null;
      const message = err instanceof DownloadError ? err.message : 'No se pudo descargar ese archivo.';
      if (status === 404 || status === 410) {
        set(i, { phase: 'missing', received: 0, total: null, error: 'No hay un archivo detrás.' });
        continue;
      }
      set(i, { phase: 'error', received: 0, total: null, error: message });
      if (status != null && STOPS.has(status)) {
        run.stopped = message;
        break;
      }
    }
  }
  return run;
}

/** One short line per file for the progress list. */
export function fileStateText(s: FileRunState): string {
  switch (s.phase) {
    case 'waiting':
      return 'En espera';
    case 'downloading':
      return s.total ? `Bajando ${Math.min(100, Math.floor((s.received / s.total) * 100))} %` : 'Bajando…';
    case 'done':
      return 'Listo';
    case 'skipped':
      return 'Ya estaba en la carpeta';
    case 'missing':
      return s.error ?? 'No hay un archivo detrás.';
    case 'error':
      return s.error ?? 'No se pudo descargar.';
  }
}
