// «Descargar todo» into a folder (§5), against an in-memory folder that behaves like the browser's File System Access
// API: nothing reaches a file before close(), one writable per file, a file already there whole is skipped, a file
// cut halfway starts again, a demo file with nothing behind it is skipped, and the daily Drive share stops the run.
// The server is a fake fetch. All data here is invented.
import { describe, it, expect } from 'vitest';
import { folderSink, streamToSink, type FsDir, type FsFile, type FsWritable } from '@/lib/media/chunk-download';
import { buildDownloadPlan, type PlanFile } from '@/lib/media/download-plan';
import { pickFolder, sizeIn, writePlanToFolder, fileStateText } from '@/lib/media/folder-sink';

// ---------------------------------------------------------------------------
// The in-memory folder
// ---------------------------------------------------------------------------
class MemFile implements FsFile {
  bytes = new Uint8Array(0);
  writables = 0;
  constructor(readonly name: string) {}
  async getFile() {
    return new Blob([this.bytes]);
  }
  async createWritable(o?: { keepExistingData?: boolean }): Promise<FsWritable> {
    this.writables++;
    // Like the browser: writes go to a swap copy, and only close() puts it in the file.
    let swap = o?.keepExistingData ? [this.bytes] : ([] as Uint8Array[]);
    let open = true;
    return {
      write: async (d) => {
        if (!open) throw new Error('closed');
        swap.push(new Uint8Array(d));
      },
      close: async () => {
        open = false;
        const n = swap.reduce((a, b) => a + b.length, 0);
        const out = new Uint8Array(n);
        let at = 0;
        for (const b of swap) {
          out.set(b, at);
          at += b.length;
        }
        this.bytes = out;
      },
      abort: async () => {
        open = false;
        swap = [];
      },
    };
  }
}

class MemDir implements FsDir {
  dirs = new Map<string, MemDir>();
  files = new Map<string, MemFile>();
  async getDirectoryHandle(n: string, o?: { create?: boolean }) {
    let d = this.dirs.get(n);
    if (!d) {
      if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      d = new MemDir();
      this.dirs.set(n, d);
    }
    return d;
  }
  async getFileHandle(n: string, o?: { create?: boolean }) {
    let f = this.files.get(n);
    if (!f) {
      if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      f = new MemFile(n);
      this.files.set(n, f);
    }
    return f;
  }
  at(path: string): MemFile | undefined {
    const parts = path.split('/');
    let d: MemDir | undefined = this as MemDir;
    for (const p of parts.slice(0, -1)) d = d?.dirs.get(p);
    return d?.files.get(parts.at(-1)!);
  }
}

// ---------------------------------------------------------------------------
// The fake server: /api/media/<id> answers with each file's bytes (ranged for Drive files).
// ---------------------------------------------------------------------------
const bytesOf = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 256);
type Answer = { bytes?: Uint8Array<ArrayBuffer>; status?: number; body?: string };
function server(answers: Record<string, Answer>) {
  const asked: { id: string; range: string | null }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const id = url.split('/').pop()!;
    const range = (init.headers as Record<string, string> | undefined)?.Range ?? null;
    asked.push({ id, range });
    const a = answers[id];
    if (!a) return new Response('No encontrado', { status: 404 });
    if (a.status && a.status !== 200) return new Response(a.body ?? '', { status: a.status });
    const b = a.bytes!;
    const m = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
    if (m) {
      const start = Number(m[1]);
      const end = Math.min(Number(m[2]), b.length - 1);
      return new Response(b.slice(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${b.length}` } });
    }
    return new Response(b, { status: 200, headers: { 'content-length': String(b.length), 'content-type': 'video/mp4' } });
  };
  return { fetcher, asked };
}

const file = (id: string, kind: string, label: string, size: number, drive = false, ext = 'mp4'): PlanFile => ({ id, kind, label, ext, size, drive });
const noWait = async () => {};

describe('un archivo en la carpeta elegida', () => {
  it('se escribe con UN writable por archivo y solo llega a la carpeta al cerrar; cancelar no deja nada a medias', async () => {
    const dir = new MemDir();
    const s = folderSink(dir, 'clip.mp4');
    await s.append(bytesOf(10));
    await s.append(bytesOf(5, 3));
    expect(await s.size()).toBe(15);
    expect(dir.files.get('clip.mp4')!.bytes.length).toBe(0); // not yet
    await s.close();
    expect(dir.files.get('clip.mp4')!.bytes.length).toBe(15);
    expect(dir.files.get('clip.mp4')!.writables).toBe(1);
    const again = folderSink(dir, 'clip.mp4');
    await again.append(bytesOf(4));
    await again.abort();
    expect(dir.files.get('clip.mp4')!.bytes.length).toBe(15); // what was there stays
    // An empty file is still written.
    const empty = folderSink(dir, 'vacio.txt');
    await empty.close();
    expect(await sizeIn(dir, 'vacio.txt')).toBe(0);
    expect(await sizeIn(dir, 'no-esta.txt')).toBeNull();
  });

  it('streamToSink baja de un tirón un archivo que no está en Drive; un corte o un 404 son errores con su estado', async () => {
    const dir = new MemDir();
    const { fetcher } = server({ ok: { bytes: bytesOf(300) }, gone: { status: 404, body: 'Archivo de demostración: no hay un archivo real detrás.' } });
    const s = folderSink(dir, 'a.mp4');
    const r = await streamToSink('/api/media/ok', { sink: s, fetcher });
    await s.close();
    expect(r.total).toBe(300);
    expect(dir.files.get('a.mp4')!.bytes).toEqual(bytesOf(300));
    await expect(streamToSink('/api/media/gone', { sink: folderSink(dir, 'b.mp4'), fetcher })).rejects.toMatchObject({ status: 404, fatal: true });
    const short = async () => new Response(bytesOf(10), { status: 200, headers: { 'content-length': '20' } });
    await expect(streamToSink('/x', { sink: folderSink(dir, 'c.mp4'), fetcher: short })).rejects.toMatchObject({ message: 'Se cortó la descarga. Vuelve a intentarlo.' });
  });
});

describe('todo el plan en la carpeta', () => {
  const FILES = [
    file('sb', 'storyboard', 'Storyboard 1', 50, false, 'jpg'),
    file('j1', 'boss', 'Jefe hablando 1', 9 * 1024 * 1024 + 17, true), // Drive: in 4 MiB pieces
    file('d1', 'drone', 'Dron 1', 700),
  ];
  const plan = buildDownloadPlan({ title: 'Visita de prueba', code: 'E-0007', files: FILES, notes: [{ kind: 'editor_note', body: 'Usa el segundo clip (demo).', author: 'Kevin' }] });
  const answers = { sb: { bytes: bytesOf(50) }, j1: { bytes: bytesOf(9 * 1024 * 1024 + 17, 5) }, d1: { bytes: bytesOf(700, 9) } };

  it('deja el LEEME y cada archivo en su subcarpeta, con los nombres del plan; Drive va por partes', async () => {
    const root = new MemDir();
    const { fetcher, asked } = server(answers);
    const seen: string[] = [];
    const r = await writePlanToFolder(root, plan, { fetcher, waitForRetry: noWait, onFile: (i, s) => seen.push(`${i}:${s.phase}`) });
    expect(r).toMatchObject({ readme: true, stopped: null, cancelled: false });
    expect(r.files.map((f) => f.phase)).toEqual(['done', 'done', 'done']);
    const readme = new TextDecoder().decode(root.at('E-0007/E-0007-LEEME.txt')!.bytes);
    expect(readme).toContain('Kevin: Usa el segundo clip (demo).');
    expect(readme).toContain('Dron/E-0007-Dron-1.mp4');
    expect(root.at('E-0007/Storyboard/E-0007-Storyboard-1.jpg')!.bytes).toEqual(bytesOf(50));
    // (Compared as buffers: a 9 MB array compared item by item takes the whole memory.)
    expect(Buffer.from(root.at('E-0007/Jefe-hablando/E-0007-Jefe-hablando-1.mp4')!.bytes).equals(Buffer.from(answers.j1.bytes))).toBe(true);
    expect(root.at('E-0007/Dron/E-0007-Dron-1.mp4')!.bytes.length).toBe(700);
    // One writable per file, however many pieces.
    expect(root.at('E-0007/Jefe-hablando/E-0007-Jefe-hablando-1.mp4')!.writables).toBe(1);
    expect(asked.filter((a) => a.id === 'j1').map((a) => a.range)).toEqual(['bytes=0-4194303', 'bytes=4194304-8388607', 'bytes=8388608-9437200']);
    expect(asked.filter((a) => a.id !== 'j1').every((a) => a.range === null)).toBe(true);
    expect(seen).toContain('1:downloading');
    expect(fileStateText(r.files[0])).toBe('Listo');
  });

  it('otra vez en la misma carpeta: lo que ya está entero no se baja; lo que quedó a medias empieza de cero', async () => {
    const root = new MemDir();
    const { fetcher } = server(answers);
    await writePlanToFolder(root, plan, { fetcher, waitForRetry: noWait });
    // The drone clip got cut on another run: shorter than it should be.
    root.at('E-0007/Dron/E-0007-Dron-1.mp4')!.bytes = bytesOf(100, 9);
    const second = server(answers);
    const r = await writePlanToFolder(root, plan, { fetcher: second.fetcher, waitForRetry: noWait });
    expect(r.files.map((f) => f.phase)).toEqual(['skipped', 'skipped', 'done']);
    expect(second.asked.map((a) => a.id)).toEqual(['d1']);
    expect(root.at('E-0007/Dron/E-0007-Dron-1.mp4')!.bytes).toEqual(bytesOf(700, 9));
    expect(fileStateText(r.files[0])).toBe('Ya estaba en la carpeta');
  });

  it('un archivo de la demo sin nada detrás se salta y sigue; el cupo de hoy de Drive detiene todo con su frase', async () => {
    const root = new MemDir();
    const share = 'Ya usaste tu cupo de hoy para ver y descargar videos. Mañana sigue, o pídeselo a Administración.';
    const { fetcher, asked } = server({ sb: { status: 404, body: 'Archivo de demostración: no hay un archivo real detrás.' }, j1: { status: 429, body: share }, d1: answers.d1 });
    const r = await writePlanToFolder(root, plan, { fetcher, waitForRetry: noWait });
    expect(r.files.map((f) => f.phase)).toEqual(['missing', 'error', 'waiting']);
    expect(r.stopped).toBe(share);
    expect(asked.map((a) => a.id)).toEqual(['sb', 'j1']); // the drone clip was never asked for
    // Nothing half-written is left behind.
    expect(root.at('E-0007/Storyboard/E-0007-Storyboard-1.jpg')?.bytes.length ?? 0).toBe(0);
    expect(root.at('E-0007/Jefe-hablando/E-0007-Jefe-hablando-1.mp4')?.bytes.length ?? 0).toBe(0);
  });

  it('«Cancelar» detiene la tanda y no deja el archivo en curso a medias', async () => {
    const root = new MemDir();
    const ctrl = new AbortController();
    const { fetcher } = server(answers);
    const slow = async (url: string, init: RequestInit) => {
      if (url.endsWith('/j1') && (init.headers as Record<string, string>).Range === 'bytes=4194304-8388607') ctrl.abort();
      return fetcher(url, init);
    };
    const r = await writePlanToFolder(root, plan, { fetcher: slow, signal: ctrl.signal, waitForRetry: noWait });
    expect(r.cancelled).toBe(true);
    expect(r.files.map((f) => f.phase)).toEqual(['done', 'waiting', 'waiting']);
    expect(root.at('E-0007/Jefe-hablando/E-0007-Jefe-hablando-1.mp4')?.bytes.length ?? 0).toBe(0);
    expect(root.at('E-0007/Dron/E-0007-Dron-1.mp4')).toBeUndefined();
  });
});

describe('el selector de carpetas', () => {
  it('se abre con la carpeta de descargas; cerrarlo sin elegir no es un error; sin selector, null', async () => {
    const opts: unknown[] = [];
    const dir = new MemDir();
    expect(await pickFolder({ showDirectoryPicker: async (o) => (opts.push(o), dir) })).toBe(dir);
    expect(opts).toEqual([{ id: 'fb-material', mode: 'readwrite', startIn: 'downloads' }]);
    const closed = async () => {
      throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    };
    expect(await pickFolder({ showDirectoryPicker: closed })).toBeNull();
    expect(await pickFolder({})).toBeNull();
    expect(await pickFolder(undefined)).toBeNull();
  });
});
