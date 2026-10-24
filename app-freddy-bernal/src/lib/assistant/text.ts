// Small text helpers shared by the assistant's pieces (pure, no I/O).

/** Same as SQL assistant_plain(): lower case, no accents, only letters/digits and single spaces. */
export function plain(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function firstName(full: string | null | undefined): string {
  return String(full ?? '').trim().split(/\s+/)[0] ?? '';
}

/** The intro when the panel leaves it empty: says the CURRENT name, nothing else about the client. */
export function neutralIntro(name: string): string {
  return `Soy ${name.trim() || 'el asistente'}, el asistente del equipo. Te ayudo con la plataforma.`;
}

export type Huecos = { name: string; app: string; boss: string; person: string };

/** Fills the fixed huecos. Data huecos ([estado], [dias]…) are left for the brain to fill or drop. */
export function fillHuecos(text: string, h: Huecos): string {
  return contract(
    text.replaceAll('[ASISTENTE]', h.name).replaceAll('[APP]', h.app).replaceAll('[JEFE]', h.boss).replaceAll('[NOMBRE]', h.person),
  );
}

/** «de el jefe» → «del jefe», «a el jefe» → «al jefe» (lower-case «el» only: «de El Mirador» stays). */
export function contract(text: string): string {
  return text.replace(/\b([Dd])e el\b/g, '$1el').replace(/\b([Aa]) el\b/g, '$1l');
}

/** Splits into sentences, keeping the punctuation (for the filter and the server nets). */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export const HUECO = /\[[^\]\n]{1,40}\]/;
