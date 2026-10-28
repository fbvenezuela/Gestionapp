// «Descargar todo» one by one into Downloads (cambios del 27/10/2026, §5): Android Chrome, Firefox and desktop Safari,
// where there is no folder picker. Same rules as the folder (folder-sink.ts), so both say the same thing:
//   * Files kept in Drive go in 4 MiB pieces through the platform (drive-download.tsx, one at a time); every other
//     file is a plain download that the browser's own download manager takes over.
//   * 429 (the person's share for today), 503 (Drive, or this month's cap) and 401 stop the whole run with the
//     server's own sentence; what has not started stays «En espera». Asking for every remaining Drive file would only
//     fail each one with the same answer.
//   * A 404 (a demo row with no real file behind it) skips that file and goes on; any other failure marks that file
//     and goes on. The headline (runHeadline) never says a plain «Listo» when a file did not come down.
//   * A plain download cannot tell the page how it ended, so before handing a file to the browser the platform is
//     asked whether it is there (HEAD /api/media/<id>: the same session and RLS check, no bytes). A file that is not
//     (a demo row, a file gone from storage) is marked like a Drive 404, and 401, 429 and 503 stop the run.
//   * iPhone and iPad have no run (one «Bajar» per file): the list asks the same thing once as it opens
//     (missingStored), and a file that is not there says so instead of «Bajar».
// No date, time or address is ever written: the names come from the plan (download-plan.ts).

import { DownloadError } from './chunk-download';
import type { DownloadPlan, PlanEntry } from './download-plan';
import { MISSING, STOPS, type FileRunState } from './folder-sink';

/** How one Drive download ended: saved, or the server's answer and its sentence. */
export type DriveOutcome = { ok: true } | { ok: false; status: number | null; message: string; cancelled: boolean };

const FAILED = 'No se pudo descargar. Revisa la señal y vuelve a tocar «Descargar».';

// What a HEAD answer means, with no body to read the server's own sentence from.
const STOP_TEXT: Record<number, string> = {
  401: 'Entra de nuevo.',
  429: 'Ya pediste muchos archivos seguidos. Espera unos minutos y vuelve a intentarlo.',
  503: 'La plataforma no responde ahora. Vuelve a intentarlo en unos minutos.',
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Whether a file that is not in Drive is there before it goes to the browser: the status of HEAD /api/media/<id>, or
 * null when nothing answered (no signal).
 */
export async function checkStored(id: string, o: { fetcher?: Fetcher; signal?: AbortSignal } = {}): Promise<number | null> {
  try {
    const res = await (o.fetcher ?? fetch)(`/api/media/${id}`, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: o.signal });
    return res.status;
  } catch {
    return null;
  }
}

/**
 * iPhone and iPad (one «Bajar» per file, no run to watch): the files outside Drive that are not there (404 or 410: a
 * demo row, a file gone from storage), asked once as the list opens, one after another, so each one says so instead of
 * a link that would save an error page. No answer, or any other status, leaves that file's «Bajar»; 401, 429 and 503
 * stop the asking (every other file would get the same answer).
 */
export async function missingStored(
  files: readonly { id: string; drive: boolean }[],
  o: { check?: (id: string, signal?: AbortSignal) => Promise<number | null>; signal?: AbortSignal } = {},
): Promise<Set<string>> {
  const missing = new Set<string>();
  for (const f of files) {
    if (o.signal?.aborted) break;
    if (f.drive) continue;
    const status = await (o.check ?? ((id, signal) => checkStored(id, { signal })))(f.id, o.signal);
    if (status === 404 || status === 410) missing.add(f.id);
    else if (status != null && STOPS.has(status)) break;
  }
  return missing;
}

/** The line above that list when some files are not there; null when every one is. */
export function missingListLine(n: number): string | null {
  if (!n) return null;
  return n === 1
    ? '1 archivo no se puede bajar porque no está guardado en la plataforma.'
    : `${n} archivos no se pueden bajar porque no están guardados en la plataforma.`;
}

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
  /** Any other file: a plain download handed to the browser, once `check` said it is there. */
  stored: (entry: PlanEntry) => void;
  /** Whether that file is there: the platform's status for it, null with no answer (default: checkStored). */
  check?: (entry: PlanEntry, signal?: AbortSignal) => Promise<number | null>;
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
      const status = await (o.check ?? ((x, signal) => checkStored(x.id, { signal })))(e, o.signal);
      if (o.signal?.aborted) {
        set(i, { phase: 'waiting', received: 0, total: e.size || null });
        run.cancelled = true;
        break;
      }
      if (status === 404 || status === 410) {
        set(i, { phase: 'missing', received: 0, total: null, error: MISSING });
        continue;
      }
      if (status != null && STOPS.has(status)) {
        set(i, { phase: 'error', received: 0, total: null, error: STOP_TEXT[status] });
        run.stopped = STOP_TEXT[status];
        break;
      }
      if (status == null || status < 200 || status >= 300) {
        set(i, { phase: 'error', received: 0, total: null, error: FAILED });
        continue;
      }
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
      set(i, { phase: 'missing', received: 0, total: null, error: MISSING });
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

/**
 * The line above the list, from how the run ended (folder or one by one). Files with nothing behind them (a demo row,
 * a file gone from storage) are counted, never hidden under «Listo»: the same words hold in the demo and with the
 * real base.
 */
export function runHeadline(run: { running: boolean; cancelled: boolean; stopped: string | null; sent: boolean; files: readonly FileRunState[] }): string {
  if (run.running) return 'Descargando…';
  if (run.cancelled) return 'Se detuvo. Lo que ya bajó queda.';
  if (run.stopped) return 'Se detuvo antes de terminar.';
  if (run.files.some((f) => f.phase === 'error')) return 'Algunos archivos no se bajaron. Vuelve a intentarlo con esos.';
  const missing = run.files.filter((f) => f.phase === 'missing').length;
  if (!missing) return run.sent ? 'Listo: todo va a tus descargas.' : 'Listo: todo está en la carpeta.';
  const why = missing === 1 ? '1 archivo no se bajó porque no está guardado en la plataforma.' : `${missing} archivos no se bajaron porque no están guardados en la plataforma.`;
  if (!run.files.some((f) => f.phase === 'done' || f.phase === 'skipped')) return `No se bajó ningún archivo: ${missing === 1 ? 'no está guardado' : 'no están guardados'} en la plataforma. Solo el LEEME.`;
  return `${run.sent ? 'Listo: lo demás va a tus descargas.' : 'Listo: lo demás está en la carpeta.'} ${why}`;
}
