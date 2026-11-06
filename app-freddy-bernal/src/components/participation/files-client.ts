'use client';

import { compressImage } from '@/lib/media/probe';
import { validateAttachment } from '@/lib/participation/files';

// The files of a request in the browser (design §4, §6): a photo leaves the phone without its metadata (GPS position,
// camera, date) and, when it is big, re-encoded smaller (compressImage, the panel's own helper); a PDF goes as it is.
// Then the same checks the server makes again (extension, size, first bytes). Each file goes up on its own POST, so one
// that fails can be retried without sending the rest again.

/** Photos are scaled down to this side: plenty to see a problem, light on a bad connection. */
const PHOTO_SIDE = 2048;

export type Prepared = { ok: true; file: File } | { ok: false; error: string };

export async function prepareFile(file: File, maxBytes: number): Promise<Prepared> {
  let out = file;
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const pdf = String.fromCharCode(...head) === '%PDF-';
    if (!pdf) out = await compressImage(file, PHOTO_SIDE, 0.82);
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'No pudimos preparar esa foto. Vuelve a elegirla.' };
  }
  if (out.size > maxBytes) return { ok: false, error: `El archivo pasa de ${Math.round(maxBytes / (1024 * 1024))} MB: manda uno más liviano.` };
  const check = validateAttachment({ name: out.name, bytes: new Uint8Array(await out.arrayBuffer()) });
  return check.ok ? { ok: true, file: out } : { ok: false, error: check.error };
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/** One file to one of the attention routes (multipart, the answer is JSON). Never throws. */
export async function uploadFile(url: string, fields: Record<string, string>, file: File): Promise<UploadResult> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set('file', file, file.name);
  try {
    const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', cache: 'no-store' });
    let body: { ok?: boolean; id?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON (a proxy's page): the generic text below */
    }
    if (res.ok && body.ok && typeof body.id === 'string') return { ok: true, id: body.id };
    if (body.error) return { ok: false, error: body.error };
    if (res.status === 413) return { ok: false, error: 'El archivo es muy pesado para subirlo: manda uno más liviano.' };
    return { ok: false, error: 'No se pudo subir el archivo. Vuelve a intentarlo.' };
  } catch {
    return { ok: false, error: 'No se pudo subir: revisa la señal y vuelve a intentarlo.' };
  }
}
