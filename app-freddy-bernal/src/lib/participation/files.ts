import { stripPhotoMetadata, type PhotoKind } from '../media/photo-meta';

// The files a citizen attaches and the team's evidence (design §4, §6): JPG, PNG or PDF (and WebP, which a phone's
// re-encoding can produce), up to 8 MB each, 3 per send and 12 per request (the database counts too,
// citizen.add_request_attachment). The name's extension and the first bytes must agree: a «foto.jpg» that is a PDF, a
// page or a program is refused. Photos lose their metadata before they are stored (GPS position, camera, date, XMP,
// IPTC, comments, text chunks: src/lib/media/photo-meta.ts, the same lossless cleaning as the panel's photos); the
// browser already re-encodes them, this is the server's own check. A PDF is kept as it came: it is never shown inside
// a page (always downloaded, with the sandbox headers) and production serves it only once the scanner says «limpio».
// Pure (no Node imports): the form can run the same checks before uploading.

// A photo's size in pixels too (its header says it; nothing is decoded on the server): a file of a few kilobytes can
// claim 50 000 × 50 000 pixels and hang the browser of whoever opens it. The same bounds as the media library.
export const ATTACHMENT_LIMITS = { maxBytes: 8 * 1024 * 1024, perSend: 3, perRequest: 12, maxSide: 12_000, maxPixels: 60_000_000 } as const;

export type AttachmentType =
  | { mime: 'image/jpeg'; ext: 'jpg'; kind: 'image'; photo: PhotoKind }
  | { mime: 'image/png'; ext: 'png'; kind: 'image'; photo: PhotoKind }
  | { mime: 'image/webp'; ext: 'webp'; kind: 'image'; photo: PhotoKind }
  | { mime: 'application/pdf'; ext: 'pdf'; kind: 'pdf' };

const JPG: AttachmentType = { mime: 'image/jpeg', ext: 'jpg', kind: 'image', photo: 'jpeg' };
const PNG: AttachmentType = { mime: 'image/png', ext: 'png', kind: 'image', photo: 'png' };
const WEBP: AttachmentType = { mime: 'image/webp', ext: 'webp', kind: 'image', photo: 'webp' };
const PDF: AttachmentType = { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' };
const BY_EXTENSION: Record<string, AttachmentType> = { jpg: JPG, jpeg: JPG, png: PNG, webp: WEBP, pdf: PDF };

/** What the first bytes say the file is (never its name or the browser's claim), among the accepted types. */
export function sniffAttachment(b: Uint8Array): AttachmentType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return JPG;
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return PNG;
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return WEBP;
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === '%PDF-') return PDF;
  return null;
}

export type AttachmentCheck = { ok: true; type: AttachmentType } | { ok: false; error: string };

/** The extension, the size and the first bytes, in that order; the error in the person's words. */
export function validateAttachment(f: { name: string; bytes: Uint8Array }): AttachmentCheck {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(f.name.trim())?.[1]?.toLowerCase() ?? '';
  const byName = BY_EXTENSION[ext];
  if (!byName) return { ok: false, error: 'Ese tipo de archivo no se admite. Solo se aceptan fotos JPG, PNG o WebP y documentos PDF.' };
  if (f.bytes.length === 0) return { ok: false, error: 'El archivo está vacío.' };
  if (f.bytes.length > ATTACHMENT_LIMITS.maxBytes) return { ok: false, error: 'El archivo supera los 8 MB. Envíe uno más liviano.' };
  const real = sniffAttachment(f.bytes);
  if (!real || real.mime !== byName.mime) return { ok: false, error: 'El archivo no corresponde a su extensión. Verifique que sea una foto o un PDF.' };
  return { ok: true, type: real };
}

/** How many more fit: on this send and on the whole request. */
export function attachmentRoom(already: { thisSend: number; request: number }): number {
  return Math.max(0, Math.min(ATTACHMENT_LIMITS.perSend - already.thisSend, ATTACHMENT_LIMITS.perRequest - already.request));
}

export type CleanAttachment = { ok: true; bytes: Uint8Array; width: number | null; height: number | null } | { ok: false; error: string };

/** The bytes to store: a photo without its metadata (lossless), a PDF as it came. */
export function cleanAttachment(bytes: Uint8Array, type: AttachmentType): CleanAttachment {
  if (type.kind === 'pdf') return { ok: true, bytes, width: null, height: null };
  const clean = stripPhotoMetadata(type.photo, bytes);
  if (!clean) return { ok: false, error: 'No se pudo procesar la foto. Elíjala de nuevo desde la galería o tómela otra vez.' };
  if (Math.max(clean.width, clean.height) > ATTACHMENT_LIMITS.maxSide || clean.width * clean.height > ATTACHMENT_LIMITS.maxPixels) {
    return { ok: false, error: 'La foto es demasiado grande. Envíela desde la galería del teléfono o tómela de nuevo.' };
  }
  return { ok: true, bytes: clean.bytes, width: clean.width, height: clean.height };
}

/** A random name in the private bucket, «<uuid>.<ext>» (request_attachments.storage_key's shape). */
export function attachmentStorageKey(type: AttachmentType, uuid: string = globalThis.crypto.randomUUID()): string {
  return `${uuid.toLowerCase()}.${type.ext}`;
}
