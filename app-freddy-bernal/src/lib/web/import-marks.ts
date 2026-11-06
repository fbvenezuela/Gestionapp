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

/** «[correo retirado]» y «[teléfono retirado]»: the marks as a person reads them in a sentence. */
export function marksText(marks: readonly RemovedMark[]): string {
  const words = marks.map((m) => `«${REMOVED_MARKS[m]}»`);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`;
}
