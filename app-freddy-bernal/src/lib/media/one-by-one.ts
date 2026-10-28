// «Descargar todo» one by one into Downloads (cambios del 27/10/2026, §5): Android Chrome, Firefox and desktop Safari,
// where there is no folder picker. Same rules as the folder (folder-sink.ts), so both say the same thing:
//   * Files kept in Drive go in 4 MiB pieces through the platform (drive-download.tsx, one at a time); every other
//     file is a plain download that the browser's own download manager takes over.
//   * 429 (the person's share for today), 503 (Drive, or this month's cap) and 401 stop the whole run with the
//     server's own sentence; what has not started stays «En espera». Asking for every remaining Drive file would only
//     fail each one with the same answer.
//   * A 404 (a demo row with no real file behind it) skips that file and goes on; any other failure marks that file
//     and goes on. The headline (runHeadline) never says «Listo» when a file did not come down.
// No date, time or address is ever written: the names come from the plan (download-plan.ts).

import { DownloadError } from './chunk-download';
import type { DownloadPlan, PlanEntry } from './download-plan';
import { STOPS, type FileRunState } from './folder-sink';

/** How one Drive download ended: saved, or the server's answer and its sentence. */
export type DriveOutcome = { ok: true } | { ok: false; status: number | null; message: string; cancelled: boolean };

const FAILED = 'No se pudo descargar. Revisa la señal y vuelve a tocar «Descargar».';

/** Runs one Drive download and says how it ended (a DownloadError carries the server's status and sentence). */
export async function driveOutcome(download: () => Promise<unknown>, aborted: () => boolean = () => false): Promise<DriveOutcome> {
  try {
    await download();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: e instanceof DownloadError ? e.status : null,
      message: e instanceof DownloadError ? e.message : FAILED,
      cancelled: aborted(),
    };
  }
}

export type OneByOneRun = { files: FileRunState[]; stopped: string | null; cancelled: boolean };
export type OneByOneOptions = {
  signal?: AbortSignal;
  /** A Drive file (in pieces, then saved). `index` and the plan's length make the «2 de 5 · » of its toast. */
  drive: (entry: PlanEntry, index: number) => Promise<DriveOutcome>;
  /** Any other file: a plain download handed to the browser. */
  stored: (entry: PlanEntry) => void;
  /** The pause after a plain download (browsers drop downloads started too close together). */
  pause?: (ms: number) => Promise<void>;
  onFile?: (index: number, s: FileRunState) => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendPlanOneByOne(plan: DownloadPlan, o: OneByOneOptions): Promise<OneByOneRun> {
  const files: FileRunState[] = plan.entries.map(() => ({ phase: 'waiting', received: 0, total: null }));
  const run: OneByOneRun = { files, stopped: null, cancelled: false };
  const set = (i: number, s: FileRunState) => {
    files[i] = s;
    o.onFile?.(i, s);
  };
  for (const [i, e] of plan.entries.entries()) {
    if (o.signal?.aborted) {
      run.cancelled = true;
      break;
    }
    set(i, { phase: 'downloading', received: 0, total: e.size || null });
    if (!e.drive) {
      o.stored(e);
      set(i, { phase: 'done', received: e.size, total: e.size });
      await (o.pause ?? sleep)(800);
      continue;
    }
    const r = await o.drive(e, i);
    if (r.ok) {
      set(i, { phase: 'done', received: e.size, total: e.size });
      continue;
    }
    if (o.signal?.aborted) {
      set(i, { phase: 'waiting', received: 0, total: e.size || null });
      run.cancelled = true;
      break;
    }
    if (r.status === 404 || r.status === 410) {
      set(i, { phase: 'missing', received: 0, total: null, error: 'No hay un archivo detrás.' });
      continue;
    }
    // «Cancelar» in that file's own notice: that file only.
    set(i, { phase: 'error', received: 0, total: null, error: r.cancelled ? 'Lo cancelaste.' : r.message });
    if (!r.cancelled && r.status != null && STOPS.has(r.status)) {
      run.stopped = r.message;
      break;
    }
  }
  return run;
}

/** The line above the list, from how the run ended (folder or one by one). */
export function runHeadline(run: { running: boolean; cancelled: boolean; stopped: string | null; sent: boolean; files: readonly FileRunState[] }): string {
  if (run.running) return 'Descargando…';
  if (run.cancelled) return 'Se detuvo. Lo que ya bajó queda.';
  if (run.stopped) return 'Se detuvo antes de terminar.';
  if (run.files.some((f) => f.phase === 'error')) return 'Algunos archivos no se bajaron. Vuelve a intentarlo con esos.';
  return run.sent ? 'Listo: todo va a tus descargas.' : 'Listo: todo está en la carpeta.';
}
