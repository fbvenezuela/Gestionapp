import 'server-only';
import { withSystem } from '../db';
import { attachmentStorageKey, cleanAttachment, validateAttachment } from '../participation/files';
import { bucketStore } from './buckets';
import { attachmentScanner, initialScanStatus, type ScanStatus } from './scanner';

// A private file's way in (design §6): checked (extension, size, first bytes), cleaned (photo metadata) in memory
// (preparePrivateFile), registered by the caller (citizen.add_request_attachment or add_request_evidence, which decide
// on the receipt or the person, the counts and the rate limit) and only then stored under its random name in
// participacion-privado (putPrivateFile, inside the caller's transaction: a refusal never writes a byte, a failed write
// takes the row back), then scanned here as the system. A failed scan leaves it in quarantine (never served) and the
// cron tries again. (The security review of 06/11: the file used to be stored before the database decided, so anyone
// without a receipt could make the server write and delete files without ever reaching the limit.)

export type StoredFile = { storageKey: string; mime: string; bytes: number; scanStatus: 'cuarentena' | 'sin_analizar' };
export type PreparedFile = StoredFile & { content: Uint8Array };

/** The checked and cleaned file with its new name, in memory: nothing is stored yet. */
export function preparePrivateFile(name: string, raw: Uint8Array): { ok: true; file: PreparedFile } | { ok: false; error: string } {
  const check = validateAttachment({ name, bytes: raw });
  if (!check.ok) return check;
  const clean = cleanAttachment(raw, check.type);
  if (!clean.ok) return clean;
  const storageKey = attachmentStorageKey(check.type);
  return { ok: true, file: { storageKey, mime: check.type.mime, bytes: clean.bytes.length, scanStatus: initialScanStatus(), content: clean.bytes } };
}

/** Writes a prepared file to the private bucket (after its row was accepted). */
export async function putPrivateFile(f: PreparedFile): Promise<void> {
  await bucketStore('participacion-privado').put(f.storageKey, f.content, f.mime);
}

/** Removes a stored private file (its row never committed). Never throws. */
export async function dropPrivateFile(storageKey: string): Promise<void> {
  await bucketStore('participacion-privado').remove(storageKey).catch(() => {});
}

/** Checked, cleaned and stored at once: only for a caller that already decided the file may go in. */
export async function storePrivateFile(name: string, raw: Uint8Array): Promise<{ ok: true; file: StoredFile } | { ok: false; error: string }> {
  const prepared = preparePrivateFile(name, raw);
  if (!prepared.ok) return prepared;
  const f = prepared.file;
  await putPrivateFile(f);
  return { ok: true, file: { storageKey: f.storageKey, mime: f.mime, bytes: f.bytes, scanStatus: f.scanStatus } };
}

/** Scans a registered file and records the result (only while it is still in quarantine). Never throws. */
export async function scanStoredAttachment(attachmentId: string, storageKey: string): Promise<ScanStatus> {
  const scanner = attachmentScanner();
  if (!scanner) return 'sin_analizar';
  try {
    const bytes = await bucketStore('participacion-privado').read(storageKey);
    if (!bytes) throw new Error('el archivo no está en el almacenamiento');
    const r = await scanner.scan(bytes);
    await withSystem((sql) =>
      sql.query(`update public.request_attachments set scan_status = $2, scanned_at = now() where id = $1 and scan_status = 'cuarentena'`, [
        attachmentId,
        r.status,
      ]),
    );
    if (r.status === 'infectado') console.warn(`[archivos] ${attachmentId}: el revisor lo marcó infectado (${r.signature}); nunca se sirve.`);
    return r.status;
  } catch (e) {
    console.error(`[archivos] ${attachmentId}: no se pudo revisar, queda en cuarentena: ${(e as Error).message}`);
    return 'cuarentena';
  }
}

/** For the cron: files still in quarantine (a scan that failed or never ran), oldest first. */
export async function rescanQuarantine(limit = 20): Promise<number> {
  if (!attachmentScanner()) return 0;
  const rows = await withSystem((sql) =>
    sql.query<{ id: string; storage_key: string }>(
      `select id, storage_key from public.request_attachments where scan_status = 'cuarentena' order by created_at limit $1`,
      [limit],
    ),
  );
  let done = 0;
  for (const r of rows) if ((await scanStoredAttachment(r.id, r.storage_key)) !== 'cuarentena') done++;
  return done;
}
