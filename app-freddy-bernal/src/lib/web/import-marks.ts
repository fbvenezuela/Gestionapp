// What the importer of the old website (scripts/web-import, docs/PLAN-MIGRACION-Y-PRODUCCION.md) leaves for a person
// to finish, in words the editor reads:
//   * the alternative text of a photo it brought without one: the database requires alt text on every image and the
//     importer never invents it, so it writes this placeholder;
//   * the personal data it took out of a text (an email, a phone number, an ID card number), replaced by a mark that
//     says what was there.
// None of them ever reaches the public: «Enviar a aprobación» and «Publicar» say what is missing (cms/drafts.ts,
// src/lib/actions/web.ts) and the database refuses to publish them anyway (guard_web_item_ready in
// 20261106300100_web_importador.sql, with these same words: tests/unit/web-import-marks.test.ts checks both). Pure.

/** The start of the importer's alternative text: a photo whose alt starts like this is not ready to be published. */
export const ALT_PLACEHOLDER_PREFIX = '[Por escribir]';
export const ALT_PLACEHOLDER = `${ALT_PLACEHOLDER_PREFIX} Foto traída de la web vieja: describe lo que se ve.`;

/** What the importer writes where it took out a piece of personal data. */
export const REMOVED_MARKS = {
  email: '[correo retirado]',
  phone: '[teléfono retirado]',
  id: '[cédula retirada]',
} as const;
export type RemovedMark = keyof typeof REMOVED_MARKS;

export function isAltPlaceholder(alt: string | null | undefined): boolean {
  return typeof alt === 'string' && alt.trim().startsWith(ALT_PLACEHOLDER_PREFIX);
}

/** Which of the importer's marks appear in any text of a draft (at any depth), in a fixed order. */
export function removedMarksIn(value: unknown): RemovedMark[] {
  const found = new Set<RemovedMark>();
  const walk = (x: unknown) => {
    if (typeof x === 'string') {
      for (const [k, mark] of Object.entries(REMOVED_MARKS) as [RemovedMark, string][]) if (x.includes(mark)) found.add(k);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(value);
  return (Object.keys(REMOVED_MARKS) as RemovedMark[]).filter((k) => found.has(k));
}

// What the importer flags for a person to review in each imported draft (web_import_items.review_flags): the report of
// the import and the editor (/admin/web/editar/[id]) say it with these words.
export const REVIEW_FLAGS = {
  email_removed: 'Se quitaron correos del texto: quedó «[correo retirado]».',
  phone_removed: 'Se quitaron teléfonos del texto: quedó «[teléfono retirado]».',
  id_removed: 'Se quitaron números de cédula del texto: quedó «[cédula retirada]».',
  embed_removed: 'Tenía algo insertado de otra página (un marco, un reproductor o un formulario) que no se trajo.',
  embed_replaced: 'Tenía una publicación de una red social insertada: quedó un enlace a ella.',
  video_extra: 'Tenía más de un video de YouTube: el primero es el video de la nota y los demás quedaron como enlaces.',
  table_flattened: 'Tenía una tabla: quedó como lista, fila por fila.',
  image_external: 'Tenía fotos de otras páginas: no se trajeron (súbelas a la biblioteca si hacen falta).',
  image_failed: 'Alguna foto no se pudo traer (no estaba o no se pudo leer).',
  image_unsupported: 'Alguna foto venía en un formato que la biblioteca no acepta (GIF, AVIF u otro).',
  alt_missing: 'Fotos sin texto alternativo: dicen «[Por escribir]»; escríbelo en la biblioteca antes de publicar.',
  media_skipped: 'Alguna foto no se trajo de la web vieja: súbela a la biblioteca si hace falta.',
  gallery_truncated: 'Tenía más de 24 fotos: la galería lleva las primeras 24.',
  text_truncated: 'El texto era más largo de lo que cabe: revisa el final contra la nota vieja.',
  pdf_link: 'Enlaza un PDF de la web vieja: súbelo a la biblioteca si debe seguir en línea.',
  numeric_slug: 'Su dirección vieja era solo un número: la nueva sale del título.',
  title_truncated: 'El título era muy largo y se cortó.',
  title_missing: 'No tenía título: se puso «Nota del …»; escribe uno.',
  no_body: 'No tenía texto.',
  slug_changed: 'Su dirección vieja no servía tal cual en la web nueva: tiene una parecida.',
  heading_long: 'Un subtítulo era muy largo y quedó como párrafo en negrita.',
} as const;
export type ReviewFlag = keyof typeof REVIEW_FLAGS;

/** The flags a draft carries, in words (unknown ones are left out). */
export function reviewFlagTexts(flags: readonly string[]): string[] {
  return flags.filter((f): f is ReviewFlag => f in REVIEW_FLAGS).map((f) => REVIEW_FLAGS[f]);
}

/** «[correo retirado]» y «[teléfono retirado]»: the marks as a person reads them in a sentence. */
export function marksText(marks: readonly RemovedMark[]): string {
  const words = marks.map((m) => `«${REMOVED_MARKS[m]}»`);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`;
}
