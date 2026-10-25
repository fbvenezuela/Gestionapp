// Drive building blocks with no network and no database: the sealing of the grant, the names the
// platform gives files (never a date, a time or a place), which file types may be stored and shown
// inline, and Range planning for playback.
import { describe, it, expect } from 'vitest';
import { AAD, deriveKey, keyId, open, parseKey, seal } from '@/lib/storage/drive/crypto';
import { driveFolderPath, extOf, MEDIA_KINDS, mediaFileName, slug } from '@/lib/storage/drive/names';
import { driveMime, extForMime, INLINE_MIME, servedAs } from '@/lib/storage/drive/mime';
import { parseContentRange, parseRange, planRange, RANGE_CAP, sliceStream } from '@/lib/storage/drive/range';
import { DRIVE_MESSAGE, driveMessage, DriveError, googleReason, mapDriveFailure, retryable } from '@/lib/storage/drive/errors';
import { MEDIA_KIND } from '@/lib/data/labels';
import { looksLikeDateTime } from '@/lib/push/text';
import { dateMentions } from '@/lib/domain/event-title';

describe('sellado del permiso (AES-256-GCM)', () => {
  const key = deriveKey('un-secreto-de-prueba-largo');

  it('ida y vuelta, y cada sellado es distinto', () => {
    const a = seal('1//refresh-token-inventado', AAD.connection, key);
    const b = seal('1//refresh-token-inventado', AAD.connection, key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token-inventado');
    expect(open(a, AAD.connection, key)).toEqual({ ok: true, value: '1//refresh-token-inventado' });
  });

  it('otra fila, otra clave o un byte cambiado: nunca abre', () => {
    const s = seal('secreto', AAD.upload('00000000-0000-4000-8000-000000000aaa'), key);
    expect(open(s, AAD.upload('00000000-0000-4000-8000-000000000bbb'), key)).toEqual({ ok: false, why: 'damaged' });
    expect(open(s, AAD.connection, key).ok).toBe(false);
    expect(open(s, AAD.upload('00000000-0000-4000-8000-000000000aaa'), deriveKey('otro-secreto'))).toEqual({ ok: false, why: 'other_key' });
    const parts = s.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 1;
    parts[3] = ct.toString('base64url');
    expect(open(parts.join('.'), AAD.upload('00000000-0000-4000-8000-000000000aaa'), key)).toEqual({ ok: false, why: 'damaged' });
    expect(open('basura', AAD.connection, key).ok).toBe(false);
  });

  it('la clave: DRIVE_TOKEN_KEY de 32 bytes, o derivada (estable) del secreto de sesión', () => {
    const raw = Buffer.alloc(32, 7);
    expect(parseKey(raw.toString('base64'))?.equals(raw)).toBe(true);
    expect(parseKey(raw.toString('base64url'))?.equals(raw)).toBe(true);
    expect(parseKey(Buffer.alloc(16).toString('base64'))).toBeNull();
    expect(parseKey('')).toBeNull();
    expect(deriveKey('x').equals(deriveKey('x'))).toBe(true);
    expect(keyId(deriveKey('x'))).toMatch(/^[0-9a-f]{8}$/);
    // Its own derivation: not the same bytes as the input or another use of the secret.
    expect(deriveKey('x').equals(deriveKey('y'))).toBe(false);
  });
});

describe('nombres en Drive: sin fecha, hora ni lugar', () => {
  const NAME = /^[A-Za-z0-9-]+(\.[a-z0-9]{1,5})?$/;
  const codes = ['E-0001', 'E-0042', 'E-0999', 'E-1234', null];
  const exts = ['mp4', 'mov', 'jpg', 'png', 'webp', 'm4a', 'pdf'];

  it('carpeta por tipo y por código de evento; sin evento, un grupo fijo', () => {
    expect(driveFolderPath('boss', 'E-0042')).toBe('Videos/E-0042');
    expect(driveFolderPath('cover', 'E-0042')).toBe('Portadas/E-0042');
    expect(driveFolderPath('evidence', null)).toBe('Fotos/Capturas');
    expect(driveFolderPath('tweet_image', null)).toBe('Fotos/Tweets');
    expect(driveFolderPath('final', null)).toBe('Videos/Piezas');
    expect(driveFolderPath('voice_line', 'E-0007')).toBe('Audios/E-0007');
    // Anything that is not an event code never becomes a folder name.
    expect(driveFolderPath('boss', '28/10 a las 9')).toBe('Videos/Piezas');
    expect(driveFolderPath('boss', 'Plaza Bolívar')).toBe('Videos/Piezas');
  });

  it('cada nombre y carpeta, para cada tipo, solo lleva letras, números y guiones, y ninguno parece fecha u hora', () => {
    for (const kind of MEDIA_KINDS) {
      for (const code of codes) {
        const folder = driveFolderPath(kind, code);
        expect(folder).toMatch(/^[A-Za-z]{3,12}\/[A-Za-z0-9-]{1,20}$/);
        for (let n = 1; n <= 40; n++) {
          for (const ext of exts) {
            const name = mediaFileName(code, `${MEDIA_KIND[kind]} ${n}`, ext);
            expect(name, name).toMatch(NAME);
            expect(looksLikeDateTime(name.replace(/-/g, ' ')), name).toBe(false);
            expect(looksLikeDateTime(name), name).toBe(false);
            expect(dateMentions(name.replace(/-/g, ' ')), name).toEqual([]);
            expect(/\d{1,2}[:h]\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(name), name).toBe(false);
          }
        }
        expect(looksLikeDateTime(folder.replace(/[/-]/g, ' '))).toBe(false);
      }
    }
  });

  it('acentos y signos se limpian; nunca queda vacío', () => {
    expect(mediaFileName('E-0042', 'Jefe hablando 2', 'mp4')).toBe('E-0042-Jefe-hablando-2.mp4');
    expect(mediaFileName(null, 'Portada 1', 'JPG')).toBe('pieza-Portada-1.jpg');
    expect(mediaFileName('E-0001', 'Ñandú & café: ¡ya!', 'mp4')).toBe('E-0001-Nandu-cafe-ya.mp4');
    expect(mediaFileName('E-0001', 'x', '../../x')).toBe('E-0001-x');
    expect(slug('///')).toBe('');
    expect(extOf('abc/123e4567-e89b-42d3-a456-426614174000.MOV')).toBe('mov');
    expect(extOf('sin-extension')).toBe('bin');
  });
});

describe('tipos de archivo en Drive (se sirven desde nuestro propio dominio)', () => {
  it('nunca se guarda algo que el navegador ejecute: HTML, SVG, XML, scripts', () => {
    for (const [mime, ext] of [
      ['image/svg+xml', 'svg'], ['text/html', 'html'], ['text/html', 'jpg'], ['image/svg+xml', 'png'], ['application/xhtml+xml', 'jpg'],
      ['text/xml', 'png'], ['application/javascript', 'mp4'], ['text/plain', 'jpg'], ['multipart/related', 'jpg'], ['image/jpeg', 'svg'],
      ['image/jpeg', 'html'], ['', 'js'], ['application/octet-stream', 'htm'],
    ]) {
      expect(driveMime('evidence', mime, ext).ok, `${mime} .${ext}`).toBe(false);
      expect(driveMime('editable', mime, ext).ok, `${mime} .${ext}`).toBe(false);
    }
  });

  it('el tipo tiene que cuadrar con la extensión y con lo que se sube', () => {
    expect(driveMime('boss', 'video/mp4', 'mp4')).toEqual({ ok: true, mime: 'video/mp4', group: 'video' });
    expect(driveMime('boss', 'video/quicktime', 'mov').ok).toBe(true);
    expect(driveMime('boss', '', 'mov')).toEqual({ ok: true, mime: 'video/quicktime', group: 'video' });
    expect(driveMime('boss', 'application/octet-stream', 'mp4')).toEqual({ ok: true, mime: 'video/mp4', group: 'video' });
    expect(driveMime('cover', 'video/mp4', 'mp4').ok).toBe(false); // a cover is a picture
    expect(driveMime('cover', 'image/jpeg', 'mp4').ok).toBe(false); // type and extension disagree
    expect(driveMime('evidence', 'image/png', 'png').ok).toBe(true);
    expect(driveMime('voice_line', 'audio/mp4', 'm4a').ok).toBe(true);
    expect(driveMime('voice_line', 'audio/webm', 'webm').ok).toBe(true);
    expect(driveMime('final', 'Video/MP4; codecs="avc1"', 'MP4')).toEqual({ ok: true, mime: 'video/mp4', group: 'video' });
    expect(driveMime('boss', 'application/pdf', 'pdf').ok).toBe(false);
    expect(driveMime('editable', 'application/pdf', 'pdf').ok).toBe(true);
  });

  it('en línea solo tipos de medios simples y solo si se pidió; lo demás se descarga como binario', () => {
    expect(servedAs('video/mp4', true)).toEqual({ type: 'video/mp4', disposition: 'inline' });
    expect(servedAs('video/mp4', false)).toEqual({ type: 'application/octet-stream', disposition: 'attachment' });
    for (const m of ['image/svg+xml', 'text/html', 'application/pdf', 'video/x-matroska', 'application/xhtml+xml', '']) {
      expect(servedAs(m, true), m).toEqual({ type: 'application/octet-stream', disposition: 'attachment' });
    }
    expect([...INLINE_MIME].every((m) => !/html|xml|svg|script/.test(m))).toBe(true);
    expect(extForMime('video/quicktime')).toBe('mov');
    expect(extForMime('image/svg+xml')).toBeNull();
    expect(extForMime('text/html')).toBeNull();
  });
});

describe('tramos (Range) para ver y adelantar el video', () => {
  const MB = 1024 * 1024;
  it('lee un solo tramo; varios o mal escritos no', () => {
    expect(parseRange(null)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=0-1')).toEqual({ kind: 'from', start: 0, end: 1 });
    expect(parseRange('bytes=100-')).toEqual({ kind: 'from', start: 100, end: null });
    expect(parseRange('bytes=-500')).toEqual({ kind: 'suffix', length: 500 });
    expect(parseRange('bytes=0-1,5-6').kind).toBe('bad');
    expect(parseRange('bytes=5-1').kind).toBe('bad');
    expect(parseRange('items=0-1').kind).toBe('bad');
    expect(parseRange('bytes=-').kind).toBe('bad');
  });

  it('cada respuesta lleva como mucho 4 MiB; fuera del archivo no se puede', () => {
    const size = 180 * MB;
    expect(planRange({ kind: 'none' }, size)).toEqual({ kind: 'full' });
    expect(planRange(parseRange('bytes=0-'), size)).toEqual({ kind: 'part', start: 0, end: RANGE_CAP - 1 });
    expect(planRange(parseRange('bytes=0-1'), size)).toEqual({ kind: 'part', start: 0, end: 1 });
    expect(planRange(parseRange(`bytes=${size - 10}-`), size)).toEqual({ kind: 'part', start: size - 10, end: size - 1 });
    expect(planRange(parseRange('bytes=-10'), size)).toEqual({ kind: 'part', start: size - 10, end: size - 1 });
    expect(planRange(parseRange(`bytes=-${size * 2}`), size)).toEqual({ kind: 'part', start: 0, end: RANGE_CAP - 1 });
    expect(planRange(parseRange(`bytes=${size}-`), size)).toEqual({ kind: 'unsatisfiable' });
    expect(planRange(parseRange('bytes=-0'), size)).toEqual({ kind: 'unsatisfiable' });
    expect(planRange(parseRange('bytes=0-1,4-5'), size)).toEqual({ kind: 'unsatisfiable' });
    expect(parseContentRange('bytes 0-1/10')).toEqual({ start: 0, end: 1, size: 10 });
    expect(parseContentRange('bytes 5-1/10')).toBeNull();
    expect(parseContentRange('bytes */10')).toBeNull();
  });

  it('el corte de bytes salta, corta y avisa una sola vez cuántos pasaron (también si el navegador se va)', async () => {
    const src = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(10).fill(i));
          c.close();
        },
      });
    const ends: number[] = [];
    const out = new Uint8Array(await new Response(sliceStream(src(), { skip: 15, take: 20, onEnd: (n) => ends.push(n) })).arrayBuffer());
    expect(out.length).toBe(20);
    expect(out[0]).toBe(1);
    expect(out[19]).toBe(3);
    expect(ends).toEqual([20]);

    let cancelled = false;
    const slow = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(5));
      },
      cancel() {
        cancelled = true;
      },
    });
    const gone: number[] = [];
    const reader = sliceStream(slow, { onEnd: (n) => gone.push(n) }).getReader();
    await reader.read();
    await reader.cancel();
    expect(gone).toEqual([5]);
    expect(cancelled).toBe(true);
  });
});

describe('errores de Drive → mensajes cortos en español', () => {
  it('cada código tiene su mensaje fijo, sin nada de Google', () => {
    expect(driveMessage(new DriveError('auth', 'invalid_grant'))).toBe(DRIVE_MESSAGE.auth);
    expect(driveMessage(new Error('x'))).toBe(DRIVE_MESSAGE.busy);
    for (const m of Object.values(DRIVE_MESSAGE)) expect(m).not.toMatch(/google\.com|token|http/i);
  });

  it('las respuestas de Google se traducen a pocos códigos', () => {
    const body = (reason: string) => ({ error: { errors: [{ reason }] } });
    expect(googleReason({ error: 'invalid_grant' })).toBe('invalid_grant');
    expect(mapDriveFailure(401, body('authError')).code).toBe('auth');
    expect(mapDriveFailure(404, body('notFound')).code).toBe('not_found');
    expect(mapDriveFailure(403, body('storageQuotaExceeded')).code).toBe('full');
    expect(mapDriveFailure(403, body('userRateLimitExceeded')).code).toBe('busy');
    expect(mapDriveFailure(403, body('insufficientFilePermissions')).code).toBe('not_found');
    expect(mapDriveFailure(429, null).code).toBe('busy');
    expect(mapDriveFailure(503, null).code).toBe('busy');
    expect(mapDriveFailure(400, body('badRequest')).code).toBe('refused');
    expect(retryable(429, null)).toBe(true);
    expect(retryable(500, null)).toBe(true);
    expect(retryable(403, body('rateLimitExceeded'))).toBe(true);
    expect(retryable(403, body('downloadQuotaExceeded'))).toBe(false);
    expect(retryable(403, body('storageQuotaExceeded'))).toBe(false);
    expect(retryable(404, null)).toBe(false);
  });
});
