import { after, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { friendlyDbError } from '@/lib/db/core';
import { isUuid, jsonResponse, maxAttachmentBytes, sameOrigin } from '@/lib/actions/participation-core';
import { deskAccess } from '@/lib/domain/attention';
import { bucketStore } from '@/lib/storage/buckets';
import { scanStoredAttachment, storePrivateFile } from '@/lib/storage/participation-files';

const NOT_YOURS = 'No encontramos esa solicitud o no te toca atenderla.';

// An evidence of the attention (design §5, §6): a photo «después» or a paper, uploaded by whoever works the case, into
// the private bucket (never public). Checked and cleaned like the citizen's files (storePrivateFile: type by its first
// bytes, size, photo metadata), registered AS THE PERSON with add_request_evidence() (the database decides whether they
// may work this case; a responsible of another area gets the one «not found»), scanned after the response. When the
// database refuses it, the stored copy goes: nothing stays in the bucket without its row. Multipart: «file», and
// «shared» = «1» to show it to the person in their consultation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return jsonResponse(403, { ok: false, error: 'No permitido.' });
  const { id } = await params;
  if (!isUuid(id)) return jsonResponse(404, { ok: false, error: NOT_YOURS });
  const s = await getSession();
  if (!s || !s.mfaOk) return jsonResponse(401, { ok: false, error: 'Entra de nuevo.' });
  if (!deskAccess(s.roles).works) return jsonResponse(403, { ok: false, error: 'Las evidencias las suben quienes atienden el caso.' });
  const max = maxAttachmentBytes();
  const tooBig = `El archivo pasa de ${Math.round(max / (1024 * 1024))} MB: sube uno más liviano.`;
  if (Number(req.headers.get('content-length') ?? '0') > max + 64 * 1024) return jsonResponse(413, { ok: false, error: tooBig });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonResponse(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  if (file.size > max) return jsonResponse(413, { ok: false, error: tooBig });
  const shared = form.get('shared') === '1';

  const stored = await storePrivateFile(file.name || 'evidencia', new Uint8Array(await file.arrayBuffer()));
  if (!stored.ok) return jsonResponse(422, { ok: false, error: stored.error });
  const f = stored.file;
  try {
    const row = await withUser(s.claims, (sql) =>
      sql.one<{ id: string }>(`select public.add_request_evidence($1, $2, $3, $4, $5, $6) as id`, [id, f.storageKey, f.mime, f.bytes, f.scanStatus, shared]),
    );
    after(() => scanStoredAttachment(row!.id, f.storageKey));
    return jsonResponse(200, { ok: true, id: row!.id });
  } catch (e) {
    await bucketStore('participacion-privado').remove(f.storageKey).catch(() => {});
    const code = (e as { code?: string })?.code;
    if (code === '42501') return jsonResponse(404, { ok: false, error: NOT_YOURS });
    if (code === 'P0001') return jsonResponse(409, { ok: false, error: friendlyDbError(e) });
    console.error('[atencion] evidencia:', (e as Error).message);
    return jsonResponse(500, { ok: false, error: friendlyDbError(e) });
  }
}
