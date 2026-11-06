// A private file's way in (src/lib/storage/participation-files.ts, design §6): checked, cleaned and stored under a random
// name in participacion-privado, with the status it is registered with; without a scanner it stays «sin analizar»; with
// one that cannot be reached it stays in quarantine (never served), and the cron's rescan leaves it there too.
import { describe, expect, it, beforeAll } from 'vitest';
import { env } from '@/lib/env';
import { localBucket } from '@/lib/storage/buckets';
import { rescanQuarantine, scanStoredAttachment, storePrivateFile } from '@/lib/storage/participation-files';
import { makeTestDb, type TestDb } from '../rls/setup';
import { SECRET, contains, jpegWithGps } from './fixtures/photos';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
}, 120_000);

describe('guardar un archivo de una solicitud', () => {
  it('se revisa, se limpia y se guarda con un nombre al azar; sin revisor queda «sin analizar»', async () => {
    const r = await storePrivateFile('foto del hueco.JPG', jpegWithGps());
    expect(r.ok).toBe(true);
    const f = (r as Extract<typeof r, { ok: true }>).file;
    expect(f.storageKey).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(f).toMatchObject({ mime: 'image/jpeg', scanStatus: 'sin_analizar' });
    const stored = (await localBucket('participacion-privado').read(f.storageKey))!;
    expect(stored.length).toBe(f.bytes);
    expect(contains(stored, SECRET)).toBe(false);
    expect(await storePrivateFile('virus.exe', jpegWithGps())).toMatchObject({ ok: false });
    expect(await storePrivateFile('foto.jpg', new TextEncoder().encode('%PDF-1.4'))).toMatchObject({ ok: false });
    expect(await scanStoredAttachment('00000000-0000-4000-8000-000000000000', f.storageKey)).toBe('sin_analizar');
    expect(await rescanQuarantine()).toBe(0);
  });

  it('con un revisor que no responde, el archivo queda en cuarentena (nunca se sirve) y la revisión del cron lo deja igual', async () => {
    const before = { ...env.attachments };
    Object.assign(env.attachments, { scanner: 'clamav', clamavHost: '127.0.0.1', clamavPort: 9, clamavTimeoutMs: 300 });
    try {
      const r = await storePrivateFile('acta.pdf', new TextEncoder().encode('%PDF-1.4\n%demo\n%%EOF\n'));
      const f = (r as Extract<typeof r, { ok: true }>).file;
      expect(f.scanStatus).toBe('cuarentena');
      const row = await t.system((sql) =>
        sql.one<{ id: string }>(
          `insert into public.request_attachments (request_id, kind, storage_key, mime, bytes, scan_status)
           select id, 'citizen', $1, 'application/pdf', $2, 'cuarentena' from public.requests order by created_at limit 1 returning id`,
          [f.storageKey, f.bytes],
        ),
      );
      expect(await scanStoredAttachment(row!.id, f.storageKey)).toBe('cuarentena');
      expect(await rescanQuarantine(5)).toBe(0);
      expect(await t.system((sql) => sql.one(`select scan_status from public.request_attachments where id = $1`, [row!.id]))).toEqual({ scan_status: 'cuarentena' });
    } finally {
      Object.assign(env.attachments, before);
    }
  });
});
