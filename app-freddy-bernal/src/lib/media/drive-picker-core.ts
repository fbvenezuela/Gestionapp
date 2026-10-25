// «Elegir de Drive» (Administración): the pure part of the Google Picker flow, tested without a
// browser. The Picker hands back file ids only; the server reads everything else from Drive.

const VIDEO = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp'];
const IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav'];
const DOCS = ['application/pdf', 'application/zip', 'application/x-zip-compressed', 'image/vnd.adobe.photoshop'];

/** The types the Picker lists for each kind of material (the server checks again). */
export function pickerMimeTypes(kind: string): string {
  switch (kind) {
    case 'cover':
    case 'evidence':
    case 'tweet_image':
      return IMAGE.join(',');
    case 'final':
      return [...VIDEO, ...IMAGE].join(',');
    case 'voice_line':
      return [...AUDIO, ...VIDEO].join(',');
    case 'editable':
      return [...DOCS, ...VIDEO, ...IMAGE, ...AUDIO].join(',');
    default:
      return [...VIDEO, ...IMAGE, ...AUDIO].join(',');
  }
}

const ID = /^[A-Za-z0-9_-]{10,200}$/;
// More than this in one go is better done with the import script.
export const PICK_MAX = 50;

type PickedDoc = { id?: unknown; mimeType?: unknown; type?: unknown };

/** The ids of what was picked: valid, once each, folders left out, at most PICK_MAX. */
export function pickedIds(docs: unknown): string[] {
  if (!Array.isArray(docs)) return [];
  const out: string[] = [];
  for (const d of docs as PickedDoc[]) {
    if (!d || typeof d.id !== 'string' || !ID.test(d.id)) continue;
    if (d.mimeType === 'application/vnd.google-apps.folder' || d.type === 'folder') continue;
    if (!out.includes(d.id)) out.push(d.id);
    if (out.length >= PICK_MAX) break;
  }
  return out;
}

export function pickProgress(done: number, total: number): string {
  return total > 1 ? `Agregando ${Math.min(done + 1, total)} de ${total}…` : 'Agregando…';
}

/** The toast after registering: how many went in, and the first reason one did not. */
export function pickSummary(added: number, failed: number, firstError: string | null): { ok: boolean; text: string } {
  if (!failed) return { ok: true, text: added === 1 ? 'Listo: se agregó 1 archivo de Drive.' : `Listo: se agregaron ${added} archivos de Drive.` };
  if (!added) return { ok: false, text: firstError ?? 'No se pudo agregar.' };
  return { ok: false, text: `Se agregaron ${added}; ${failed} no: ${firstError ?? 'revisa el tipo de archivo.'}` };
}

/** «Traer lo nuevo de Drive»: what one round of the import scan found. */
export function importSummary(r: { added: number; failed: number; error: string | null }): { ok: boolean; text: string } {
  if (!r.added && !r.failed) return { ok: true, text: 'No hay nada nuevo en la carpeta «Importado».' };
  return pickSummary(r.added, r.failed, r.error);
}
