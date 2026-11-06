import 'server-only';
import { withSystem } from '../db';
import { attachmentStorageKey, cleanAttachment, validateAttachment } from '../participation/files';
import { bucketStore } from './buckets';
import { attachmentScanner, initialScanStatus, type ScanStatus } from './scanner';

// A private file's way in (design §6): checked (extension, size, first bytes), cleaned (photo metadata), stored under a
// random name in participacion-privado, registered by the caller (citizen.add_request_attachment or
// add_request_evidence) with initialScanStatus(), then scanned here as the system. A failed scan leaves it in
// quarantine (never served) and the cron tries again.

export type StoredFile = { storageKey: string; mime: string; bytes: number; scanStatus: 'cuarentena' | 'sin_analizar' };

export async function storePrivateFile(name: string, raw: Uint8Array): Promise<{ ok: true; file: StoredFile } | { ok: false; error: string }> {
  const check = validateAttachment({ name, bytes: raw });
  if (!check.ok) return check;
  const clean = cleanAttachment(raw, check.type);
  if (!clean.ok) return clean;
  const storageKey = attachmentStorageKey(check.type);
  await bucketStore('participacion-privado').put(storageKey, clean.bytes, check.type.mime);
  return { ok: true, file: { storageKey, mime: check.type.mime, bytes: clean.bytes.length, scanStatus: initialScanStatus() } };
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
