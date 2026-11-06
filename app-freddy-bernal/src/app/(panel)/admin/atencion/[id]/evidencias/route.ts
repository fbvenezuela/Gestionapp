import { after, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { friendlyDbError } from '@/lib/db/core';
import { isUuid, jsonResponse, maxAttachmentBytes, sameOrigin } from '@/lib/actions/participation-core';
import { deskAccess } from '@/lib/domain/attention';
import { readFormCapped } from '@/lib/request-body';
import { dropPrivateFile, preparePrivateFile, putPrivateFile, scanStoredAttachment } from '@/lib/storage/participation-files';

const NOT_YOURS = 'No encontramos esa solicitud o no te toca atenderla.';

// An evidence of the attention (design §5, §6): a photo «después» or a paper, uploaded by whoever works the case, into
// the private bucket (never public). Checked and cleaned in memory like the citizen's files (preparePrivateFile: type
// by its first bytes, size, pixels, photo metadata), registered AS THE PERSON with add_request_evidence() (the database
// decides whether they may work this case; a responsible of another area gets the one «not found») and only then
// written, inside the same transaction: a refused one never reaches the bucket. Scanned after the response. The body
// is read with a cap (with or without Content-Length). Multipart: «file», and «shared» = «1» to show it to the person
// in their consultation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return jsonResponse(403, { ok: false, error: 'No permitido.' });
  const { id } = await params;
  if (!isUuid(id)) return jsonResponse(404, { ok: false, error: NOT_YOURS });
  const s = await getSession();
  if (!s || !s.mfaOk) return jsonResponse(401, { ok: false, error: 'Entra de nuevo.' });
  if (!deskAccess(s.roles).works) return jsonResponse(403, { ok: false, error: 'Las evidencias las suben quienes atienden el caso.' });
  const max = maxAttachmentBytes();
  const tooBig = `El archivo pasa de ${Math.round(max / (1024 * 1024))} MB: sube uno más liviano.`;
  const body = await readFormCapped(req, max + 64 * 1024);
  if (!body.ok && body.reason === 'too_big') return jsonResponse(413, { ok: false, error: tooBig });
  if (!body.ok) return jsonResponse(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  const form = body.form;
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonResponse(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  if (file.size > max) return jsonResponse(413, { ok: false, error: tooBig });
  const shared = form.get('shared') === '1';

  const prepared = preparePrivateFile(file.name || 'evidencia', new Uint8Array(await file.arrayBuffer()));
  if (!prepared.ok) return jsonResponse(422, { ok: false, error: prepared.error });
  const f = prepared.file;
  let written = false;
  try {
    const row = await withUser(s.claims, async (sql) => {
      const r = await sql.one<{ id: string }>(`select public.add_request_evidence($1, $2, $3, $4, $5, $6) as id`, [id, f.storageKey, f.mime, f.bytes, f.scanStatus, shared]);
      await putPrivateFile(f);
      written = true;
      return r;
    });
    after(() => scanStoredAttachment(row!.id, f.storageKey));
    return jsonResponse(200, { ok: true, id: row!.id });
  } catch (e) {
    if (written) await dropPrivateFile(f.storageKey);
    const code = (e as { code?: string })?.code;
    if (code === '42501') return jsonResponse(404, { ok: false, error: NOT_YOURS });
    if (code === 'P0001') return jsonResponse(409, { ok: false, error: friendlyDbError(e) });
    console.error('[atencion] evidencia:', (e as Error).message);
    return jsonResponse(500, { ok: false, error: friendlyDbError(e) });
  }
}
