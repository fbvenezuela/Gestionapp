'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, Download, FolderDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { MEDIA_KIND } from '@/lib/data/labels';
import { myDriveBudget } from '@/lib/actions/drive';
import { sizeText } from '@/lib/media/chunk-download';
import { budgetMessage, budgetVerdict, buildDownloadPlan, kindsOf, type DriveBudget, type PlanFile, type PlanNote } from '@/lib/media/download-plan';
import { downloadMode, type DownloadMode } from '@/lib/media/download-mode';
import { fileStateText, MISSING, pickFolder, writePlanToFolder, type FileRunState } from '@/lib/media/folder-sink';
import { missingListLine, missingStored, runHeadline, sendPlanOneByOne } from '@/lib/media/one-by-one';
import { downloadDriveFile } from './drive-download';
import { cn } from '@/lib/cn';

// «Descargar todo» of a pauta (cambios del 27/10/2026, §5): every file of the event at once, plus a LEEME.txt with the
// title, Grabación's notes and the list of files. Never a date, a time or an address, for the boss too: this
// component never receives them (title, code, files and notes only) and the plan names everything (download-plan.ts).
//   * Chrome, Edge, Opera on a computer: a folder the person chooses, one file after another (folder-sink.ts).
//   * Elsewhere: one by one to Downloads; on iPhone and iPad one «Bajar» per file (each needs its own tap), and a file
//     that is not there (the demo's sample videos, one gone from storage) says so instead.
// Files kept in Drive count against the transfer cap: before starting, the dialog says when they do not fit in what
// the person has left today (myDriveBudget).

type Run = { files: FileRunState[]; readme: boolean; running: boolean; stopped: string | null; cancelled: boolean; sent: boolean };

const MODE_HINT: Record<DownloadMode, string> = {
  folder: 'Elige una carpeta: dentro queda una carpeta con el código del evento y una subcarpeta por tipo. Si se corta, vuelve a elegir la misma carpeta: lo que ya bajó no se repite.',
  'one-by-one': 'Los archivos van uno tras otro a tus descargas. Si el navegador pregunta si permites varias descargas, di que sí.',
  'ios-list': 'En el iPhone y el iPad cada archivo se baja con su propio toque. Los videos grandes, mejor en una computadora.',
};

const noSubscribe = () => () => {};
const NO_NOTES: PlanNote[] = [];
const NONE: ReadonlySet<string> = new Set();

function clickDownload(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function saveText(text: string, name: string) {
  const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  clickDownload(href, name);
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

// A file that is not in Drive, as a plain download (the browser's own download manager resumes it).
function saveStored(id: string, name: string) {
  const a = document.createElement('a');
  a.href = `/api/media/${id}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// `data-tour` goes on the button that opens it (a tutorial's anchor: the event's Material tab or a day of Biblioteca).
export function DownloadAllDialog({
  title, code, files, notes = NO_NOTES, label = 'Descargar todo', 'data-tour': tour,
}: { title: string; code: string; files: PlanFile[]; notes?: PlanNote[] | null; label?: string; 'data-tour'?: 'download-all' | 'download-day' }) {
  const [open, setOpen] = useState(false);
  const present = useMemo(() => kindsOf(files), [files]);
  // The kinds the person unticked (a kind that arrives later starts ticked).
  const [off, setOff] = useState<string[]>([]);
  const kinds = useMemo(() => present.filter((k) => !off.includes(k)), [present, off]);
  const plan = useMemo(() => buildDownloadPlan({ title, code, files, notes, kinds }), [title, code, files, notes, kinds]);
  const [budget, setBudget] = useState<DriveBudget | null>(null);
  // The browser's abilities are only known in the browser (the server renders the plain one-by-one).
  const mode = useSyncExternalStore(noSubscribe, () => downloadMode(), () => 'one-by-one' as DownloadMode);
  const [run, setRun] = useState<Run | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const hasDrive = files.some((f) => f.drive);
  // iPhone and iPad: the files outside Drive that are not there, asked once as the list opens (missingStored).
  const [absent, setAbsent] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    if (!open || !hasDrive) return;
    let live = true;
    myDriveBudget({}).then((r) => {
      if (live && r.ok && r.data) setBudget(r.data);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [open, hasDrive]);

  useEffect(() => {
    if (!open || mode !== 'ios-list') return;
    const c = new AbortController();
    missingStored(files, { signal: c.signal })
      .then((s) => {
        if (!c.signal.aborted) setAbsent(s);
      })
      .catch(() => {});
    return () => c.abort();
  }, [open, mode, files]);

  if (!files.length) return null;
  const verdict = budgetVerdict(plan.totals, budget);
  const warning = budgetMessage(verdict);
  const running = !!run?.running;
  const patch = (i: number, s: FileRunState) =>
    setRun((r) => (r ? { ...r, files: r.files.map((x, j) => (j === i ? s : x)) } : r));
  const fresh = (): Run => ({ files: plan.entries.map(() => ({ phase: 'waiting', received: 0, total: null })), readme: false, running: true, stopped: null, cancelled: false, sent: false });

  async function toFolder() {
    // The picker first, straight from the tap (the browser asks for that).
    let root;
    try {
      root = await pickFolder();
    } catch {
      setRun({ ...fresh(), running: false, stopped: 'No se pudo abrir esa carpeta. Prueba con otra (por ejemplo, una dentro de Descargas).' });
      return;
    }
    if (!root) return;
    const c = new AbortController();
    ctrl.current = c;
    setRun(fresh());
    try {
      const r = await writePlanToFolder(root, plan, { signal: c.signal, onFile: patch });
      setRun((x) => (x ? { ...x, readme: r.readme, running: false, stopped: r.stopped, cancelled: r.cancelled } : x));
    } catch {
      setRun((x) => (x ? { ...x, running: false, stopped: 'No se pudo escribir en esa carpeta. Prueba con otra (por ejemplo, una dentro de Descargas).' } : x));
    }
  }

  async function oneByOne() {
    const c = new AbortController();
    ctrl.current = c;
    setRun(fresh());
    saveText(plan.readme.text, plan.readme.name);
    setRun((x) => (x ? { ...x, readme: true } : x));
    // Stops on the daily share (429), Drive or the month's cap (503) and a lost session (401), like the folder.
    const r = await sendPlanOneByOne(plan, {
      signal: c.signal,
      onFile: patch,
      stored: (e) => saveStored(e.id, e.name),
      drive: (e, i) => downloadDriveFile({ id: e.id, label: e.name, size: e.size }, `${i + 1} de ${plan.entries.length} · `, c.signal),
    });
    setRun((x) => (x ? { ...x, files: r.files, running: false, stopped: r.stopped, cancelled: r.cancelled, sent: true } : x));
  }

  const toggle = (k: string, on: boolean) => setOff((list) => (on ? list.filter((x) => x !== k) : [...list, k]));
  const absentLine = mode === 'ios-list' ? missingListLine(plan.entries.filter((e) => absent.has(e.id)).length) : null;
  const count = (k: string) => files.filter((f) => f.kind === k).length;
  const done = run && !run.running;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) ctrl.current?.abort();
        setOpen(o);
        if (!o) setRun(null);
      }}
      title="Descargar todo"
      description={`${code} · ${plan.totals.files} ${plan.totals.files === 1 ? 'archivo' : 'archivos'} · ${sizeText(plan.totals.bytes)}`}
      trigger={
        <Button variant="secondary" data-tour={tour}>
          <Download className="h-4 w-4" aria-hidden /> {label} ({files.length})
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">
          Con <b>{plan.readme.name}</b>: {notes ? 'la nota de Grabación y ' : ''}la lista de archivos. Los nombres no llevan fecha, hora ni lugar.
        </p>

        {present.length > 1 ? (
          <fieldset className="flex flex-col gap-1" disabled={running}>
            <legend className="mb-1 text-sm font-semibold">Qué bajar</legend>
            {present.map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-[15px]">
                <input type="checkbox" className="h-5 w-5 accent-accent" checked={kinds.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
                {MEDIA_KIND[k] ?? k} ({count(k)})
              </label>
            ))}
          </fieldset>
        ) : null}

        {warning ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-[15px] text-warn">{warning}</p>
        ) : null}

        <p className="text-sm text-text-2">{MODE_HINT[mode]}</p>

        {mode === 'ios-list' ? (
          <>
            {absentLine ? <p role="status" className="text-[15px] font-semibold">{absentLine}</p> : null}
            <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border">
              <li className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px]">{plan.readme.name}</span>
                <Button size="sm" variant="secondary" onClick={() => saveText(plan.readme.text, plan.readme.name)}>Bajar</Button>
              </li>
              {plan.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{e.name}</span>
                    <span className="block text-sm text-text-2">{sizeText(e.size)}</span>
                  </span>
                  {e.drive ? (
                    <Button size="sm" variant="secondary" onClick={() => void downloadDriveFile({ id: e.id, label: e.name, size: e.size })}>Bajar</Button>
                  ) : absent.has(e.id) ? (
                    <span className="shrink-0 text-sm text-text-2">{MISSING}</span>
                  ) : (
                    <a href={`/api/media/${e.id}`} download={e.name} className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-semibold hover:bg-surface-2">
                      Bajar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : running ? (
          <Button size="lg" variant="secondary" onClick={() => ctrl.current?.abort()}>
            <X className="h-5 w-5" aria-hidden /> Cancelar
          </Button>
        ) : (
          <Button size="lg" disabled={!plan.entries.length} onClick={() => void (mode === 'folder' ? toFolder() : oneByOne())}>
            <FolderDown className="h-5 w-5" aria-hidden />
            {mode === 'folder' ? (done ? 'Elegir la carpeta otra vez' : 'Elegir carpeta y descargar') : 'Descargar uno por uno'}
          </Button>
        )}

        {run?.stopped ? <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-[15px] text-danger">{run.stopped}</p> : null}

        {run && mode !== 'ios-list' ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold">{runHeadline(run)}</p>
            <ul className="flex flex-col gap-1 text-sm">
              <li className="flex items-center gap-2">
                {run.readme ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-2" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{plan.readme.name}</span>
              </li>
              {plan.entries.map((e, i) => {
                const s = run.files[i] ?? { phase: 'waiting', received: 0, total: null };
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    {s.phase === 'done' || s.phase === 'skipped' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                    ) : s.phase === 'downloading' ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-2" aria-hidden />
                    ) : (
                      <span className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <span className={cn('shrink-0', s.phase === 'error' ? 'text-danger' : 'text-text-2')}>
                      {run.sent && s.phase === 'done' ? 'Enviado' : fileStateText(s)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
