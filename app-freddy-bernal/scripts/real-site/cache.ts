// What the build keeps between builds, in .next/cache/real-site/ (Vercel restores .next/cache before each build):
//   files/  every file it downloaded, by its address (a redeploy does not download everything again);
//   last/   the last good snapshot with its files (when the official site does not answer, the demo keeps showing it).
// Never in the repository: .next/ is git-ignored. Writes go through a temporary name and a rename.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REAL_SITE, snapshotFromText, type RealSnapshot } from '../../src/lib/web/real-site';
import type { BytesSource } from '../web-import/media';

/** The snapshot in a folder (.real-site/ or the cache's copy), checked; null when it is missing or broken. */
export function readRealSnapshot(dir: string): RealSnapshot | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, REAL_SITE.file), 'utf8');
  } catch {
    return null;
  }
  return snapshotFromText(raw);
}

const DAY = 86_400_000;

/** How long a downloaded file stays good: an upload of WordPress never changes; a YouTube thumbnail or a Drive file can. */
export function ttlFor(url: string): number {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wp-content/uploads/')) return Infinity;
    if (u.hostname.endsWith('ytimg.com')) return 3 * DAY;
    return DAY;
  } catch {
    return 0;
  }
}

function writeAtomic(file: string, data: Uint8Array | string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export class DownloadCache {
  readonly used = new Set<string>();
  hits = 0;
  constructor(
    readonly dir: string,
    private now: () => number = Date.now,
  ) {}

  private nameOf(url: string) {
    return createHash('sha256').update(url).digest('hex');
  }

  /** The file kept for an address (and its notes), when it is still good. */
  read(url: string, maxAgeMs: number = ttlFor(url)): { bytes: Uint8Array; meta: Record<string, string | null> } | null {
    const name = this.nameOf(url);
    const file = path.join(this.dir, `${name}.bin`);
    try {
      const st = fs.statSync(file);
      if (this.now() - st.mtimeMs > maxAgeMs) return null;
      const bytes = new Uint8Array(fs.readFileSync(file));
      let meta: Record<string, string | null> = {};
      try {
        meta = JSON.parse(fs.readFileSync(path.join(this.dir, `${name}.json`), 'utf8'));
      } catch {
        // no notes
      }
      this.used.add(name);
      this.hits++;
      return { bytes, meta };
    } catch {
      return null;
    }
  }

  write(url: string, bytes: Uint8Array, meta?: Record<string, string | null>): void {
    const name = this.nameOf(url);
    try {
      writeAtomic(path.join(this.dir, `${name}.bin`), bytes);
      if (meta) writeAtomic(path.join(this.dir, `${name}.json`), JSON.stringify(meta));
      this.used.add(name);
    } catch {
      // A cache that cannot be written only means downloading again next time.
    }
  }

  /** Forgets what this run did not use (the cache never grows past one snapshot's files). */
  prune(): number {
    let removed = 0;
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return 0;
    }
    for (const f of names) {
      const name = f.replace(/\.(bin|json)$/, '');
      if (/\.tmp$/.test(f) || !this.used.has(name)) {
        fs.rmSync(path.join(this.dir, f), { force: true });
        removed++;
      }
    }
    return removed;
  }
}

/** A source of bytes that looks in the cache first and keeps what it downloads. */
export function cachedBytes(inner: BytesSource, cache: DownloadCache | null): BytesSource {
  if (!cache) return inner;
  return {
    async bytes(url, maxBytes) {
      const kept = cache.read(url);
      if (kept && kept.bytes.length <= maxBytes) return kept.bytes;
      const got = await inner.bytes(url, maxBytes);
      if (got) cache.write(url, got);
      return got;
    },
  };
}

// --- The last good snapshot ---------------------------------------------------------------------------------------------
function copyDir(from: string, to: string) {
  const tmp = `${to}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(from, tmp, { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(tmp, to);
}

/** The folder's snapshot, checked, and only when every file it names is there. */
export function readCompleteSnapshot(dir: string): RealSnapshot | null {
  const snap = readRealSnapshot(dir);
  if (!snap) return null;
  for (const m of snap.media) {
    try {
      if (fs.statSync(path.join(dir, REAL_SITE.media, m.key)).size !== m.bytes) return null;
    } catch {
      return null;
    }
  }
  return snap;
}

export function saveLastGood(realDir: string, cacheDir: string): void {
  try {
    copyDir(realDir, path.join(cacheDir, 'last'));
  } catch {
    // Keeping a copy is a courtesy for the next build: never a reason to fail this one.
  }
}

/** The last good snapshot (null when there is none, or it is broken). */
export function readLastGood(cacheDir: string): { snapshot: RealSnapshot; dir: string } | null {
  const dir = path.join(cacheDir, 'last');
  const snapshot = readCompleteSnapshot(dir);
  return snapshot ? { snapshot, dir } : null;
}

/** Puts the last good snapshot in place of .real-site/; the snapshot, or null when there was none. */
export function restoreLastGood(cacheDir: string, realDir: string): RealSnapshot | null {
  const last = readLastGood(cacheDir);
  if (!last) return null;
  copyDir(last.dir, realDir);
  return last.snapshot;
}

/** Writes .real-site/ whole (a temporary folder, then a rename: a build never sees half a snapshot). */
export function writeRealSite(realDir: string, snapshot: RealSnapshot, files: Map<string, Uint8Array>): void {
  const tmp = `${realDir}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, REAL_SITE.media), { recursive: true });
  for (const m of snapshot.media) {
    const bytes = files.get(m.key);
    if (!bytes) throw new Error(`falta el archivo ${m.key}`);
    fs.writeFileSync(path.join(tmp, REAL_SITE.media, m.key), bytes);
  }
  fs.writeFileSync(path.join(tmp, REAL_SITE.file), JSON.stringify(snapshot));
  fs.rmSync(realDir, { recursive: true, force: true });
  fs.renameSync(tmp, realDir);
}
