// 360's answers keep the rules of the help content (src/lib/assistant/answers/types.ts): unique ids, real roles, at
// least three ways of asking, short answers, every «…» a label that exists on a screen, no concrete date, time or
// phone, no demo names, a button only to a screen one of its roles can open and a tutorial that exists. An answer that
// drifts from the screens fails here, not in front of the team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, TEAM_ROLES, type Role } from '@/lib/roles';
import { SCREENS, canOpen } from '@/lib/assistant/screens';
import { TOURS } from '@/lib/guides';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, quotedLabels } from '@/lib/guides/check';
import { ANSWERS, ANSWER_FILES, type Answer } from '@/lib/assistant/answers';

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
const labelFound = (label: string) => SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label);

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
