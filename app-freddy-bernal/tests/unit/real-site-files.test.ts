// The official site's photos and PDFs travel with the deployment (.real-site/media, written by the build) and the public
// files' route serves them from there, read-only, when the demo's own folder does not have them (src/lib/storage/
// serve-public-file.ts): the same key check, the same headers as any library file (a year in cache, a sandbox for pictures),
// nothing outside that folder however the key is written, only the keys the snapshot names and only while this server
// shows the real content; a saved PDF takes its item's name. Files made here (invented).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { REAL_SITE, mediaKey, realIds, sha256Of, type RealSnapshot } from '@/lib/web/real-site';
import { servePublicFile } from '@/lib/storage/serve-public-file';
import { pngOf } from './fixtures/web-png';
import { demoPdf } from '../fixtures/real-site/site';

let app: string;
let photoKey: string;
let pdfKey: string;
const photo = pngOf(200, 150);
const pdf = demoPdf();

beforeAll(() => {
  app = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-files-'));
  const media = path.join(app, REAL_SITE.dir, REAL_SITE.media);
  fs.mkdirSync(media, { recursive: true });
  photoKey = mediaKey(sha256Of(photo), 'png');
  pdfKey = mediaKey(sha256Of(pdf), 'pdf');
  fs.writeFileSync(path.join(media, photoKey), photo);
  fs.writeFileSync(path.join(media, pdfKey), pdf);
  // A file next to the folder, that no key may reach.
  fs.writeFileSync(path.join(app, REAL_SITE.dir, 'snapshot.json'), '{"secreto":"no se sirve (demo)"}');
  fs.writeFileSync(path.join(app, 'fuera.png'), photo);
  vi.spyOn(process, 'cwd').mockReturnValue(app);
  showReal(true);
});
afterAll(() => {
  showReal(null);
  vi.restoreAllMocks();
});

const g = globalThis as unknown as { __fbRealSnapshot?: { value: RealSnapshot | null }; __fbRealFiles?: unknown };
/** What this server's snapshot says (the loader is off under the tests: its memo stands in for it). */
function showReal(on: boolean | null) {
  delete g.__fbRealFiles;
  if (on === null) {
    delete g.__fbRealSnapshot;
    return;
  }
  const pdfId = realIds.media(sha256Of(pdf));
  g.__fbRealSnapshot = {
    value: on
      ? ({
          media: [
            { id: realIds.media(sha256Of(photo)), key: photoKey, kind: 'image' },
            { id: pdfId, key: pdfKey, kind: 'document' },
          ],
          items: [{ id: realIds.document('a'.repeat(64)), kind: 'document', slug: 'semanario-de-prueba-demo-2026-10-08', draft: { fileId: pdfId } }],
        } as unknown as RealSnapshot)
      : null,
  };
}

describe('/api/archivos/web/<clave> con el contenido real', () => {
  it('sirve una foto de .real-site/media con los encabezados de siempre', async () => {
    const r = await servePublicFile(photoKey);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/png');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('Content-Security-Policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Number(r.headers.get('Content-Length'))).toBe(photo.length);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(photo);
  });

  it('y un PDF, para abrirlo en el navegador; guardado, con el nombre de su contenido', async () => {
    const r = await servePublicFile(pdfKey);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Content-Disposition')).toBe('inline; filename="semanario-de-prueba-demo-2026-10-08.pdf"');
  });

  it('solo las claves que nombra la foto, y solo mientras este servidor muestra el contenido real', async () => {
    const other = pngOf(210, 150);
    const otherKey = mediaKey(sha256Of(other), 'png');
    fs.writeFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.media, otherKey), other);
    expect((await servePublicFile(otherKey)).status).toBe(404);
    // REAL_SITE_CONTENT=0 (or a database): the folder is not read at all.
    showReal(false);
    expect((await servePublicFile(photoKey)).status).toBe(404);
    showReal(true);
    expect((await servePublicFile(photoKey)).status).toBe(200);
  });

  it('una clave que no está, 404 (un minuto en caché); nada fuera de la carpeta, se escriba como se escriba', async () => {
    const missing = await servePublicFile(mediaKey(sha256Of(Uint8Array.from([9])), 'jpg'));
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('public, max-age=60');
    for (const key of [
      '../snapshot.json', '..%2Fsnapshot.json', '../../fuera.png', `../${REAL_SITE.media}/${photoKey}`, `${photoKey}/../../snapshot.json`,
      '/etc/passwd', 'snapshot.json', `${photoKey.slice(0, -4)}.json`, `${photoKey.toUpperCase()}`, `./${photoKey}`, `${photoKey}\u0000`,
    ]) {
      const r = await servePublicFile(key);
      expect(r.status, key).toBe(404);
      expect(await r.text(), key).not.toMatch(/secreto/);
    }
  });

  it('por la ruta de verdad, igual', async () => {
    const route = await import('@/app/api/archivos/web/[key]/route');
    const ok = await route.GET(new NextRequest(`http://localhost/api/archivos/web/${photoKey}`), { params: Promise.resolve({ key: photoKey }) });
    expect(ok.status).toBe(200);
    const bad = await route.GET(new NextRequest('http://localhost/api/archivos/web/x'), { params: Promise.resolve({ key: '../snapshot.json' }) });
    expect(bad.status).toBe(404);
  });
});
