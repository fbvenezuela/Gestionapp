import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env';

// Where the demo keeps files on this machine: under LOCAL_DATA_DIR when set (D-94: they stay across restarts, with the
// database), otherwise the temp disk (lost on restart, as always). Never used with DATABASE_URL: production files go to
// Supabase Storage (buckets.ts).
export function localFilesRoot(dataDir: string = env.localDataDir): string {
  return dataDir ? path.resolve(dataDir, 'files') : path.join(os.tmpdir(), 'fb-demo-files');
}

/** The file of a key inside a folder, or null when the key would leave it (the caller checked the key's shape). */
export function insideFolder(folder: string, key: string): string | null {
  const full = path.resolve(folder, key);
  return full.startsWith(path.resolve(folder) + path.sep) ? full : null;
}

/** Writes through a temporary name of its own and a rename: a half-written file is never served, and two writers of the
 * same key (two demo seeds at once) never share a temporary file. */
export async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.writeFile(tmp, bytes, { flag: 'wx' });
  await fs.promises.rename(tmp, file);
}

export async function readIfExists(file: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.promises.readFile(file));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
