import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env';

// Demo-only file storage on the server's temp disk (lost on restart), or under LOCAL_DATA_DIR when set (D-94: kept with
// the database on disk). Real projects use Supabase Storage. Paths come from media_assets.storage_path (uuid-based).
const ROOT = env.localDataDir ? path.resolve(env.localDataDir, 'uploads') : path.join(os.tmpdir(), 'fb-demo-uploads');

export function demoFilePath(storagePath: string) {
  const clean = storagePath.replace(/\.\./g, '').replace(/^\/+/, '');
  const full = path.join(ROOT, clean);
  if (!full.startsWith(ROOT)) throw new Error('bad path');
  return full;
}

export function demoMeta(storagePath: string): { length: number } | null {
  try {
    return JSON.parse(fs.readFileSync(demoFilePath(storagePath) + '.json', 'utf8'));
  } catch {
    return null;
  }
}

export function demoCreate(storagePath: string, length: number) {
  const f = demoFilePath(storagePath);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, '');
  fs.writeFileSync(f + '.json', JSON.stringify({ length }));
}

export function demoOffset(storagePath: string): number {
  try {
    return fs.statSync(demoFilePath(storagePath)).size;
  } catch {
    return -1;
  }
}

export function demoAppend(storagePath: string, chunk: Buffer) {
  fs.appendFileSync(demoFilePath(storagePath), chunk);
}
