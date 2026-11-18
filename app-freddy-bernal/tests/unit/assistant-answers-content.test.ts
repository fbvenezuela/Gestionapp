// 360's answers keep the rules of the help content (src/lib/assistant/answers/types.ts): unique ids, real roles, at
// least three ways of asking, short answers, every «…» a label that exists on a screen, no concrete date, time or
// phone, no demo names, a button only to a screen one of its roles can open and a tutorial that exists. An answer that
// drifts from the screens fails here, not in front of the team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, TEAM_ROLES, type Role } from '@/lib/roles';
import { SCREENS, canOpen, domainOfScreen } from '@/lib/assistant/screens';
import { TOURS } from '@/lib/guides';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, hasReceiptCode, quotedLabels } from '@/lib/guides/check';
import { clientWords } from '@/lib/guides/web/words';
import { ANSWERS, ANSWER_FILES, type Answer } from '@/lib/assistant/answers';
import { HUECO } from '@/lib/assistant/text';

// The screens' text: src/ outside the help content (the guides and these answers), without comments.
const HELP_DIRS = [path.join('src', 'lib', 'guides'), path.join('src', 'lib', 'assistant', 'answers')];
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return HELP_DIRS.some((h) => p.startsWith(h)) ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
const withoutComments = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\s\/\/\s.*$/gm, ' ');
const SOURCE = sourceFiles('src')
  .map((f) => withoutComments(fs.readFileSync(f, 'utf8')))
  .join('\n')
  .replace(/\s+/g, ' ');
// The counted labels carry the team guide's example number («Aprobar todas las verdes (2)», «5 personas», «Mes 1 · 8
// de 8»), and some labels are built from a value («Nivel amarillo», «Publicar antes (#20)»): the guides' LABEL_PATTERNS
// (check.ts) take them, and guides-content.test.ts checks that each pattern's source is still in src/.
const labelFound = (label: string) =>
  SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label);

const HUECOS = ['[ASISTENTE]', '[APP]', '[JEFE]', '[NOMBRE]'];
const EVERYONE: Role[] = ['admin', ...TEAM_ROLES];
const textsOf = (a: Answer): [string, string][] => (typeof a.a === 'string' ? [['', a.a]] : Object.entries(a.a).filter((e): e is [string, string] => typeof e[1] === 'string'));
const fileOf = (a: Answer) => Object.entries(ANSWER_FILES).find(([, list]) => list.includes(a))?.[0] ?? '?';

describe('las respuestas de 360', () => {
  it('cada id es único y bien escrito', () => {
    const seen = new Map<string, string>();
    const bad: string[] = [];
    for (const a of ANSWERS) {
      if (!/^[a-z0-9-]{3,60}$/.test(a.id)) bad.push(`${fileOf(a)}: id «${a.id}»`);
      if (seen.has(a.id)) bad.push(`${fileOf(a)}: id repetido «${a.id}» (también en ${seen.get(a.id)})`);
      seen.set(a.id, fileOf(a));
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('roles reales, al menos tres formas de preguntar y una respuesta por rol que la tiene', () => {
    const bad: string[] = [];
    for (const a of ANSWERS) {
      const where = `${fileOf(a)}/${a.id}`;
      if (a.roles !== null && (!a.roles.length || a.roles.some((r) => !ROLES.includes(r)))) bad.push(`${where}: roles ${JSON.stringify(a.roles)}`);
      if (a.q.length < 3) bad.push(`${where}: solo ${a.q.length} formas de preguntar`);
      if (new Set(a.q.map((q) => q.trim().toLowerCase())).size !== a.q.length) bad.push(`${where}: una forma de preguntar repetida`);
      for (const q of a.q) if (q.trim().length < 3 || q.length > 200) bad.push(`${where}: pregunta «${q}»`);
      if (typeof a.a !== 'string') {
        const keys = Object.keys(a.a);
        if (!keys.length) bad.push(`${where}: respuesta vacía`);
        for (const k of keys) {
          if (k === 'default') continue;
          if (!ROLES.includes(k as Role)) bad.push(`${where}: clave «${k}» no es un rol`);
          else if (a.roles !== null && !a.roles.includes(k as Role)) bad.push(`${where}: respuesta para «${k}», que no está en roles`);
        }
        const covered = (a.roles ?? EVERYONE).every((r) => k(a.a, r));
        if (!covered && !('default' in a.a)) bad.push(`${where}: sin respuesta para algún rol de roles y sin «default»`);
      }
    }
    function k(t: Answer['a'], r: Role) {
      return typeof t !== 'string' && typeof t[r] === 'string';
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('respuestas cortas, sin fechas, horas ni teléfonos concretos, sin nombres de la demo ni de la referencia', () => {
    const bad: string[] = [];
    for (const a of ANSWERS) {
      for (const [key, text] of textsOf(a)) {
        const where = `${fileOf(a)}/${a.id}${key ? `/${key}` : ''}`;
        if (text.trim().length < 15 || text.length > 480) bad.push(`${where}: ${text.length} letras`);
        if (concreteDateTime(text)) bad.push(`${where}: fecha u hora concreta`);
        if (hasPhone(text)) bad.push(`${where}: teléfono`);
        for (const w of DEMO_WORDS) if (new RegExp(`\\b${w}\\b`).test(text)) bad.push(`${where}: nombre de la demo «${w}»`);
        if (/\bmila\b/i.test(text)) bad.push(`${where}: nombra la referencia`);
        if (/\[\[|\]\]/.test(text)) bad.push(`${where}: marca de título`);
        for (const h of text.match(/\[[A-Z]+\]/g) ?? []) if (!HUECOS.includes(h)) bad.push(`${where}: hueco desconocido ${h}`);
        // Any other [corchete] reads as an unfilled hueco to the output net (brain.ts filterOutput), which drops its sentence.
        if (HUECO.test(text.replace(/\[(?:ASISTENTE|APP|JEFE|NOMBRE)\]/g, ''))) bad.push(`${where}: un [corchete]: 360 lo toma por hueco y calla la frase`);
      }
      for (const q of a.q) if (concreteDateTime(q) || hasPhone(q)) bad.push(`${fileOf(a)}/${a.id}: la pregunta «${q}» trae fecha, hora o teléfono`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('cada «…» es un texto que existe en una pantalla', () => {
    const bad: string[] = [];
    for (const a of ANSWERS) {
      for (const [key, text] of textsOf(a)) {
        const where = `${fileOf(a)}/${a.id}${key ? `/${key}` : ''}`;
        if (!balancedQuotes(text)) bad.push(`${where}: «» sin cerrar`);
        for (const label of quotedLabels(text)) if (!labelFound(label)) bad.push(`${where}: «${label}» no está en ninguna pantalla`);
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('el botón va a una pantalla que alguno de sus roles abre, y el tutorial existe', () => {
    const bad: string[] = [];
    for (const a of ANSWERS) {
      const where = `${fileOf(a)}/${a.id}`;
      if (a.go !== undefined) {
        if (!SCREENS.some((s) => s.href === a.go)) bad.push(`${where}: botón a «${a.go}», que no es una pantalla de SCREENS`);
        else if (!(a.roles ?? EVERYONE).some((r) => canOpen(a.go!, [r]))) bad.push(`${where}: ninguno de sus roles abre «${a.go}»`);
      }
      if (a.tutorial !== undefined && !TOURS.some((t) => t.id === a.tutorial)) bad.push(`${where}: tutorial «${a.tutorial}» no existe`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });
});

// The long tail of «Web» and «Atención» (answers/web.ts and answers/atencion.ts, WF-C): only the boss and Administración
// ask it, each with a text of their own; it says the screens' words and nothing of the client, of a citizen or of the
// app's inside; and its button goes to a screen of the web or of Atención (or its guide) that every one of its roles
// opens, never to a team screen.
describe('las respuestas de 360 sobre «Web» y «Atención»', () => {
  const WEB_FILES = ['web', 'atencion'] as const;
  const list = WEB_FILES.flatMap((f) => (ANSWER_FILES[f] ?? []).map((a) => [f, a] as const));
  // The client's words come from config/clients (guides/web/words.ts), never from src: the program, the paper, the
  // official site and the organization, and the client's own names.
  const words = clientWords();
  const CLIENT = [words.program, words.weekly, words.officialSite, words.organization, 'freddy', 'bernal', 'freddybernaloficial'].filter((w) => w && w.length > 3);
  const INTERNAL = /\bbase de datos\b|\bservidor(?:es)?\b|\bsupabase\b|\bfase\b|\bnpm\b|\bD-\d{2,3}\b|\.tsx?\b|\bsrc\//i;
  // «usted» only inside «» (the web's own words, as the screen says them) or as the register's name («de usted»).
  const usted = (t: string) => /\busted\b/i.test(t.replace(/«[^«»]*(?:«[^«»]*»[^«»]*)*»/g, ' ').replace(/\bde usted\b/gi, ' '));

  it('los dos archivos están en el índice y tienen respuestas', () => {
    expect(ANSWER_FILES.web?.length ?? 0).toBeGreaterThan(40);
    expect(ANSWER_FILES.atencion?.length ?? 0).toBeGreaterThan(40);
    for (const [, a] of list) expect(ANSWERS).toContain(a);
  });

  it('solo para el jefe y Administración, con su id de la web o de Atención y un texto para cada uno', () => {
    const bad: string[] = [];
    for (const [file, a] of list) {
      const where = `${file}/${a.id}`;
      const roles = a.roles ?? [];
      if (!roles.length || roles.some((r) => r !== 'boss' && r !== 'admin')) bad.push(`${where}: roles ${JSON.stringify(a.roles)}`);
      // The index puts an entry in the web's or Atención's domain by its id (engine.ts curatedEntries).
      if (!/(?:^|-)(?:web|atencion)(?:-|$)/.test(a.id)) bad.push(`${where}: el id no dice «web» ni «atencion»`);
      if (file === 'atencion' && !a.id.startsWith('atencion-')) bad.push(`${where}: un id de atencion.ts empieza por «atencion-»`);
      if (typeof a.a !== 'string') for (const r of roles) if (typeof a.a[r] !== 'string') bad.push(`${where}: sin texto para ${r}`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('sin palabras del cliente, códigos, claves, nada interno, raya larga, «usted» fuera de comillas ni [corchetes]', () => {
    const bad: string[] = [];
    for (const [file, a] of list)
      for (const [key, text] of textsOf(a)) {
        const where = `${file}/${a.id}${key ? `/${key}` : ''}`;
        const low = text.toLowerCase();
        for (const w of CLIENT) if (low.includes(w.toLowerCase())) bad.push(`${where}: palabra del cliente «${w}»`);
        if (hasReceiptCode(text)) bad.push(`${where}: un código o una clave`);
        if (INTERNAL.test(text)) bad.push(`${where}: algo interno`);
        if (/—/.test(text)) bad.push(`${where}: raya larga`);
        if (usted(text)) bad.push(`${where}: «usted» fuera de comillas`);
        // A «[Por escribir]» reads as an unfilled hueco to the output net (brain.ts filterOutput), which drops its sentence.
        if (HUECO.test(text.replace(/\[(?:ASISTENTE|APP|JEFE|NOMBRE)\]/g, ''))) bad.push(`${where}: un [corchete]: 360 lo toma por hueco y calla la frase`);
      }
    for (const [file, a] of list) for (const q of a.q) if (hasReceiptCode(q) || CLIENT.some((w) => q.toLowerCase().includes(w.toLowerCase()))) bad.push(`${file}/${a.id}: la pregunta «${q}»`);
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('el botón va a una pantalla de la web o de Atención (o a su guía) que abre cada uno de sus roles', () => {
    const bad: string[] = [];
    for (const [file, a] of list) {
      if (!a.go) continue;
      const where = `${file}/${a.id} → ${a.go}`;
      // (Administración's own «Equipo», where it gives the web's and Atención's roles, and its «Buzón»: for its answers only.)
      const adminOwn = ['/ajustes/equipo', '/ajustes/buzon'].includes(a.go) && a.roles?.length === 1 && a.roles[0] === 'admin';
      if (domainOfScreen(a.go) === 'equipo' && !adminOwn) bad.push(`${where}: pantalla del equipo`);
      for (const r of a.roles ?? []) if (!canOpen(a.go, [r])) bad.push(`${where}: ${r} no la abre`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });
});
