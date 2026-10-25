// Pure part of the import script (scripts/drive-import/import.mts): which files of the folder go
// up, which stay out and why, the names they get in Drive and the saved state that lets a run
// continue where the last one stopped. No network and no disk here, so it is tested on its own.
import { createHash } from 'node:crypto';
import path from 'node:path';

// Videos only. Photos go through «Subir» in the platform, which cleans their GPS and camera data.
export const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
};

// 32 × 256 KiB: Google wants resumable chunks in multiples of 256 KiB.
export const IMPORT_CHUNK = 8 * 1024 * 1024;
// Google drops a resumable session after a week; a day less to be safe.
export const SESSION_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;
// A name starting like this always stays out.
export const NO_UPLOAD_PREFIX = 'no-subir';

export type LocalFile = { rel: string; size: number };

export type FileState = {
  key: string;
  seq: string;
  size: number;
  name: string;
  fileId: string | null;
  session: { url: string; at: number } | null;
  done: boolean;
};

export type ImportState = { version: 1; account: string | null; nextSeq: number; files: Record<string, FileState> };

export function emptyState(): ImportState {
  return { version: 1, account: null, nextSeq: 1, files: {} };
}

/** Reads the saved state; anything broken or unknown starts clean (Drive itself prevents repeats). */
export function parseState(text: string | null): ImportState {
  if (!text) return emptyState();
  try {
    const j = JSON.parse(text) as Partial<ImportState>;
    if (j.version !== 1 || typeof j.files !== 'object' || !j.files) return emptyState();
    const files: Record<string, FileState> = {};
    for (const [rel, f] of Object.entries(j.files)) {
      if (!f || typeof f.key !== 'string' || typeof f.seq !== 'string' || !/^\d{3,4}$/.test(f.seq)) continue;
      files[rel] = {
        key: f.key,
        seq: f.seq,
        size: Number(f.size) || 0,
        name: typeof f.name === 'string' ? f.name : '',
        fileId: typeof f.fileId === 'string' ? f.fileId : null,
        session: f.session && typeof f.session.url === 'string' && typeof f.session.at === 'number' ? f.session : null,
        done: f.done === true,
      };
    }
    const seqs = Object.values(files).map((f) => Number(f.seq));
    const nextSeq = Math.max(Number(j.nextSeq) || 1, seqs.length ? Math.max(...seqs) + 1 : 1);
    return { version: 1, account: typeof j.account === 'string' ? j.account : null, nextSeq, files };
  } catch {
    return emptyState();
  }
}

/** Lower case, no accents, anything but letters and digits as one space: «Sábados_Felices–1.MP4» → «sabados felices 1 mp4». */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The same with no spaces at all, so «#SabadosFelices» and «sabados felices» compare equal. */
export function squashName(s: string): string {
  return normalizeName(s).replace(/ /g, '');
}

/** A pattern from the exclude file (`*` = anything, `?` = one character), compared after `form`. */
export function patternToRegExp(pattern: string, form: (s: string) => string = normalizeName): RegExp {
  const body = pattern
    .split(/([*?])/)
    .map((part) => (part === '*' ? '.*' : part === '?' ? '.' : form(part).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`);
}

/** The exclude file: one name or pattern per line; # starts a comment. */
export function parseExcludeFile(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 200);
}

/**
 * Why a file stays out (the pattern that matched), or null. NO-SUBIR at the start of its name or
 * of any folder above it; a pattern checked against its name and its path, as written and with
 * every space and sign taken out (so «Sabados-Felices», «sabadosfelices» and «#SabadosFelices»
 * are all the same name). Excluding too much is the safe side: the person sees the list first.
 */
export function excludedBy(rel: string, patterns: string[]): string | null {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  const base = parts.at(-1) ?? rel;
  if (parts.some((p) => squashName(p).startsWith(squashName(NO_UPLOAD_PREFIX)))) return 'NO-SUBIR';
  const names = [base, base.replace(/\.[^.]+$/, ''), parts.join('/')];
  for (const p of patterns) {
    const loose = patternToRegExp(p);
    const tight = patternToRegExp(p, squashName);
    if (names.some((n) => loose.test(normalizeName(n)) || tight.test(squashName(n)))) return p;
  }
  return null;
}

export function extOf(rel: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(rel);
  return m ? m[1].toLowerCase() : '';
}

/** Same file again (same place in the folder, same size) = same key: never uploaded twice. */
export function sourceKey(rel: string, size: number): string {
  return createHash('sha256').update(`${rel.split(path.sep).join('/')}\n${size}`).digest('hex').slice(0, 40);
}

/** The name in Drive: a number, never the original name, a date or a place. */
export function driveName(seq: string, ext: string): string {
  return `ARCHIVO-${seq}.${ext}`;
}

export const seqText = (n: number) => String(n).padStart(3, '0');

export type Planned = { rel: string; size: number; key: string; seq: string; name: string; mime: string; resume: FileState['session'] };
export type ImportPlan = {
  upload: Planned[];
  done: { rel: string; name: string }[];
  excluded: { rel: string; why: string }[];
  skipped: { rel: string; why: string }[];
  state: ImportState;
};

/**
 * What this run does. Numbers stay the same across runs (ARCHIVO-007 is always the same file);
 * a file whose size changed is a new file. `now` decides whether a saved upload session is still
 * usable.
 */
export function planImport(files: LocalFile[], prev: ImportState, patterns: string[], now = Date.now()): ImportPlan {
  const state: ImportState = { ...prev, files: { ...prev.files } };
  const plan: ImportPlan = { upload: [], done: [], excluded: [], skipped: [], state };
  const sorted = [...files].sort((a, b) => a.rel.localeCompare(b.rel, 'es'));
  for (const f of sorted) {
    const why = excludedBy(f.rel, patterns);
    if (why) {
      plan.excluded.push({ rel: f.rel, why });
      continue;
    }
    const ext = extOf(f.rel);
    const mime = VIDEO_MIME[ext];
    if (!mime) {
      plan.skipped.push({ rel: f.rel, why: ext ? `no es video (.${ext})` : 'no es video' });
      continue;
    }
    if (f.size <= 0) {
      plan.skipped.push({ rel: f.rel, why: 'está vacío' });
      continue;
    }
    const key = sourceKey(f.rel, f.size);
    let s = state.files[f.rel];
    if (!s || s.key !== key) {
      s = { key, seq: seqText(state.nextSeq++), size: f.size, name: '', fileId: null, session: null, done: false };
      s.name = driveName(s.seq, ext);
      state.files[f.rel] = s;
    }
    if (s.done) {
      plan.done.push({ rel: f.rel, name: s.name });
      continue;
    }
    const resume = s.session && now - s.session.at < SESSION_MAX_AGE_MS ? s.session : null;
    plan.upload.push({ rel: f.rel, size: f.size, key, seq: s.seq, name: s.name, mime, resume });
  }
  return plan;
}

/** True when `child` is `parent` or inside it. */
export function isInside(child: string, parent: string): boolean {
  const r = path.relative(path.resolve(parent), path.resolve(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/** «bytes=0-N» from Google → how many bytes it has. */
export function receivedFrom(range: string | null): number {
  const m = /^bytes=0-(\d+)$/.exec((range ?? '').trim());
  return m ? Number(m[1]) + 1 : 0;
}

/** The next chunk to send from `offset`, as [start, endExclusive]. */
export function nextChunk(offset: number, size: number, chunk = IMPORT_CHUNK): [number, number] {
  return [offset, Math.min(offset + chunk, size)];
}

export function bytesText(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** The list Juan reads to match ARCHIVO-007 with the original (it stays next to the state). */
export function manifestText(state: ImportState): string {
  const rows = Object.entries(state.files)
    .sort(([, a], [, b]) => a.seq.localeCompare(b.seq))
    .map(([rel, f]) => `${f.name}\t${f.done ? 'subido' : 'pendiente'}\t${rel}`);
  return ['# Lo que subió el script de importación (no va a git).', '# Nombre en Drive\tEstado\tArchivo original', ...rows, ''].join('\n');
}
