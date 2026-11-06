// Local work with data that stays (D-94, LOCAL_DATA_DIR): the demo database as a PGlite on disk. The first start
// builds and seeds it once and writes the marker; a restart keeps what people did and seeds nothing; a migration added
// since is applied once and recorded (then the client's configuration is refreshed); a start that died before the
// marker builds from zero; one server per folder (a lock that a dead process does not keep).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Backend } from '@/lib/db/core';

const h = vi.hoisted(() => ({ extra: null as null | { name: string; sql: string } }));
vi.mock('@/lib/db/migrations', async (orig) => {
  const real = await orig<typeof import('@/lib/db/migrations')>();
  return { ...real, readMigrations: () => [...real.readMigrations(), ...(h.extra ? [h.extra] : [])] };
});

const { LocalDataBusyError, lockLocalData, openLocalDb } = await import('@/lib/db/local-data');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-local-data-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const count = async (b: Backend, q: string) => (await b.transaction((sql) => sql.one<{ n: number }>(q)))!.n;

describe('LOCAL_DATA_DIR: la base de la demo en el disco', () => {
  it('la primera vez la arma y la siembra una vez; al volver a abrir, lo que se hizo sigue y no se siembra de nuevo', async () => {
    const seeded: string[] = [];
    const seed = async (b: Backend) => {
      seeded.push('seed');
      await b.transaction((sql) => sql.query(`insert into public.app_settings (key, value) values ('demo.local_test', '1'::jsonb)`));
    };
    const first = await openLocalDb(dir, { seed });
    expect(first.fresh).toBe(true);
    expect(seeded).toEqual(['seed']);
    const marker = JSON.parse(fs.readFileSync(path.join(dir, 'pglite.json'), 'utf8'));
    expect(marker.version).toBe(1);
    expect(marker.migrations).toContain('20261106000300_citizen.sql');
    expect(fs.existsSync(path.join(dir, 'pglite.lock'))).toBe(true);
    // What a person does after the seed.
    await first.backend.transaction((sql) => sql.query(`update public.app_settings set value = '2'::jsonb where key = 'demo.local_test'`));
    await first.db.close();
    fs.rmSync(path.join(dir, 'pglite.lock'));

    const refreshed: string[] = [];
    const again = await openLocalDb(dir, { seed, refresh: async () => void refreshed.push('refresh') });
    expect(again.fresh).toBe(false);
    expect(again.applied).toEqual([]);
    expect(seeded).toEqual(['seed']);
    expect(refreshed).toEqual([]);
    expect(await count(again.backend, `select (value #>> '{}')::int as n from public.app_settings where key = 'demo.local_test'`)).toBe(2);
    await again.db.close();
    fs.rmSync(path.join(dir, 'pglite.lock'));
  }, 120_000);

  it('una migración nueva se aplica una sola vez, queda en la marca y refresca la configuración', async () => {
    h.extra = { name: '29991231000000_local_test.sql', sql: 'create table public.zz_local_test (n int);' };
    const refreshed: string[] = [];
    const seed = async () => {
      throw new Error('no se siembra otra vez');
    };
    const a = await openLocalDb(dir, { seed, refresh: async () => void refreshed.push('refresh') });
    expect(a.applied).toEqual(['29991231000000_local_test.sql']);
    expect(refreshed).toEqual(['refresh']);
    expect(await count(a.backend, `select count(*)::int as n from public.zz_local_test`)).toBe(0);
    await a.db.close();
    fs.rmSync(path.join(dir, 'pglite.lock'));
    const b = await openLocalDb(dir, { seed, refresh: async () => void refreshed.push('refresh') });
    expect(b.applied).toEqual([]);
    expect(refreshed).toEqual(['refresh']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'pglite.json'), 'utf8')).migrations).toContain('29991231000000_local_test.sql');
    await b.db.close();
    fs.rmSync(path.join(dir, 'pglite.lock'));
    h.extra = null;
  }, 120_000);

  it('sin la marca (un arranque que murió a medias) se arma de cero', async () => {
    fs.rmSync(path.join(dir, 'pglite.json'));
    let seeds = 0;
    const c = await openLocalDb(dir, { seed: async () => void seeds++ });
    expect(c.fresh).toBe(true);
    expect(seeds).toBe(1);
    expect(await count(c.backend, `select count(*)::int as n from public.app_settings where key = 'demo.local_test'`)).toBe(0);
    await c.db.close();
    fs.rmSync(path.join(dir, 'pglite.lock'));
  }, 120_000);

  it('un servidor por carpeta: otro proceso vivo la tiene → error claro; la de un proceso que ya no está se toma', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-local-lock-'));
    try {
      // The parent process (the test runner) is alive and is not this one.
      fs.writeFileSync(path.join(other, 'pglite.lock'), String(process.ppid));
      expect(() => lockLocalData(other)).toThrow(LocalDataBusyError);
      expect(() => lockLocalData(other)).toThrow(/Otra copia de la app/);
      fs.writeFileSync(path.join(other, 'pglite.lock'), '2147483646');
      const release = lockLocalData(other);
      expect(fs.readFileSync(path.join(other, 'pglite.lock'), 'utf8')).toBe(String(process.pid));
      release();
      expect(fs.existsSync(path.join(other, 'pglite.lock'))).toBe(false);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
