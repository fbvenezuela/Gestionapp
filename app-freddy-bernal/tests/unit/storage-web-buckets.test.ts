// The website's two logical buckets on this machine (design §6): a folder each, keys only in the database's shape
// (nothing can leave its folder), atomic writes; the public library served for a year, the private files never cached,
// always with the sandbox headers, a PDF always downloaded; the scan rule (production serves only «limpio», the demo
// also «sin_analizar» with a warning, never «cuarentena» or «infectado»); and clamd's INSTREAM protocol against a fake
// socket (no network): the bytes in chunks with their lengths, the end mark, and each kind of answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, describe, expect, it } from 'vitest';
import { KEY_PATTERN, localBucket, mimeOfKey, publicFileUrl } from '@/lib/storage/buckets';
import { localFilesRoot } from '@/lib/storage/local-files';
import { ScannerError, clamavScanner, clamdInstream, downloadGate, initialScanStatus, parseClamdReply, type SocketLike } from '@/lib/storage/scanner';
import { downloadName, servePrivateFile } from '@/lib/storage/serve-files';
import { servePublicFile } from '@/lib/storage/serve-public-file';
import { JPEG } from './fixtures/photos';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-buckets-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const KEY = '0b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3';

describe('las carpetas de los dos baldes', () => {
  it('guarda, lee, sabe si está y borra; cada balde en su carpeta', async () => {
    const pub = localBucket('web-public', root);
    const priv = localBucket('participacion-privado', root);
    await pub.put(`${KEY}.jpg`, JPEG, 'image/jpeg');
    expect(Buffer.from((await pub.read(`${KEY}.jpg`))!).equals(Buffer.from(JPEG))).toBe(true);
    expect(await pub.exists(`${KEY}.jpg`)).toBe(true);
    expect(await priv.exists(`${KEY}.jpg`)).toBe(false);
    expect(fs.existsSync(path.join(root, 'web-public', `${KEY}.jpg`))).toBe(true);
    // Writing again replaces it (never a half-written file: a temporary name and a rename).
    await pub.put(`${KEY}.jpg`, JPEG.subarray(0, 10), 'image/jpeg');
    expect((await pub.read(`${KEY}.jpg`))!.length).toBe(10);
    expect(fs.readdirSync(path.join(root, 'web-public')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    await pub.remove(`${KEY}.jpg`);
    expect(await pub.read(`${KEY}.jpg`)).toBeNull();
  });

  it('solo claves con la forma de la base: nada sale de su carpeta, avif no es un adjunto', async () => {
    const priv = localBucket('participacion-privado', root);
    for (const bad of ['../web-public/x.jpg', `${KEY}.exe`, `${KEY}.JPG`, `/${KEY}.jpg`, `${KEY}.jpg/..`, '', `${KEY}.avif`]) {
      await expect(priv.put(bad, JPEG, 'image/jpeg'), bad).rejects.toThrow(/bad key/);
      await expect(priv.read(bad), bad).rejects.toThrow(/bad key/);
    }
    expect(KEY_PATTERN['web-public'].test(`${KEY}.avif`)).toBe(true);
    expect(mimeOfKey(`${KEY}.pdf`)).toBe('application/pdf');
    expect(mimeOfKey(`${KEY}.webp`)).toBe('image/webp');
  });

  it('en la demo, bajo LOCAL_DATA_DIR/files si está, si no en el disco temporal; la dirección pública es la ruta propia', () => {
    expect(localFilesRoot('./.data')).toBe(path.resolve('./.data', 'files'));
    expect(localFilesRoot('')).toBe(path.join(os.tmpdir(), 'fb-demo-files'));
    expect(publicFileUrl(`${KEY}.jpg`)).toBe(`/api/archivos/web/${KEY}.jpg`);
    expect(publicFileUrl('../../etc/passwd')).toBe('');
  });
});

describe('servir los archivos', () => {
  it('la biblioteca pública: un año en caché, inmutable; la foto con sandbox, el PDF para leer en el navegador', async () => {
    const key = `${KEY.slice(0, -1)}9.jpg`;
    await localBucket('web-public').put(key, JPEG, 'image/jpeg');
    const r = await servePublicFile(key);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(JPEG))).toBe(true);
    const pdfKey = `${KEY.slice(0, -1)}8.pdf`;
    await localBucket('web-public').put(pdfKey, new TextEncoder().encode('%PDF-1.4\n%%EOF\n'), 'application/pdf');
    const pdf = await servePublicFile(pdfKey);
    expect(pdf.headers.get('Content-Disposition')).toBe(`inline; filename="${pdfKey}"`);
    expect((await servePublicFile('../secreto.jpg')).status).toBe(404);
    expect((await servePublicFile(`${KEY.slice(0, -1)}7.jpg`)).status).toBe(404);
  });

  it('un archivo privado: sin caché, sin índice, con sandbox; la foto se puede ver, el PDF siempre se descarga', async () => {
    const key = `${KEY.slice(0, -1)}6.jpg`;
    await localBucket('participacion-privado').put(key, JPEG, 'image/jpeg');
    const r = await servePrivateFile({ storageKey: key, scanStatus: 'limpio', name: 'AC-2026-K7QM2H-1', inline: true });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(r.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(r.headers.get('Content-Disposition')).toBe('inline; filename="AC-2026-K7QM2H-1.jpg"');
    expect(r.headers.get('X-Archivo-Aviso')).toBeNull();
    const pdfKey = `${KEY.slice(0, -1)}5.pdf`;
    await localBucket('participacion-privado').put(pdfKey, new TextEncoder().encode('%PDF-1.4\n'), 'application/pdf');
    const pdf = await servePrivateFile({ storageKey: pdfKey, scanStatus: 'limpio', name: 'acta', inline: true });
    expect(pdf.headers.get('Content-Disposition')).toBe('attachment; filename="acta.pdf"');
    // The demo serves «sin analizar» with its warning; never quarantine or infected.
    expect((await servePrivateFile({ storageKey: key, scanStatus: 'sin_analizar', name: 'x' })).headers.get('X-Archivo-Aviso')).toBe('sin-analizar');
    expect((await servePrivateFile({ storageKey: key, scanStatus: 'cuarentena', name: 'x' })).status).toBe(423);
    const infected = await servePrivateFile({ storageKey: key, scanStatus: 'infectado', name: 'x' });
    expect(infected.status).toBe(423);
    expect(await infected.text()).toMatch(/algo peligroso/);
    expect((await servePrivateFile({ storageKey: `${KEY.slice(0, -1)}4.jpg`, scanStatus: 'limpio', name: 'x' })).status).toBe(404);
    expect((await servePrivateFile({ storageKey: '../x.jpg', scanStatus: 'limpio', name: 'x' })).status).toBe(404);
  });

  it('el nombre de la descarga: sin tildes ni símbolos, con la extensión de la clave', () => {
    expect(downloadName('AC-2026-K7QM2H-2', `${KEY}.pdf`)).toBe('AC-2026-K7QM2H-2.pdf');
    expect(downloadName('Acta «de» entrega / ñ', `${KEY}.jpg`)).toBe('Acta-de-entrega-n.jpg');
    expect(downloadName('///', `${KEY}.png`)).toBe('archivo.png');
  });
});

describe('la revisión de los archivos', () => {
  it('con revisor entra en cuarentena; sin revisor, sin analizar', () => {
    expect(initialScanStatus('clamav')).toBe('cuarentena');
    expect(initialScanStatus('none')).toBe('sin_analizar');
  });

  it('producción sirve solo lo limpio; la demo también lo sin analizar, con aviso; nunca cuarentena ni infectado', () => {
    expect(downloadGate('limpio', 'supabase')).toEqual({ ok: true, warning: null });
    expect(downloadGate('sin_analizar', 'supabase')).toMatchObject({ ok: false });
    expect(downloadGate('sin_analizar', 'demo')).toMatchObject({ ok: true, warning: expect.stringMatching(/sin analizar/i) });
    for (const mode of ['demo', 'supabase'] as const) {
      expect(downloadGate('cuarentena', mode).ok, mode).toBe(false);
      expect(downloadGate('infectado', mode).ok, mode).toBe(false);
    }
  });
});

// A socket that records what the scanner writes and answers like clamd (or not at all).
class FakeSocket extends EventEmitter implements SocketLike {
  written: Buffer[] = [];
  destroyed = false;
  constructor(private reply: ((all: Buffer) => string | null) | null, private fail?: Error) {
    super();
    queueMicrotask(() => (this.fail ? this.emit('error', this.fail) : this.emit('connect')));
  }
  write(d: Uint8Array | string) {
    this.written.push(Buffer.from(d));
    const all = Buffer.concat(this.written);
    // The end of the stream: a zero length after the command.
    if (this.reply && all.length >= 14 && all.subarray(all.length - 4).equals(Buffer.alloc(4))) {
      const answer = this.reply(all);
      if (answer !== null) queueMicrotask(() => this.emit('data', Buffer.from(`${answer}\0`)));
    }
    return true;
  }
  end() {
    return this;
  }
  destroy() {
    this.destroyed = true;
    return this;
  }
}

/** The file clamd would rebuild from the INSTREAM chunks. */
function unframe(all: Buffer): { command: string; chunks: number[]; body: Buffer } {
  const command = all.subarray(0, 10).toString('latin1');
  const chunks: number[] = [];
  const parts: Buffer[] = [];
  for (let at = 10; at < all.length; ) {
    const len = all.readUInt32BE(at);
    at += 4;
    chunks.push(len);
    if (len === 0) break;
    parts.push(all.subarray(at, at + len));
    at += len;
  }
  return { command, chunks, body: Buffer.concat(parts) };
}

describe('clamd por TCP (INSTREAM), contra un socket falso', () => {
  const opts = (sock: () => FakeSocket, extra = {}) => ({ host: 'clamav', port: 3310, timeoutMs: 500, connect: () => sock(), ...extra });

  it('manda el comando, el archivo en partes con su largo y el cero final; «stream: OK» es limpio', async () => {
    let seen: ReturnType<typeof unframe> | null = null;
    let socket!: FakeSocket;
    const bytes = new Uint8Array(150_000).map((_, i) => i % 251);
    const r = await scanWith(bytes, opts(() => (socket = new FakeSocket((all) => ((seen = unframe(all)), 'stream: OK'))), { chunkBytes: 65_536 }));
    expect(r).toEqual({ status: 'limpio' });
    expect(seen!.command).toBe('zINSTREAM\0');
    expect(seen!.chunks).toEqual([65_536, 65_536, 18_928, 0]);
    expect(seen!.body.equals(Buffer.from(bytes))).toBe(true);
    expect(socket.destroyed).toBe(true);
  });

  it('«stream: … FOUND» es infectado, con la firma; un ERROR, un cierre sin respuesta, un error de red o el tiempo: falla (queda en cuarentena)', async () => {
    const eicar = new TextEncoder().encode('archivo de prueba');
    expect(await clamavScanner(opts(() => new FakeSocket(() => 'stream: Eicar-Signature FOUND'))).scan(eicar)).toEqual({ status: 'infectado', signature: 'Eicar-Signature' });
    await expect(clamavScanner(opts(() => new FakeSocket(() => 'INSTREAM size limit exceeded. ERROR'))).scan(eicar)).rejects.toThrow(ScannerError);
    await expect(clamavScanner(opts(() => new FakeSocket(null))).scan(eicar)).rejects.toThrow(/no respondió a tiempo/);
    await expect(clamavScanner(opts(() => new FakeSocket(null, new Error('ECONNREFUSED')))).scan(eicar)).rejects.toThrow(/ECONNREFUSED/);
    const closing = () => {
      const s = new FakeSocket(() => null);
      s.write = (d) => {
        s.written.push(Buffer.from(d));
        if (Buffer.concat(s.written).subarray(-4).equals(Buffer.alloc(4))) queueMicrotask(() => s.emit('end'));
        return true;
      };
      return s;
    };
    await expect(clamdInstream(eicar, opts(closing))).rejects.toThrow(/cerró sin responder/);
  });

  it('lee las respuestas de clamd', () => {
    expect(parseClamdReply('stream: OK')).toEqual({ status: 'limpio' });
    expect(parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND')).toEqual({ status: 'infectado', signature: 'Win.Test.EICAR_HDB-1' });
    expect(() => parseClamdReply('UNKNOWN COMMAND')).toThrow(ScannerError);
  });
});

function scanWith(bytes: Uint8Array, o: Parameters<typeof clamavScanner>[0]) {
  return clamavScanner(o).scan(bytes);
}
