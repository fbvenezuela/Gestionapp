import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Backend } from './core';
import { readMigrations } from './migrations';
import { applySchema, pgliteBackend } from './pglite';

// Local work with data that stays (D-94): LOCAL_DATA_DIR=./.data keeps the demo database as a PGlite on disk, no
// Docker needed. The first start builds it (shim, migrations, demo sign-in) and seeds it once; the marker
// <dir>/pglite.json is written only after that finished, so a start that died halfway builds it again from zero. Later
// starts open it as it is (what people did stays) and apply only the migrations added since, then refresh the client's
// configuration (seedClient, «no pisar»). One server at a time per folder (<dir>/pglite.lock): two processes writing
// the same database would break it. Never with DATABASE_URL, never during `next build` (src/lib/db/index.ts). The
// demo's files go under <dir>/files and <dir>/uploads (src/lib/storage/local-files.ts, demo-store.ts).

export type LocalMarker = { version: 1; seededAt: string; migrations: string[] };
export type LocalDb = { db: PGlite; backend: Backend; fresh: boolean; applied: string[] };

export class LocalDataBusyError extends Error {}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Takes <dir>/pglite.lock for this process (a stale one, of a process that is gone, is taken over). */
export function lockLocalData(dir: string): () => void {
  const file = path.join(dir, 'pglite.lock');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      const release = () => {
        try {
          if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.rmSync(file, { force: true });
        } catch {
          // Already gone.
        }
      };
      process.once('exit', release);
      return release;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(file, 'utf8').trim());
      if (pid && pid !== process.pid && alive(pid)) {
        throw new LocalDataBusyError(
          `Otra copia de la app (proceso ${pid}) está usando ${dir}. Ciérrala, o usa otra carpeta en LOCAL_DATA_DIR.`,
        );
      }
      fs.rmSync(file, { force: true });
    }
  }
  throw new LocalDataBusyError(`No se pudo tomar ${file}.`);
}

function readMarker(file: string): LocalMarker | null {
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8')) as LocalMarker;
    return m.version === 1 && Array.isArray(m.migrations) ? m : null;
  } catch {
    return null;
  }
}

function writeMarker(file: string, m: LocalMarker) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * The demo database on disk under `dir`: built and seeded once (`seed`), opened as it is afterwards with the newer
 * migrations applied (then `refresh`, the client's configuration).
 */
export async function openLocalDb(
  dir: string,
  hooks: { seed: (backend: Backend) => Promise<void>; refresh?: (backend: Backend) => Promise<void> },
): Promise<LocalDb> {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const release = lockLocalData(root);
  let db: PGlite | null = null;
  try {
    const dataDir = path.join(root, 'pglite');
    const markerFile = path.join(root, 'pglite.json');
    const marker = readMarker(markerFile);
    if (marker && fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
      db = new PGlite(dataDir);
      const backend = pgliteBackend(db);
      const applied: string[] = [];
      for (const m of readMigrations().filter((x) => !marker.migrations.includes(x.name))) {
        try {
          await db.exec(m.sql);
        } catch (e) {
          throw new Error(
            `La migración ${m.name} falló en la base local (${(e as Error).message}). Para empezar de cero, borra ${root} y vuelve a arrancar.`,
          );
        }
        applied.push(m.name);
        writeMarker(markerFile, { ...marker, migrations: [...marker.migrations, ...applied] });
      }
      if (applied.length && hooks.refresh) await hooks.refresh(backend);
      return { db, backend, fresh: false, applied };
    }
    // New, or a build that never finished: from zero.
    fs.rmSync(dataDir, { recursive: true, force: true });
    db = new PGlite(dataDir);
    const migrations = await applySchema(db);
    const backend = pgliteBackend(db);
    await hooks.seed(backend);
    writeMarker(markerFile, { version: 1, seededAt: new Date().toISOString(), migrations });
    return { db, backend, fresh: true, applied: migrations };
  } catch (e) {
    await db?.close().catch(() => {});
    release();
    throw e;
  }
}
