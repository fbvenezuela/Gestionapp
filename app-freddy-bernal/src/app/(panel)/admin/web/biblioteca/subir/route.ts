import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { friendlyDbError } from '@/lib/db/core';
import { toMediaInfo } from '@/lib/data/web-admin';
import { bucketStore } from '@/lib/storage/buckets';
import { ALT_MISSING, checkWebMediaFile, maxMediaBytes, sameSite, type WebMediaKind } from '@/lib/web/cms/media-file';

// Uploading a photo or a PDF to the public media library (design §3, §6): one file per POST (multipart «file» with its
// words: alt, caption, credit, title, focalX, focalY). The person's session with its second factor, then the database's
// own gate (can_edit_web: the editor, the publisher, the boss), then the file's checks (type by its first bytes, size,
// dimensions, metadata out), then the file is stored and its row written AS THE PERSON (RLS; the database also
// requires the alternative text of a photo). If the database refuses, the stored copy is removed. JSON answers.

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const unit = (v: FormDataEntryValue | null) => {
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 1000) / 1000)) : 0.5;
};

export async function POST(req: NextRequest) {
  if (!sameSite(req.headers, req.url)) return json(403, { ok: false, error: 'No permitido.' });
  const s = await getSession();
  if (!s || !s.mfaOk) return json(401, { ok: false, error: 'Entra de nuevo para subir archivos.' });
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > maxMediaBytes('document') + 64 * 1024) return json(413, { ok: false, error: 'El archivo es muy pesado para subirlo.' });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json(400, { ok: false, error: 'No llegó el archivo. Vuelve a intentarlo.' });
  const kind: WebMediaKind = form.get('kind') === 'document' ? 'document' : 'image';
  const words = {
    alt: text(form.get('alt'), 300),
    caption: text(form.get('caption'), 500),
    credit: text(form.get('credit'), 200),
    title: text(form.get('title'), 200),
    focalX: unit(form.get('focalX')),
    focalY: unit(form.get('focalY')),
  };
  if (kind === 'image' && words.alt.length < 3) return json(422, { ok: false, error: ALT_MISSING });
  if (kind === 'document' && words.title.length < 3) return json(422, { ok: false, error: 'Escribe el título del documento.' });

  // The database's gate before anything is stored: only who edits the web uploads.
  const allowed = await withUser(s.claims, (sql) => sql.one<{ ok: boolean }>(`select public.can_edit_web() as ok`));
  if (!allowed?.ok) return json(403, { ok: false, error: 'La biblioteca la cambian quienes editan la web, con doble factor.' });

  const checked = checkWebMediaFile({ kind, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!checked.ok) return json(checked.status, { ok: false, error: checked.error });

  const key = `${crypto.randomUUID()}.${checked.ext}`;
  const store = bucketStore('web-public');
  try {
    await store.put(key, checked.bytes, checked.mime);
  } catch (e) {
    console.error('[web] la biblioteca no pudo guardar el archivo:', (e as Error).message);
    return json(502, { ok: false, error: 'No se pudo guardar el archivo. Vuelve a intentarlo.' });
  }
  try {
    const row = await withUser(s.claims, (sql) =>
      sql.one<Parameters<typeof toMediaInfo>[0]>(
        `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt, caption, credit, title, focal_x, focal_y)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning id, storage_key, kind, mime, bytes, width, height, alt, caption, credit, title, focal_x, focal_y, archived_at, created_at,
                   null::text as created_by_name`,
        [key, checked.kind, checked.mime, checked.bytes.length, checked.width, checked.height, words.alt, words.caption, words.credit, words.title, words.focalX, words.focalY],
      ),
    );
    return json(200, { ok: true, media: toMediaInfo(row!) });
  } catch (e) {
    await store.remove(key).catch(() => {});
    const code = (e as { code?: string }).code;
    return json(code === '42501' ? 403 : 422, { ok: false, error: friendlyDbError(e) });
  }
}
