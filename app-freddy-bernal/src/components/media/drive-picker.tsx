'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { drivePickerConfig, registerDriveFile, saveDriveProbe } from '@/lib/actions/drive';
import { pickedIds, pickerMimeTypes, pickProgress, pickSummary } from '@/lib/media/drive-picker-core';
import { probeRemote } from '@/lib/media/probe';
import { Button } from '@/components/ui/button';
import { dialogPanelClass } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';

// «Elegir de Drive»: only rendered for Administración with Drive connected. The Google Picker
// runs in the admin's browser with a short-lived drive.file token (held here, in memory, for this
// one pick); it returns file ids only, and the server reads the rest from Drive. Everyone else
// uploads and downloads through the platform and never gets a Google token.

export type PickedAsset = { id: string; mime: string; size: number };

type PickerConfig = { accessToken: string; apiKey: string; appId: string };

type DocsView = { setIncludeFolders(v: boolean): DocsView; setSelectFolderEnabled(v: boolean): DocsView; setMimeTypes(m: string): DocsView };
type Builder = {
  addView(v: DocsView): Builder;
  setOAuthToken(t: string): Builder;
  setDeveloperKey(k: string): Builder;
  setAppId(id: string): Builder;
  setLocale(l: string): Builder;
  setTitle(t: string): Builder;
  enableFeature(f: unknown): Builder;
  setCallback(cb: (data: Record<string, unknown>) => void): Builder;
  build(): { setVisible(v: boolean): void; dispose?: () => void };
};
type PickerNs = {
  DocsView: new (viewId?: unknown) => DocsView;
  ViewId: { DOCS: unknown };
  PickerBuilder: new () => Builder;
  Feature: { MULTISELECT_ENABLED: unknown };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
};
type GapiWindow = { gapi?: { load: (name: string, o: { callback: () => void; onerror: () => void }) => void }; google?: { picker?: PickerNs } };

let loading: Promise<PickerNs> | null = null;
function loadPicker(): Promise<PickerNs> {
  loading ??= new Promise<PickerNs>((resolve, reject) => {
    const w = window as unknown as GapiWindow;
    const fail = () => {
      loading = null;
      reject(new Error('picker'));
    };
    const ready = () => w.gapi!.load('picker', { callback: () => (w.google?.picker ? resolve(w.google.picker) : fail()), onerror: fail });
    if (w.gapi) return ready();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true;
    s.onload = ready;
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return loading;
}

function openPicker(g: PickerNs, cfg: PickerConfig, kind: string, multiple: boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const view = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(pickerMimeTypes(kind));
    let b = new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setLocale('es-419')
      .setTitle(multiple ? 'Elige los archivos' : 'Elige el archivo')
      .setCallback((data) => {
        const action = data[g.Response.ACTION];
        if (action === g.Action.PICKED) resolve(pickedIds(data[g.Response.DOCUMENTS]));
        else if (action === g.Action.CANCEL) resolve([]);
      });
    if (multiple) b = b.enableFeature(g.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}

/**
 * Drive does not give fps or codecs: after files are added from Drive, read them from each video
 * itself (MediaInfo over ranged reads through the platform) so the per-network rules can check
 * them. Best effort: if it fails, the rules say to check by hand, as before.
 */
export async function probeAdded(items: PickedAsset[]) {
  for (const a of items) {
    if (!a.mime.startsWith('video/')) continue;
    const p = await probeRemote(`/api/media/${a.id}`, a.size, a.mime);
    if (p && (p.videoCodec || p.fps)) {
      await saveDriveProbe({ id: a.id, probe: { durationS: p.durationS, width: p.width, height: p.height, fps: p.fps, videoCodec: p.videoCodec, audioCodec: p.audioCodec } }).catch(() => null);
    }
  }
}

export function DrivePicker({
  eventId, kind, multiple = true, label = 'Elegir de Drive', compact, onPicked,
}: { eventId: string | null; kind: string; multiple?: boolean; label?: string; compact?: boolean; onPicked?: (a: PickedAsset) => void }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  // The in-memory Drive of the demo (DRIVE_FAKE=1) has no Google Picker: a box for a file id.
  const [fakeCfg, setFakeCfg] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const fakeId = useRef<HTMLInputElement>(null);
  const titleId = useId();
  // Opened once React has put the dialog on the page (an animation frame can come first).
  useEffect(() => {
    if (fakeCfg && !dialog.current?.open) dialog.current?.showModal();
  }, [fakeCfg]);

  async function register(ids: string[]) {
    const added: PickedAsset[] = [];
    let failed = 0;
    let firstError: string | null = null;
    for (let n = 0; n < ids.length; n++) {
      setProgress(pickProgress(n, ids.length));
      const r = await registerDriveFile({ fileId: ids[n], eventId, kind }).catch(() => ({ ok: false as const, error: 'No se pudo agregar. Revisa la señal y vuelve a intentar.' }));
      if (r.ok && r.data) {
        added.push(r.data);
        onPicked?.(r.data);
      } else if (!r.ok) {
        failed++;
        firstError ??= r.error;
      }
    }
    setProgress(null);
    const sum = pickSummary(added.length, failed, firstError);
    if (sum.ok) toast.success(sum.text);
    else toast.error(sum.text);
    router.refresh();
    await probeAdded(added);
  }

  async function start() {
    setProgress('Abriendo Drive…');
    try {
      const cfg = await drivePickerConfig({});
      if (!cfg.ok || !cfg.data) {
        setProgress(null);
        toast.error(cfg.ok ? 'No se pudo abrir Drive.' : cfg.error);
        return;
      }
      if (cfg.data.apiKey === 'fake-picker-key') {
        setProgress(null);
        setFakeCfg(true);
        return;
      }
      const g = await loadPicker();
      setProgress(null);
      const ids = await openPicker(g, cfg.data, kind, multiple);
      if (ids.length) await register(ids);
    } catch {
      setProgress(null);
      toast.error('No se pudo abrir Drive. Revisa la señal y vuelve a intentar.');
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" disabled={progress !== null} onClick={start} className={cn('w-full sm:w-auto', compact ? '' : 'min-h-12')}>
        <HardDrive className="h-4 w-4" aria-hidden /> {progress ?? label}
      </Button>
      {fakeCfg ? (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          onClose={() => setFakeCfg(false)}
          className={dialogPanelClass}
        >
          <form
            method="dialog"
            onSubmit={(e) => {
              const v = fakeId.current?.value.trim() ?? '';
              if (!v) return e.preventDefault();
              void register(v.split(/[\s,]+/).filter(Boolean));
            }}
          >
            <h2 id={titleId} className="text-lg font-semibold">Drive de prueba</h2>
            <p className="mt-1 text-[15px] text-text-2">Aquí no hay Google: escribe el id de un archivo del Drive de prueba.</p>
            <label className="mt-3 block text-sm font-semibold" htmlFor={`${titleId}-id`}>Id del archivo</label>
            <input ref={fakeId} id={`${titleId}-id`} name="id" autoComplete="off" className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3" />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Cancelar</Button>
              <Button type="submit">Agregar</Button>
            </div>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
