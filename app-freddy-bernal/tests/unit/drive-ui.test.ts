// The browser side of Google Drive, with no browser and no network: the resumable uploader that
// sends a video straight to Google (against the fake Drive's own protocol), the downloader in
// pieces for slow lines, the Picker's choices and the plain words of «Probar».
import { describe, it, expect } from 'vitest';
import { resetFakeDrive, type FakeDrive } from '@/lib/storage/drive/fake';
import { DriveUpload, DriveUploadError, fetchTransport, readAnswer, receivedFromRange, type DriveUploadOptions, type Transport } from '@/lib/media/drive-upload';
import { downloadInChunks, downloadText, fileNameFrom, memorySink, nextRange, parseContentRange, pct, type DownloadState } from '@/lib/media/chunk-download';
import { importSummary, pickedIds, pickerMimeTypes, pickProgress, pickSummary, PICK_MAX } from '@/lib/media/drive-picker-core';
import { checkLine, checkSummary, gb, spaceLevel, type DriveCheckStep } from '@/lib/domain/drive-check';
import { checkVideo } from '@/lib/domain/video-rules';
import { mediaFailureText } from '@/components/media/media-preview';
import specs from '../../config/network-specs.json';

const KIB = 1024;
const bytes = (n: number, seed = 3) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 251);
const ORIGIN = 'http://localhost:3000';

// A resumable session in the fake, as the server would have opened it for this page.
async function session(fake: FakeDrive, size: number): Promise<string> {
  fake.accessTokens.add('tok-prueba');
  const id = (await (await fake.fetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1', { headers: { Authorization: 'Bearer tok-prueba' } })).json()).ids[0];
  const res = await fake.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok-prueba', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4', Origin: ORIGIN },
    body: JSON.stringify({ id, name: 'E-0001-Jefe-hablando-1.mp4', mimeType: 'video/mp4', appProperties: { fb360: 'media' } }),
  });
  return res.headers.get('location')!;
}

// The browser's PUTs, with the page's Origin, through the fake.
const transportFor = (fake: FakeDrive): Transport => fetchTransport((u, init) => fake.fetch(u, { ...init, headers: { ...(init.headers as Record<string, string>), Origin: ORIGIN } }));

function run(file: Blob, o: DriveUploadOptions): Promise<{ ok: boolean; error?: DriveUploadError; progress: number[]; retries: number }> {
  return new Promise((resolve) => {
    const progress: number[] = [];
    let retries = 0;
    const up = new DriveUpload(file, {
      retryDelays: [0, 0, 0, 0],
      reachable: async () => false,
      ...o,
      onProgress: (s) => progress.push(s),
      onShouldRetry: () => retries++,
      onSuccess: () => resolve({ ok: true, progress, retries }),
      onError: (error) => resolve({ ok: false, error, progress, retries }),
    });
    up.start();
  });
}

describe('subir directo a Drive desde el navegador', () => {
  it('manda el archivo por partes de 256 KiB exactos y Google lo arma entero', async () => {
    const fake = resetFakeDrive();
    const data = bytes(700 * KIB);
    const url = await session(fake, data.length);
    const r = await run(new Blob([data]), { endpoint: url, chunkSize: 256 * KIB, transport: transportFor(fake) });
    expect(r.ok).toBe(true);
    const f = [...fake.files.values()].find((x) => x.name === 'E-0001-Jefe-hablando-1.mp4')!;
    expect(Buffer.from(f.bytes).equals(Buffer.from(data))).toBe(true);
    // First it asks where Google stands, then 3 chunks (256 + 256 + 188 KiB).
    const puts = fake.calls('uploadChunk');
    expect(puts).toHaveLength(4);
    expect(r.progress.at(-1)).toBe(data.length);
    // No token travels with the chunks: the session URL is the only key.
    expect(puts.every((c) => !c.auth)).toBe(true);
  });

  it('si se corta la señal a mitad, pregunta dónde quedó y sigue desde ahí (sin repetir lo que llegó)', async () => {
    const fake = resetFakeDrive();
    const data = bytes(1024 * KIB, 9);
    const url = await session(fake, data.length);
    // Status ok, first chunk ok, then the line drops twice.
    let n = 0;
    const flaky: Transport = async (u, init) => {
      n++;
      if (n === 3 || n === 4) throw new TypeError('network');
      return transportFor(fake)(u, init);
    };
    const r = await run(new Blob([data]), { endpoint: url, chunkSize: 256 * KIB, transport: flaky });
    expect(r.ok).toBe(true);
    expect(r.retries).toBe(2);
    const f = [...fake.files.values()].find((x) => x.name.endsWith('.mp4'))!;
    expect(Buffer.from(f.bytes).equals(Buffer.from(data))).toBe(true);
    // Every chunk that carried bytes went once: after each cut it asked first («bytes */total»).
    const sent = fake.calls('uploadChunk').length;
    expect(sent).toBe(1 + 4 + 1); // first status + 4 chunks + one status after the cuts
  });

  it('pausar y seguir: lo que Google ya tiene no se vuelve a mandar', async () => {
    const fake = resetFakeDrive();
    const data = bytes(768 * KIB, 4);
    const url = await session(fake, data.length);
    let up!: DriveUpload;
    let chunks = 0;
    const done = new Promise<boolean>((resolve) => {
      const t = transportFor(fake);
      up = new DriveUpload(new Blob([data]), {
        endpoint: url,
        chunkSize: 256 * KIB,
        retryDelays: [0],
        transport: async (u, init) => {
          const res = await t(u, init);
          if (init.body && ++chunks === 1) up.abort(); // «Pausar» right after the first chunk
          return res;
        },
        onSuccess: () => resolve(true),
        onError: () => resolve(false),
      });
      up.start();
    });
    await new Promise((r) => setTimeout(r, 20));
    const session0 = [...fake.sessions.values()][0];
    expect(session0.offset).toBe(256 * KIB);
    up.start(); // «Seguir»
    expect(await done).toBe(true);
    expect([...fake.files.values()].some((f) => f.bytes.length === data.length)).toBe(true);
  });

  it('una subida vencida (Google ya no la conoce) dice que hay que volver a elegir el archivo', async () => {
    const fake = resetFakeDrive();
    const r = await run(new Blob([bytes(10)]), { endpoint: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=noexiste000', chunkSize: 256 * KIB, transport: transportFor(fake) });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('expired');
    expect(r.error?.message).toBe('La subida venció; vuelve a elegir el archivo.');
  });

  it('si Google falla al instante una y otra vez mientras la plataforma responde, avisa en vez de esperar sin fin', async () => {
    const r = await run(new Blob([bytes(10)]), {
      endpoint: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x',
      chunkSize: 256 * KIB,
      transport: async () => {
        throw new TypeError('cors');
      },
      reachable: async () => true,
      retryDelays: [0, 0, 0, 0, 0, 0],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('blocked');
    expect(r.error?.message).toMatch(/Avísale a Administración/);
  });

  it('sin señal (la plataforma tampoco responde) sigue esperando; nunca dice que Google lo bloquea', async () => {
    const r = await run(new Blob([bytes(10)]), {
      endpoint: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x',
      chunkSize: 256 * KIB,
      transport: async () => {
        throw new TypeError('offline');
      },
      reachable: async () => false,
      retryDelays: [0, 0, 0],
    });
    expect(r.error?.code).toBe('network');
    expect(r.retries).toBe(3);
  });

  it('las respuestas: 308 con Range, terminado, vencido y lento; por la plataforma, en JSON', () => {
    expect(receivedFromRange('bytes=0-262143')).toBe(262144);
    expect(receivedFromRange(null)).toBe(0);
    expect(readAnswer(false, { status: 308, range: 'bytes=0-99', body: '' }, 500)).toEqual({ done: false, received: 100 });
    expect(readAnswer(false, { status: 201, range: null, body: '{}' }, 500)).toEqual({ done: true, received: 500 });
    expect(() => readAnswer(false, { status: 410, range: null, body: '' }, 500)).toThrow('La subida venció');
    expect(() => readAnswer(false, { status: 503, range: null, body: '<html>' }, 500)).toThrow('Drive está lento');
    expect(readAnswer(true, { status: 200, range: null, body: '{"done":false,"received":1048576}' }, 5e6)).toEqual({ done: false, received: 1048576 });
    expect(readAnswer(true, { status: 200, range: null, body: '{"done":true,"received":5000000}' }, 5e6)).toEqual({ done: true, received: 5e6 });
    // The platform's own short sentence is shown; a page or a Google body never is.
    expect(() => readAnswer(true, { status: 503, range: null, body: 'Este mes ya se usó todo el cupo.' }, 5e6)).toThrow('Este mes ya se usó todo el cupo.');
    expect(() => readAnswer(true, { status: 503, range: null, body: '{"error":{"message":"x"}}' }, 5e6)).toThrow('Drive está lento');
    expect(() => readAnswer(true, { status: 401, range: null, body: '' }, 5e6)).toThrow('Entra de nuevo.');
    // The person's share for today is used up: a final answer with the platform's sentence, not a retry.
    let share: unknown;
    try {
      readAnswer(true, { status: 429, range: null, body: 'Ya usaste tu cupo de hoy de Drive.' }, 5e6);
    } catch (e) {
      share = e;
    }
    expect(share).toBeInstanceOf(DriveUploadError);
    expect((share as DriveUploadError).fatal).toBe(true);
    expect((share as DriveUploadError).message).toBe('Ya usaste tu cupo de hoy de Drive.');
  });
});

// A server answering Range like /api/media/[id] does for Drive: at most `cap` bytes per answer.
function rangeServer(data: Uint8Array, o: { cap?: number; failAt?: number[]; status?: (n: number) => number | null } = {}) {
  const cap = o.cap ?? 64 * KIB;
  let n = 0;
  const seen: string[] = [];
  const fetcher = async (_u: string, init: RequestInit) => {
    n++;
    if (o.failAt?.includes(n)) throw new TypeError('network');
    const forced = o.status?.(n);
    if (forced) return new Response(forced === 503 ? 'Drive está lento; intenta en un momento.' : 'Ese archivo ya no está en Drive. Avísale a Administración.', { status: forced });
    const r = (init.headers as Record<string, string>).Range;
    seen.push(r);
    const m = /^bytes=(\d+)-(\d+)$/.exec(r)!;
    const a = Number(m[1]);
    const b = Math.min(Number(m[2]), a + cap - 1, data.length - 1);
    if (a >= data.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${data.length}` } });
    return new Response(data.slice(a, b + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="E-0042-Jefe-hablando-1.mp4"' },
    });
  };
  return { fetcher, seen };
}

describe('descargar por partes (líneas lentas)', () => {
  it('pide tramos seguidos, aguanta respuestas más cortas que lo pedido y arma el archivo con su nombre', async () => {
    const data = bytes(300 * KIB);
    const srv = rangeServer(data, { cap: 64 * KIB });
    const sink = memorySink();
    const states: DownloadState[] = [];
    const r = await downloadInChunks('/api/media/x', { sink, chunk: 100 * KIB, fetcher: srv.fetcher, onState: (s) => states.push(s) });
    expect(r).toEqual({ name: 'E-0042-Jefe-hablando-1.mp4', type: 'video/mp4', total: data.length });
    const f = await sink.file(r.name, r.type);
    expect(Buffer.from(await f.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    expect(srv.seen[0]).toBe('bytes=0-102399');
    expect(states.at(-1)?.phase).toBe('saving');
  });

  it('sin señal espera y sigue desde lo que ya tenía; al volver a tocar, retoma lo guardado', async () => {
    const data = bytes(200 * KIB, 2);
    const srv = rangeServer(data, { cap: 50 * KIB, failAt: [2, 3] });
    const sink = memorySink();
    const waits: number[] = [];
    const states: string[] = [];
    await downloadInChunks('/api/media/x', { sink, fetcher: srv.fetcher, waitForRetry: async (ms) => void waits.push(ms), onState: (s) => states.push(downloadText(s)) });
    expect(waits).toHaveLength(2);
    expect(states).toContain('Sin señal: sigue sola cuando vuelva.');
    expect(await sink.size()).toBe(data.length);
    // Resume: a sink that already holds half asks only for the rest.
    const half = memorySink();
    await half.append(data.slice(0, 100 * KIB));
    const srv2 = rangeServer(data, { cap: 50 * KIB });
    await downloadInChunks('/api/media/x', { sink: half, fetcher: srv2.fetcher });
    expect(srv2.seen[0]).toBe(`bytes=${100 * KIB}-${100 * KIB + 4 * 1024 * KIB - 1}`);
    expect(Buffer.from(await (await half.file('a', 'b')).arrayBuffer()).equals(Buffer.from(data))).toBe(true);
  });

  it('Drive lento: reintenta y al final dice el mensaje de la plataforma; un archivo que ya no está, de una vez', async () => {
    const data = bytes(10 * KIB);
    const slow = rangeServer(data, { status: () => 503 });
    await expect(downloadInChunks('/api/media/x', { sink: memorySink(), fetcher: slow.fetcher, waitForRetry: async () => {} })).rejects.toThrow('Drive está lento; intenta en un momento.');
    const gone = rangeServer(data, { status: () => 410 });
    await expect(downloadInChunks('/api/media/x', { sink: memorySink(), fetcher: gone.fetcher, waitForRetry: async () => {} })).rejects.toThrow('Ese archivo ya no está en Drive. Avísale a Administración.');
  });

  it('lo guardado es más largo que el archivo: empieza de nuevo', async () => {
    const data = bytes(20 * KIB);
    const sink = memorySink();
    await sink.append(bytes(30 * KIB));
    const srv = rangeServer(data);
    await downloadInChunks('/api/media/x', { sink, fetcher: srv.fetcher, waitForRetry: async () => {} });
    expect(Buffer.from(await (await sink.file('a', 'b')).arrayBuffer()).equals(Buffer.from(data))).toBe(true);
  });

  it('cabeceras: tramo, nombre limpio y próximo pedido', () => {
    expect(parseContentRange('bytes 0-99/1000')).toEqual({ start: 0, end: 99, total: 1000 });
    expect(parseContentRange('bytes 5-1/10')).toBeNull();
    expect(parseContentRange('bytes */10')).toBeNull();
    expect(fileNameFrom('attachment; filename="E-0042-Jefe-hablando-1.mp4"')).toBe('E-0042-Jefe-hablando-1.mp4');
    expect(fileNameFrom('attachment; filename="../../etc/passwd"')).toBeNull();
    expect(fileNameFrom(null)).toBeNull();
    expect(nextRange(0, null, 100)).toBe('bytes=0-99');
    expect(nextRange(950, 1000, 100)).toBe('bytes=950-999');
    expect(pct({ phase: 'downloading', received: 45, total: 100 })).toBe(45);
    expect(downloadText({ phase: 'downloading', received: 81e6, total: 180e6 })).toBe('Descargando 45 % de 180 MB');
  });
});

describe('«Elegir de Drive»: lo que se le pide al Picker y lo que se toma', () => {
  it('cada tipo de material lista solo sus tipos de archivo, nunca páginas ni SVG', () => {
    expect(pickerMimeTypes('cover')).toBe('image/jpeg,image/png,image/webp');
    expect(pickerMimeTypes('boss')).toContain('video/mp4');
    expect(pickerMimeTypes('voice_line')).toContain('audio/mpeg');
    for (const k of ['boss', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'other']) expect(pickerMimeTypes(k)).not.toMatch(/svg|html|xml|javascript/);
  });

  it('solo ids válidos, una vez cada uno, sin carpetas y con un tope', () => {
    const docs = [
      { id: 'archivoValido0001', mimeType: 'video/mp4' },
      { id: 'archivoValido0001', mimeType: 'video/mp4' },
      { id: 'carpetaValida0001', mimeType: 'application/vnd.google-apps.folder' },
      { id: '../malo', mimeType: 'video/mp4' },
      { id: 42 },
      null,
      { id: 'archivoValido0002', type: 'video' },
    ];
    expect(pickedIds(docs)).toEqual(['archivoValido0001', 'archivoValido0002']);
    expect(pickedIds('nada')).toEqual([]);
    expect(pickedIds(Array.from({ length: 80 }, (_, i) => ({ id: `archivoValido${String(i).padStart(4, '0')}` })))).toHaveLength(PICK_MAX);
  });

  it('dice cuántos van y cómo terminó, en pocas palabras', () => {
    expect(pickProgress(2, 12)).toBe('Agregando 3 de 12…');
    expect(pickProgress(0, 1)).toBe('Agregando…');
    expect(pickSummary(1, 0, null)).toEqual({ ok: true, text: 'Listo: se agregó 1 archivo de Drive.' });
    expect(pickSummary(3, 0, null).text).toBe('Listo: se agregaron 3 archivos de Drive.');
    expect(pickSummary(0, 1, 'Ese archivo ya está en la plataforma.')).toEqual({ ok: false, text: 'Ese archivo ya está en la plataforma.' });
    expect(pickSummary(2, 1, 'Ese tipo de archivo no se puede guardar aquí.').text).toBe('Se agregaron 2; 1 no: Ese tipo de archivo no se puede guardar aquí.');
    expect(importSummary({ added: 0, failed: 0, error: null })).toEqual({ ok: true, text: 'No hay nada nuevo en la carpeta «Importado».' });
  });
});

describe('«Probar»: qué falta, en palabras', () => {
  const F = 'FB Operaciones 360';

  it('variables que faltan: dice cuáles y dónde se ponen', () => {
    const steps: DriveCheckStep[] = [{ key: 'config', level: 'fail', missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] }];
    const s = checkSummary(steps, F);
    expect(s.level).toBe('fail');
    expect(s.todo).toBe('Falta llenar en Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Ponlas en Settings → Environment Variables (solo Production) y vuelve a publicar.');
  });

  it('permiso vencido o clave cambiada: volver a conectar, sin perder nada', () => {
    expect(checkLine({ key: 'connection', level: 'fail', code: 'expired' }, F)).toBe('Se venció el permiso de Google. Toca «Conectar Drive» otra vez; no se pierde nada.');
    expect(checkLine({ key: 'connection', level: 'fail', code: 'bad_key' }, F)).toMatch(/DRIVE_TOKEN_KEY o SESSION_SECRET/);
    expect(checkLine({ key: 'connection', level: 'fail', code: 'not_connected' }, F)).toBe('Drive no está conectado. Toca «Conectar Drive».');
    expect(checkLine({ key: 'write', level: 'fail', code: 'full' }, F)).toMatch(/lleno/);
    expect(checkLine({ key: 'read', level: 'fail', code: 'mismatch' }, F)).toMatch(/volvió distinto/);
    // Anything unknown reads as «Google no respondió», never a code.
    expect(checkLine({ key: 'folder', level: 'fail', code: 'algo_raro' }, F)).toBe('Google no respondió. Intenta en un momento.');
  });

  it('espacio: aviso al 80 %, alto al 95 %; todo bien dice «Drive está listo»', () => {
    const G = 1024 ** 3;
    expect(spaceLevel(2.3 * G, 15 * G)).toBe('ok');
    expect(spaceLevel(12.5 * G, 15 * G)).toBe('warn');
    expect(spaceLevel(14.5 * G, 15 * G)).toBe('fail');
    expect(spaceLevel(100 * G, null)).toBe('ok');
    expect(gb(2.3 * G)).toBe('2,3 GB');
    expect(checkLine({ key: 'space', level: 'warn', usage: 12.5 * G, limit: 15 * G }, F)).toBe('Espacio: 13 GB usados de 15 GB. Ya va en 83 %: pronto hay que liberar espacio (Drive, Gmail y Fotos comparten los 15 GB).');
    const ok: DriveCheckStep[] = [
      { key: 'config', level: 'ok' },
      { key: 'connection', level: 'ok', account: 'cuenta@demo.test' },
      { key: 'space', level: 'ok', usage: 2.3 * G, limit: 15 * G },
      { key: 'folder', level: 'ok' },
      { key: 'write', level: 'ok' },
      { key: 'read', level: 'ok' },
      { key: 'direct', level: 'ok', message: 'Todo bien: los videos van del teléfono directo a Drive.' },
    ];
    expect(checkSummary(ok, F)).toEqual({ level: 'ok', title: 'Todo bien: Drive está listo', todo: null });
    expect(ok.map((s) => checkLine(s, F))).toEqual([
      'Las variables de Vercel están completas.',
      'Google responde. Cuenta: cuenta@demo.test.',
      'Espacio: 2,3 GB usados de 15 GB.',
      'La carpeta «FB Operaciones 360» está lista.',
      'Se subió un archivo de prueba.',
      'Se leyó de vuelta, igualito, y se mandó a la papelera.',
      'Todo bien: los videos van del teléfono directo a Drive.',
    ]);
  });
});

describe('reglas por red con los datos que da Drive', () => {
  const rule = (n: string, f: string) => (specs.specs.find((s) => s.network === n)!.formats as unknown as Record<string, object>)[f];

  it('un video elegido de Drive (solo duración y medidas): las medidas y la duración se revisan; el formato pide revisarlo a mano', () => {
    const fromDrive = { durationS: 58, width: 1080, height: 1920, fps: null, videoCodec: null, audioCodec: null, sizeBytes: 80e6 };
    const r = checkVideo('Instagram', 'reel', rule('instagram', 'reel'), fromDrive);
    expect(r.map((i) => i.text)).toEqual(['Instagram: no se pudo leer el formato del video (códec y cuadros por segundo). Revísalo a mano.']);
    expect(r[0].level).toBe('warn');
    // Never «no tiene audio» for a file that was never read.
    expect(r.some((i) => i.text.includes('no tiene audio'))).toBe(false);
    // The rules Drive's data can check still bite.
    const long = checkVideo('TikTok', 'video', rule('tiktok', 'video'), { ...fromDrive, durationS: 660 });
    expect(long.some((i) => i.level === 'error' && i.text.includes('11 minutos'))).toBe(true);
  });

  it('cuando la plataforma leyó el video (fps y códecs), se revisa todo como siempre', () => {
    const probed = { durationS: 58, width: 1080, height: 1920, fps: 30, videoCodec: 'avc', audioCodec: null, sizeBytes: 80e6 };
    const r = checkVideo('Instagram', 'reel', rule('instagram', 'reel'), probed);
    expect(r.map((i) => i.text)).toEqual(['Instagram: el video no tiene audio.']);
  });
});

describe('un video, foto o audio de Drive que no carga dice por qué', () => {
  const answer = (status: number, body: string) => async () => new Response(body, { status });

  it('muestra el mensaje corto de la plataforma (Drive caído, tope del mes o de la persona)', async () => {
    const asked: RequestInit[] = [];
    const msg = await mediaFailureText('/api/media/x?ver=1', 'video/mp4', (async (_u: RequestInfo | URL, init?: RequestInit) => {
      asked.push(init!);
      return new Response('Drive no está conectado. Ya le avisamos a Administración.', { status: 503 });
    }) as typeof fetch);
    expect(msg).toBe('Drive no está conectado. Ya le avisamos a Administración.');
    // Only the first byte is asked for.
    expect(asked[0].headers).toEqual({ Range: 'bytes=0-0' });
    expect(await mediaFailureText('/x', 'image/jpeg', answer(429, 'Ya usaste tu cupo de hoy.') as typeof fetch)).toBe('Ya usaste tu cupo de hoy.');
  });

  it('sin señal, o una respuesta que no es nuestra: una frase propia', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await mediaFailureText('/x', 'video/mp4', down)).toBe('No se pudo cargar el video. Revisa la señal o intenta más tarde.');
    expect(await mediaFailureText('/x', 'audio/mpeg', answer(502, '<html>Bad gateway</html>') as typeof fetch)).toBe('No se pudo cargar el audio. Revisa la señal o intenta más tarde.');
  });

  it('si el archivo está, el problema es del navegador', async () => {
    expect(await mediaFailureText('/x', 'video/quicktime', answer(206, 'x') as typeof fetch)).toBe('Este navegador no pudo abrir el video. Prueba en otro o descárgalo.');
  });
});

describe('ningún archivo de Drive se baja con un enlace simple', () => {
  // A plain <a href="/api/media/<id>"> sends no Range: for a Drive file that is one long answer
  // that Vercel cuts at 300 s on a slow line. Plain links stay only where the file is known not
  // to be in Drive (or to open a small evidence picture). A new one has to go through DownloadLink.
  const ALLOWED: Record<string, number> = {
    'src/components/media/drive-download.tsx': 1, // DownloadLink, branch for files not in Drive
    'src/app/(panel)/eventos/[id]/material-panel.tsx': 1, // after `drive ?` → DriveDownload
    'src/components/media/download-all.tsx': 1, // after the Drive files were taken out
    'src/app/(panel)/publicar/[id]/page.tsx': 1, // «Ver captura» (?ver=1, a small picture in a new tab)
  };

  it('solo quedan los enlaces simples revisados', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '../..');
    const found: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (/\.tsx?$/.test(e.name)) {
          const n = (fs.readFileSync(abs, 'utf8').match(/(href=\{`|\.href = `)\/api\/media\/\$\{/g) ?? []).length;
          if (n) found[path.relative(root, abs).split(path.sep).join('/')] = n;
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(found).toEqual(ALLOWED);
  });
});
