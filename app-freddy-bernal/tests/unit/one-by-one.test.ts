// «Descargar todo» one by one (Android Chrome, Firefox, desktop Safari; revisión de la ola D): when the person's daily
// Drive share runs out (429) it stops like the folder does, says the server's sentence and leaves the rest «En
// espera», and it never says a plain «Listo» when a file did not come down. A file that is not in Drive is asked for
// first (HEAD): one with nothing behind it (the demo's sample videos) is counted, never handed to the browser as
// «Enviado» (auditoría del 28/10). The server is a fake fetch; the Drive files go through the real chunked download.
// All data here is invented.
import { describe, it, expect } from 'vitest';
import { downloadInChunks, memorySink } from '@/lib/media/chunk-download';
import { buildDownloadPlan, type PlanEntry, type PlanFile } from '@/lib/media/download-plan';
import { fileStateText } from '@/lib/media/folder-sink';
import { checkStored, driveOutcome, runHeadline, sendPlanOneByOne } from '@/lib/media/one-by-one';

const SHARE = 'Ya usaste tu cupo de hoy para bajar archivos de Drive. Mañana se renueva.';
const bytesOf = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256);

function server(answers: Record<string, { status: number; body?: string } | 'ok'>) {
  const asked: string[] = [];
  const heads: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const id = url.split('/').pop()!;
    if (init.method === 'HEAD') heads.push(id);
    else asked.push(id);
    const a = answers[id];
    if (!a) return new Response('No encontrado', { status: 404 });
    if (a !== 'ok') return new Response(a.body ?? '', { status: a.status });
    const b = bytesOf(100);
    const m = /^bytes=(\d+)-(\d+)$/.exec((init.headers as Record<string, string>)?.Range ?? '');
    if (!m) return new Response(b, { status: 200 });
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), b.length - 1);
    return new Response(b.slice(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${b.length}` } });
  };
  return { fetcher, asked, heads };
}

const file = (id: string, kind: string, label: string, drive: boolean): PlanFile => ({ id, kind, label, ext: 'jpg', size: 100, drive });
const plan = (files: PlanFile[]) => buildDownloadPlan({ title: 'Visita de prueba (demo)', code: 'E-0099', files, notes: null, kinds: [...new Set(files.map((f) => f.kind))] });

// What the dialog does, minus the browser: Drive files in pieces through the fake server, others counted.
function sinks(fetcher: ReturnType<typeof server>['fetcher']) {
  const stored: string[] = [];
  return {
    stored,
    options: {
      stored: (e: PlanEntry) => stored.push(e.id),
      check: (e: PlanEntry) => checkStored(e.id, { fetcher }),
      drive: (e: PlanEntry) => driveOutcome(() => downloadInChunks(`/api/media/${e.id}`, { sink: memorySink(), fetcher, retryDelays: [] })),
      pause: async () => {},
    },
  };
}

describe('uno por uno, sin carpeta', () => {
  it('el cupo de hoy (429) detiene todo: no pide los demás archivos de Drive, dice la frase del servidor y no dice «Listo»', async () => {
    const p = plan([file('sb', 'storyboard', 'Storyboard', true), file('j1', 'boss', 'Jefe hablando', true), file('j2', 'boss', 'Jefe hablando', true), file('dr', 'drone', 'Dron', false)]);
    const { fetcher, asked } = server({ sb: { status: 429, body: SHARE }, j1: 'ok', j2: 'ok' });
    const { stored, options } = sinks(fetcher);
    const run = await sendPlanOneByOne(p, options);
    expect(run.stopped).toBe(SHARE);
    expect(asked).toEqual(['sb']); // the other Drive files are never asked for
    expect(stored).toEqual([]);
    expect(run.files.map(fileStateText)).toEqual([SHARE, 'En espera', 'En espera', 'En espera']);
    expect(runHeadline({ running: false, cancelled: false, stopped: run.stopped, sent: true, files: run.files })).toBe('Se detuvo antes de terminar.');
  });

  it('503 (Drive o el cupo del mes) y 401 también detienen; un 404 se salta y sigue', async () => {
    for (const status of [503, 401]) {
      const p = plan([file('a', 'boss', 'Jefe hablando', true), file('b', 'boss', 'Jefe hablando', true)]);
      const { fetcher, asked } = server({ a: { status, body: 'Drive no está conectado. Ya le avisamos a Administración.' }, b: 'ok' });
      const run = await sendPlanOneByOne(p, sinks(fetcher).options);
      expect(run.stopped, String(status)).toBeTruthy();
      expect(asked, String(status)).toEqual(['a']);
    }
    const p = plan([file('gone', 'boss', 'Jefe hablando', true), file('ok', 'boss', 'Jefe hablando', true)]);
    const run = await sendPlanOneByOne(p, sinks(server({ ok: 'ok' }).fetcher).options);
    expect(run.stopped).toBeNull();
    expect(run.files.map((f) => f.phase)).toEqual(['missing', 'done']);
    // Counted, not hidden under «Listo».
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: run.files })).toBe(
      'Listo: lo demás va a tus descargas. 1 archivo no se bajó porque no está guardado en la plataforma.',
    );
  });

  it('un archivo que falla por otra cosa se marca y sigue; el titular no dice «Listo»', async () => {
    const p = plan([file('bad', 'boss', 'Jefe hablando', true), file('ok', 'boss', 'Jefe hablando', true), file('pc', 'drone', 'Dron', false)]);
    const { stored, options } = sinks(server({ bad: { status: 500, body: 'Algo falló.' }, ok: 'ok', pc: 'ok' }).fetcher);
    const run = await sendPlanOneByOne(p, options);
    expect(run.stopped).toBeNull();
    expect(run.files.map((f) => f.phase)).toEqual(['error', 'done', 'done']);
    expect(stored).toEqual(['pc']);
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: run.files })).toBe('Algunos archivos no se bajaron. Vuelve a intentarlo con esos.');
  });

  it('«Cancelar» del diálogo para la lista; el «Cancelar» de un solo archivo salta ese y sigue', async () => {
    const c = new AbortController();
    const p = plan([file('a', 'boss', 'Jefe hablando', true), file('b', 'boss', 'Jefe hablando', true)]);
    const run = await sendPlanOneByOne(p, {
      signal: c.signal,
      stored: () => {},
      drive: async () => {
        c.abort();
        return { ok: false, status: null, message: 'Descarga cancelada.', cancelled: true };
      },
    });
    expect(run.cancelled).toBe(true);
    expect(run.files.map((f) => f.phase)).toEqual(['waiting', 'waiting']);
    expect(runHeadline({ running: false, cancelled: true, stopped: null, sent: true, files: run.files })).toBe('Se detuvo. Lo que ya bajó queda.');
    let first = true;
    const one = await sendPlanOneByOne(p, {
      stored: () => {},
      drive: async () => (first ? ((first = false), { ok: false, status: 429, message: SHARE, cancelled: true }) : { ok: true }),
    });
    expect(one.stopped).toBeNull();
    expect(one.files.map(fileStateText)).toEqual(['Lo cancelaste.', 'Listo']);
  });

  it('un archivo que no está en Drive se pregunta antes (HEAD): sin nada detrás no se manda al navegador ni dice «Enviado»', async () => {
    // The demo's seeded event: the storyboard has its picture; the three sample videos have no file behind them.
    const p = plan([file('sb', 'storyboard', 'Storyboard', false), file('j1', 'boss', 'Jefe hablando', false), file('d1', 'drone', 'Dron', false), file('a1', 'broll', 'Apoyo', false)]);
    const srv = server({ sb: 'ok', j1: { status: 404 }, d1: { status: 404 }, a1: { status: 410 } });
    const { stored, options } = sinks(srv.fetcher);
    const run = await sendPlanOneByOne(p, options);
    expect(srv.heads).toEqual(['sb', 'j1', 'd1', 'a1']);
    expect(srv.asked).toEqual([]); // the bytes go through the browser, never through this check
    expect(stored).toEqual(['sb']);
    expect(run.stopped).toBeNull();
    expect(run.files.map(fileStateText)).toEqual(['Listo', 'No hay un archivo detrás.', 'No hay un archivo detrás.', 'No hay un archivo detrás.']);
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: run.files })).toBe(
      'Listo: lo demás va a tus descargas. 3 archivos no se bajaron porque no están guardados en la plataforma.',
    );
    // None of them there: nothing but the LEEME, and it says so.
    const none = await sendPlanOneByOne(plan([file('j1', 'boss', 'Jefe hablando', false), file('d1', 'drone', 'Dron', false)]), sinks(srv.fetcher).options);
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: none.files })).toBe(
      'No se bajó ningún archivo: no están guardados en la plataforma. Solo el LEEME.',
    );
  });

  it('al preguntar: 401, 429 y 503 detienen la tanda; otra respuesta o la falta de señal marcan ese archivo y sigue', async () => {
    for (const [status, text] of [
      [401, 'Entra de nuevo.'],
      [429, 'Ya pediste muchos archivos seguidos. Espera unos minutos y vuelve a intentarlo.'],
      [503, 'La plataforma no responde ahora. Vuelve a intentarlo en unos minutos.'],
    ] as const) {
      const p = plan([file('a', 'drone', 'Dron', false), file('b', 'drone', 'Dron', false), file('c', 'drone', 'Dron', true)]);
      const srv = server({ a: { status }, b: 'ok', c: 'ok' });
      const { stored, options } = sinks(srv.fetcher);
      const run = await sendPlanOneByOne(p, options);
      expect(run.stopped, String(status)).toBe(text);
      expect(srv.heads, String(status)).toEqual(['a']);
      expect(srv.asked, String(status)).toEqual([]); // the Drive file is never asked for
      expect(stored, String(status)).toEqual([]);
      expect(run.files.map((f) => f.phase), String(status)).toEqual(['error', 'waiting', 'waiting']);
      expect(runHeadline({ running: false, cancelled: false, stopped: run.stopped, sent: true, files: run.files })).toBe('Se detuvo antes de terminar.');
    }
    const p = plan([file('a', 'drone', 'Dron', false), file('b', 'drone', 'Dron', false), file('c', 'drone', 'Dron', false)]);
    const stored: string[] = [];
    const answers: Record<string, number | null> = { a: 500, b: null, c: 200 };
    const run = await sendPlanOneByOne(p, { stored: (e) => stored.push(e.id), check: async (e) => answers[e.id], drive: async () => ({ ok: true }), pause: async () => {} });
    expect(run.stopped).toBeNull();
    expect(stored).toEqual(['c']);
    expect(run.files.map((f) => f.phase)).toEqual(['error', 'error', 'done']);
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: run.files })).toBe('Algunos archivos no se bajaron. Vuelve a intentarlo con esos.');
    // No signal at all: the check itself says null.
    expect(await checkStored('x', { fetcher: async () => Promise.reject(new TypeError('Failed to fetch')) })).toBeNull();
  });

  it('«Cancelar» mientras pregunta: ese archivo queda «En espera» y no se manda', async () => {
    const c = new AbortController();
    const stored: string[] = [];
    const p = plan([file('a', 'drone', 'Dron', false), file('b', 'drone', 'Dron', false)]);
    const run = await sendPlanOneByOne(p, {
      signal: c.signal,
      stored: (e) => stored.push(e.id),
      check: async () => (c.abort(), null),
      drive: async () => ({ ok: true }),
      pause: async () => {},
    });
    expect(run.cancelled).toBe(true);
    expect(stored).toEqual([]);
    expect(run.files.map((f) => f.phase)).toEqual(['waiting', 'waiting']);
  });

  it('la carpeta usa el mismo titular: «Listo» solo si todo bajó', () => {
    const done = { phase: 'done' as const, received: 1, total: 1 };
    expect(runHeadline({ running: true, cancelled: false, stopped: null, sent: false, files: [] })).toBe('Descargando…');
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: false, files: [done] })).toBe('Listo: todo está en la carpeta.');
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: false, files: [done, { phase: 'error', received: 0, total: null }] })).toBe(
      'Algunos archivos no se bajaron. Vuelve a intentarlo con esos.',
    );
    // What was already in the folder counts as there; a missing file is counted the same way as one by one.
    const skipped = { phase: 'skipped' as const, received: 1, total: 1 };
    const missing = { phase: 'missing' as const, received: 0, total: null };
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: false, files: [skipped, missing, missing] })).toBe(
      'Listo: lo demás está en la carpeta. 2 archivos no se bajaron porque no están guardados en la plataforma.',
    );
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: false, files: [missing] })).toBe(
      'No se bajó ningún archivo: no está guardado en la plataforma. Solo el LEEME.',
    );
  });
});
