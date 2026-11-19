import fs from 'node:fs';
import path from 'node:path';

// The labels the new website retires on purpose while the guides and 360 still quote them (design §7 of the new
// website, 19/11/2026). The rule stays: every «label» the guides or 360 quote is a text of a screen (src/ outside the
// help content) or of the client's config. While the packages of the new website change the screens one by one, the
// guides, 360 and the docs are rewritten only once, at the end (WP8). In between, a package that removes or renames a
// quoted label lists it in tests/unit/pending-labels/<paquete>.json, and the six label tests accept it:
//   guides-web-content, assistant-answers-content, glossary-web, guides-content, assistant-explain, guides-explain.
// WP8 rewrites the guides, 360 and the docs, deletes the folder and makes those tests require that it no longer exists.
//
// One file per package (its name in lower case: «wp1.json», «wp3.json»…), with this shape:
//   { "paquete": "WP3", "labels": [{ "label": "Hacer un reporte", "why": "La portada ya no lo dice: …" }] }
// «label» is the text exactly as the guides quote it, without the «»; «why» says what replaced it and where.

export const PENDING_LABELS_DIR = path.join(process.cwd(), 'tests', 'unit', 'pending-labels');

export type PendingLabel = { label: string; why: string; paquete: string; file: string };

const FILE_NAME = /^[a-z0-9][a-z0-9-]{0,30}\.json$/;

/** Every pending label of the folder, checked: a file that does not have the shape throws (a test reads it). */
export function readPendingLabels(dir: string = PENDING_LABELS_DIR): PendingLabel[] {
  if (!fs.existsSync(dir)) return [];
  const out: PendingLabel[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!FILE_NAME.test(name)) throw new Error(`${name}: en ${dir} solo van archivos «<paquete>.json» en minúsculas`);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch (e) {
      throw new Error(`${name}: no es JSON (${(e as Error).message})`);
    }
    const file = raw as { paquete?: unknown; labels?: unknown };
    if (typeof file.paquete !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,30}$/.test(file.paquete)) throw new Error(`${name}: «paquete» es el nombre del paquete («WP3»)`);
    if (file.paquete.toLowerCase() !== name.replace(/\.json$/, '')) throw new Error(`${name}: el archivo se llama como su paquete (${file.paquete})`);
    if (!Array.isArray(file.labels)) throw new Error(`${name}: «labels» es una lista`);
    const seen = new Set<string>();
    for (const [i, entry] of file.labels.entries()) {
      const e = entry as { label?: unknown; why?: unknown };
      const where = `${name}, etiqueta ${i + 1}`;
      if (typeof e.label !== 'string' || e.label.trim() !== e.label || e.label.length < 1 || e.label.length > 200) throw new Error(`${where}: «label» es el texto tal como lo citan las guías`);
      if (/[«»]/.test(e.label)) throw new Error(`${where}: «label» va sin «»`);
      if (typeof e.why !== 'string' || e.why.trim().length < 10) throw new Error(`${where}: «why» dice qué la reemplazó y dónde`);
      if (seen.has(e.label)) throw new Error(`${where}: «${e.label}» está dos veces`);
      seen.add(e.label);
      out.push({ label: e.label, why: e.why, paquete: file.paquete, file: name });
    }
  }
  return out;
}

let memo: Set<string> | null = null;

/** Whether a package retired this label on purpose (it is still quoted until WP8 rewrites the guides and 360). */
export function isPendingLabel(label: string): boolean {
  memo ??= new Set(readPendingLabels().map((p) => p.label));
  return memo.has(label);
}
