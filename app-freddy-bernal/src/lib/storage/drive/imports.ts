import 'server-only';
import type { Session } from '../../auth/session';
import { withSystem } from '../../db';
import { UserError } from '../../actions/run';
import { FOLDER_MIME, listFiles, qv, type DriveFile } from './client';
import { withDrive } from './connection';
import { driveMessage } from './errors';
import { ensureFolder } from './folders';
import { registerPicked, type Registered } from './register';

// «Traer lo nuevo de Drive» (Administración): registers what the import script
// (scripts/drive-import) uploaded to <root>/Importado. With drive.file the platform only sees
// files this same OAuth client created, so nothing else in the account shows up. Each file is
// registered like a picked one (photos cleaned, never its name read), with no event, as «Otros»,
// labelled «Archivo 007» after the number the script gave it (its manifest maps it to the
// original file on Juan's Mac).

export const IMPORT_FOLDER = 'Importado';
export const IMPORT_MARK = 'import';
// Per call, so the action stays short; the page calls again while there are more.
export const IMPORT_BATCH = 20;

// items = what was registered this round (the admin's browser then reads fps and codecs of videos).
export type ScanResult = { added: number; failed: number; left: number; error: string | null; items: Registered[] };

export async function scanImports(s: Session, max = IMPORT_BATCH): Promise<ScanResult> {
  const found = await withDrive(async (t) => {
    const folder = await ensureFolder(t, IMPORT_FOLDER);
    const files: DriveFile[] = [];
    let page: string | undefined;
    do {
      const r = await listFiles(t, `${qv(folder)} in parents and trashed = false and appProperties has { key='fb360' and value=${qv(IMPORT_MARK)} }`, page);
      files.push(...r.files.filter((f) => f.mimeType !== FOLDER_MIME));
      page = r.next ?? undefined;
    } while (page && files.length < 5000);
    return files;
  });
  const ids = found.map((f) => f.id);
  const known = new Set<string>();
  if (ids.length) {
    const rows = await withSystem((sql) =>
      sql.query<{ file_id: string; origin_file_id: string | null }>(
        `select file_id, origin_file_id from public.media_drive where file_id = any($1::text[]) or origin_file_id = any($1::text[])`,
        [ids],
      ),
    );
    for (const r of rows) {
      known.add(r.file_id);
      if (r.origin_file_id) known.add(r.origin_file_id);
    }
  }
  const seq = (f: DriveFile) => (/^\d{1,4}$/.test(f.appProperties?.seq ?? '') ? f.appProperties!.seq : null);
  const fresh = found.filter((f) => !known.has(f.id)).sort((a, b) => Number(seq(a) ?? 1e9) - Number(seq(b) ?? 1e9));
  let added = 0;
  let failed = 0;
  let error: string | null = null;
  const items: Registered[] = [];
  for (const f of fresh.slice(0, max)) {
    const n = seq(f);
    try {
      items.push(await registerPicked(s, { fileId: f.id, eventId: null, kind: 'other' }, { source: 'import', label: n ? `Archivo ${n}` : undefined }));
      added++;
    } catch (e) {
      failed++;
      error ??= e instanceof UserError ? e.message : driveMessage(e);
    }
  }
  return { added, failed, left: Math.max(0, fresh.length - added - failed), error, items };
}
