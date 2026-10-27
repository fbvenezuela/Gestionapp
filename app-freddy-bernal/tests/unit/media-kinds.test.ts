// The media kinds: every list in the code equals the database's (a kind the database refuses would fail on upload;
// one without a label would show raw English), where each kind may go equals the CHECKs, and the file type a new
// file is stored with (every provider) never lets a page or a script through.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';
import {
  CAMERA_KINDS, FICHA_KINDS, KIND_GROUPS, MEDIA_KINDS, OBRA_KINDS, RAW_KINDS, REPORT_KINDS, STORYBOARD_MIMES,
  kindTargetError, storageMime, strictMime, targetOf, type MediaKind, type Target,
} from '@/lib/domain/media-mime';
import { driveFolderPath, GROUP_CODE, MEDIA_KINDS as DRIVE_KINDS, mediaFileName } from '@/lib/storage/drive/names';
import { MEDIA_KIND } from '@/lib/data/labels';
import { looksLikeDateTime } from '@/lib/push/text';
import { makeTestDb, type TestDb } from '../rls/setup';

type Catalog = { kinds: string[]; storyboardMimes: string[]; insertArrays: string[][] };

async function catalog(): Promise<Catalog> {
  const db = new PGlite();
  await db.exec(readShim());
  for (const m of readMigrations()) await db.exec(m.sql);
  const def = async (name: string) =>
    (await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`, [name])).rows[0].def;
  const texts = (s: string) => [...s.matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
  const kinds = texts(await def('media_assets_kind_check'));
  const storyboardMimes = texts(await def('media_assets_storyboard_shape')).filter((x) => x.includes('/'));
  const policy = (await db.query<{ w: string }>(`select with_check as w from pg_policies where tablename = 'media_assets' and policyname = 'media_insert'`)).rows[0].w;
  // The text arrays of media_insert, in order: Grabación's kinds, obra kinds, report kinds.
  const insertArrays = [...policy.matchAll(/ARRAY\[([^\]]*)\]/g)].map((m) => texts(m[1])).filter((a) => a.length);
  await db.close();
  return { kinds, storyboardMimes, insertArrays };
}

describe('tipos de material: código y base iguales', () => {
  let c: Catalog;
  beforeAll(async () => {
    c = await catalog();
  }, 60_000);

  it('la lista de tipos es exactamente la del CHECK, y cada tipo tiene su nombre en español y su carpeta', () => {
    expect([...c.kinds].sort()).toEqual([...MEDIA_KINDS].sort());
    expect([...DRIVE_KINDS]).toEqual([...MEDIA_KINDS]);
    expect(Object.keys(MEDIA_KIND).sort()).toEqual([...MEDIA_KINDS].sort());
    expect(Object.keys(KIND_GROUPS).sort()).toEqual([...MEDIA_KINDS].sort());
    for (const k of MEDIA_KINDS) {
      expect(MEDIA_KIND[k].length, k).toBeGreaterThan(2);
      expect(driveFolderPath(k, null), k).toMatch(/^[A-Za-z]{3,12}\/[A-Za-z]{3,20}$/);
    }
  });

  it('lo que sube Grabación, lo de una obra y lo de un reporte son las listas de la regla de la base', () => {
    expect(c.insertArrays).toEqual([[...CAMERA_KINDS], [...OBRA_KINDS], [...REPORT_KINDS]]);
    expect([...CAMERA_KINDS]).toEqual([...RAW_KINDS, 'storyboard']);
    expect([...new Set([...OBRA_KINDS, ...REPORT_KINDS])].sort()).toEqual([...FICHA_KINDS].sort());
  });

  it('un storyboard es foto o PDF, igual que en la base', () => {
    expect([...c.storyboardMimes].sort()).toEqual([...STORYBOARD_MIMES].sort());
    for (const m of STORYBOARD_MIMES) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[m];
      expect(storageMime('storyboard', m, ext, false)).toEqual({ ok: true, mime: m });
    }
  });
});

describe('dónde va cada tipo (igual que los CHECK de la base)', () => {
  let t: TestDb;
  const ids: Record<Target['kind'], string | null> = { event: null, obra: null, report: null, none: null };
  beforeAll(async () => {
    t = await makeTestDb();
    ids.event = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events order by code limit 1`)))!.id;
    ids.obra = (await t.system((sql) => sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality) values ('Obra de tipos (demo)', 'Junín') returning id`)))!.id;
    ids.report = (await t.system((sql) =>
      sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type) values ('Reporte de tipos (demo)', 'Torbes', 'other') returning id`),
    ))!.id;
  }, 120_000);

  it('para cada tipo y cada lugar, la app y la base dicen lo mismo', async () => {
    let n = 0;
    for (const kind of MEDIA_KINDS) {
      for (const place of ['event', 'obra', 'report', 'none'] as const) {
        const target: Target = { kind: place, id: ids[place] };
        const app = kindTargetError(kind, target) === null;
        const db = await t
          .system((sql) =>
            sql.query(
              `insert into public.media_assets (event_id, obra_ficha_id, community_report_id, kind, mime, storage_path) values ($1, $2, $3, $4, 'image/jpeg', $5)`,
              [place === 'event' ? ids.event : null, place === 'obra' ? ids.obra : null, place === 'report' ? ids.report : null, kind, `tipos/${++n}.jpg`],
            ),
          )
          .then(() => true, () => false);
        expect(app, `${kind} en ${place}`).toBe(db);
      }
    }
  });

  it('un archivo con dos lugares no se arma, y cada negativa se explica en español', () => {
    expect(targetOf({ eventId: 'a', obraFichaId: 'b' })).toBeNull();
    expect(targetOf({ obraFichaId: 'b', reportId: 'c' })).toBeNull();
    expect(targetOf({})).toEqual({ kind: 'none', id: null });
    expect(targetOf({ eventId: null, reportId: 'c' })).toEqual({ kind: 'report', id: 'c' });
    expect(kindTargetError('boss', null)).toMatch(/un solo lugar/);
    expect(kindTargetError('storyboard', { kind: 'none', id: null })).toBe('El storyboard va en su evento.');
    expect(kindTargetError('after', { kind: 'obra', id: 'x' })).toMatch(/ficha de obra/);
    expect(kindTargetError('progress', { kind: 'report', id: 'x' })).toMatch(/reporte/);
    expect(kindTargetError('before', { kind: 'event', id: 'x' })).toMatch(/van en su ficha/);
  });
});

describe('carpetas y nombres en Drive con fichas', () => {
  it('el código de la ficha es la carpeta (O-0001, R-0001); cualquier otra cosa cae en el grupo fijo', () => {
    expect(driveFolderPath('before', 'O-0001')).toBe('Fotos/O-0001');
    expect(driveFolderPath('after', 'R-0012')).toBe('Fotos/R-0012');
    expect(driveFolderPath('document', 'O-0003')).toBe('Documentos/O-0003');
    expect(driveFolderPath('storyboard', 'E-0042')).toBe('Documentos/E-0042');
    expect(driveFolderPath('before', null)).toBe('Fotos/Fichas');
    for (const bad of ['X-0001', 'O-', 'O-123456789', 'O-0001 ', 'o-0001', 'Junín', '28/10']) {
      expect(GROUP_CODE.test(bad), bad).toBe(false);
      expect(driveFolderPath('before', bad), bad).toBe('Fotos/Fichas');
    }
  });

  it('los nombres nuevos no parecen fecha ni hora', () => {
    for (const kind of ['storyboard', 'before', 'progress', 'after', 'document'] as MediaKind[]) {
      for (const code of ['E-0007', 'O-0001', 'R-0042']) {
        for (let n = 1; n <= 30; n++) {
          const name = mediaFileName(code, `${MEDIA_KIND[kind]} ${n}`, 'jpg');
          expect(name, name).toMatch(/^[A-Za-z0-9-]+\.jpg$/);
          expect(looksLikeDateTime(name.replace(/-/g, ' ')), name).toBe(false);
        }
      }
    }
  });
});

describe('el tipo con que se guarda un archivo nuevo', () => {
  it('storyboard y documento de ficha: foto o PDF, aunque el teléfono no diga el tipo', () => {
    for (const kind of ['storyboard', 'document'] as const) {
      expect(storageMime(kind, '', 'pdf', false)).toEqual({ ok: true, mime: 'application/pdf' });
      expect(storageMime(kind, 'application/octet-stream', 'PDF', false)).toEqual({ ok: true, mime: 'application/pdf' });
      expect(storageMime(kind, 'image/jpeg', 'jpg', true)).toEqual({ ok: true, mime: 'image/jpeg' });
      for (const [mime, ext] of [['application/zip', 'zip'], ['image/vnd.adobe.photoshop', 'psd'], ['', 'prproj'], ['text/html', 'pdf'], ['image/svg+xml', 'svg'], ['application/pdf', 'jpg']]) {
        expect(storageMime(kind, mime, ext, false), `${kind} ${mime} .${ext}`).toEqual({ ok: false, error: 'Aquí va una foto o un PDF.' });
      }
    }
    expect(storageMime('storyboard', 'video/mp4', 'mp4', false).ok).toBe(false);
    expect(storageMime('document', 'video/mp4', 'mp4', false).ok).toBe(false);
  });

  it('fotos de antes, avance y después: foto o video, nunca un documento', () => {
    for (const kind of ['before', 'progress', 'after'] as const) {
      expect(storageMime(kind, 'image/jpeg', 'jpg', false)).toEqual({ ok: true, mime: 'image/jpeg' });
      expect(storageMime(kind, '', 'mov', false)).toEqual({ ok: true, mime: 'video/quicktime' });
      expect(storageMime(kind, 'application/pdf', 'pdf', false).ok).toBe(false);
      expect(storageMime(kind, 'audio/mpeg', 'mp3', false).ok).toBe(false);
    }
  });

  it('en Drive, todo como antes; fuera de Drive, lo que ya se subía se sigue subiendo, pero nunca como página', () => {
    // Drive (strict) keeps refusing what it refused.
    expect(storageMime('boss', 'video/x-msvideo', 'avi', true).ok).toBe(false);
    expect(storageMime('editable', 'text/plain', 'srt', true).ok).toBe(false);
    expect(strictMime('boss', 'video/mp4', 'mp4')).toEqual({ ok: true, mime: 'video/mp4', group: 'video' });
    // Elsewhere: unknown camera formats still go, an empty type takes the extension's, a page is kept as a download.
    expect(storageMime('boss', 'video/x-msvideo', 'avi', false)).toEqual({ ok: true, mime: 'video/x-msvideo' });
    expect(storageMime('boss', '', 'mts', false)).toEqual({ ok: true, mime: 'application/octet-stream' });
    expect(storageMime('editable', '', 'pdf', false)).toEqual({ ok: true, mime: 'application/pdf' });
    expect(storageMime('final', 'Video/MP4; codecs="avc1"', 'mp4', false)).toEqual({ ok: true, mime: 'video/mp4' });
    for (const mime of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/plain', 'application/javascript', 'multipart/related']) {
      expect(storageMime('editable', mime, 'html', false), mime).toEqual({ ok: true, mime: 'application/octet-stream' });
      expect(storageMime('evidence', mime, 'jpg', false), mime).toEqual({ ok: true, mime: 'application/octet-stream' });
    }
  });
});
