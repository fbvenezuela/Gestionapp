// «Explicado fácil» (src/lib/guides/explain.ts, design §4(c)) keeps the rules of the help content: every key is an entry
// of 360's answer index (or a whole flow), every task, screen, flow, topic of «Para todos» and word of «Palabras de la
// app» has its easy text and its example, the easy text is short and simpler than the guide's, every «…» is a label that
// exists on a screen, and no facet says a date, an hour, a phone, a demo name, a client word or anything internal.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, TEAM_ROLES, type Role } from '@/lib/roles';
import { FLOWS, GLOSSARY, SHARED } from '@/lib/guides';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, quotedLabels } from '@/lib/guides/check';
import { FLOW_FACET_IDS, explainFacets, type FacetText } from '@/lib/guides/explain';
import { allEntries, textFor } from '@/lib/assistant/answers/engine';
import { sentencesOf } from '@/lib/assistant/explain';
import { isPendingLabel } from './helpers/pending-labels';

// The screens' text: src/ outside the help content (the guides, 360's answers and 360's explain lines), without comments.
const HELP = [path.join('src', 'lib', 'guides'), path.join('src', 'lib', 'assistant', 'answers'), path.join('src', 'lib', 'assistant', 'explain.ts')];
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (HELP.some((h) => p.startsWith(h))) return [];
    if (d.isDirectory()) return sourceFiles(p);
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
const labelFound = (label: string) => SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label) || isPendingLabel(label);

const FACETS = explainFacets();
const ENTRIES = new Map(allEntries().map((e) => [e.id, e]));
const EVERYONE: Role[] = [...TEAM_ROLES, 'admin'];
// The web's and Atención's screens get their facets from their own sections (design §4(c)5), not from here.
const WEB_SCREEN = /^\/admin\/(?:web|atencion)/;

/** Each text of a facet, with the role key it is said to («» for one text for everyone). */
function textsOf(t: FacetText | undefined): [string, string][] {
  if (t === undefined) return [];
  if (typeof t === 'string') return [['', t]];
  return Object.entries(t).filter((e): e is [string, string] => typeof e[1] === 'string');
}
const ALL: { where: string; facet: 'easy' | 'example' | 'why'; text: string }[] = Object.entries(FACETS).flatMap(([id, f]) =>
  (['easy', 'example', 'why'] as const).flatMap((facet) => textsOf(f[facet]).map(([k, text]) => ({ where: `${id}.${facet}${k ? `/${k}` : ''}`, facet, text }))),
);

describe('«Explicado fácil»: las claves', () => {
  it('cada clave es una entrada del índice de 360, o un flujo entero (flujo:<id>)', () => {
    const flows = new Set(FLOWS.map((f) => `flujo:${f.id}`));
    const bad = Object.keys(FACETS).filter((id) => !ENTRIES.has(id) && !flows.has(id));
    expect(bad).toEqual([]);
    expect(FLOW_FACET_IDS.every((id) => flows.has(id))).toBe(true);
  });

  it('cada tarea, pantalla, flujo, tema de «Para todos» y palabra tiene su versión fácil y su ejemplo', () => {
    const want = [
      ...allEntries()
        // (The web's and Atención's entries, screens and tasks alike, are explained from their own sections.)
        .filter((e) => (e.domain ?? 'equipo') === 'equipo')
        .filter((e) => e.kind === 'task' || e.kind === 'topic' || e.kind === 'term' || (e.kind === 'screen' && !WEB_SCREEN.test(e.screen ?? '')))
        .map((e) => e.id),
      ...FLOWS.map((f) => `flujo:${f.id}`),
    ];
    const missing = want.filter((id) => !FACETS[id]?.easy || !FACETS[id]?.example);
    expect(missing).toEqual([]);
    // The ones the guide has: the 52 tasks, the 8 topics, the 28 words and the 9 flows at least.
    expect(want.length).toBeGreaterThanOrEqual(52 + 8 + 28 + 9 + 100);
    expect(GLOSSARY.every((g) => FACETS[`palabra:${g.id}`]?.easy)).toBe(true);
    expect(SHARED.every((t) => FACETS[`todos:${t.id}`]?.easy)).toBe(true);
  });

  it('las claves por rol son roles de verdad, y de quien recibe esa entrada', () => {
    const bad: string[] = [];
    for (const [id, f] of Object.entries(FACETS)) {
      const roles = ENTRIES.get(id)?.roles ?? EVERYONE;
      for (const facet of ['easy', 'example', 'why'] as const) {
        const t = f[facet];
        if (!t || typeof t === 'string') continue;
        for (const k of Object.keys(t)) {
          if (k === 'default') continue;
          if (!ROLES.includes(k as Role)) bad.push(`${id}.${facet}: «${k}» no es un rol`);
          else if (!roles.includes(k as Role)) bad.push(`${id}.${facet}: «${k}» no recibe esa entrada`);
        }
        if (!('default' in t) && !roles.every((r) => typeof (t as Record<string, string>)[r] === 'string')) bad.push(`${id}.${facet}: sin «default» para algún rol`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('«Explicado fácil»: lo que dice', () => {
  it('la versión fácil es corta (≤ 220 letras), con una etiqueta a lo sumo, y no repite lo que la guía ya dijo', () => {
    const bad: string[] = [];
    for (const x of ALL.filter((t) => t.facet === 'easy')) {
      if (x.text.length > 220) bad.push(`${x.where}: ${x.text.length} letras`);
      if (quotedLabels(x.text).length > 1) bad.push(`${x.where}: ${quotedLabels(x.text).length} etiquetas`);
    }
    for (const [id, f] of Object.entries(FACETS)) {
      const e = ENTRIES.get(id);
      if (!e || !f.easy) continue;
      for (const [k, easy] of textsOf(f.easy)) {
        const roles = k && k !== 'default' ? [k as Role] : (e.roles ?? EVERYONE);
        if (textFor(e.a, roles).trim() === easy.trim()) bad.push(`${id}.easy: dice lo mismo que la guía`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('cada texto dice a lo sumo dos oraciones (design §4(c)6: dos oraciones y el botón)', () => {
    const bad = ALL.filter((x) => sentencesOf(x.text).length > 2).map((x) => `${x.where}: ${sentencesOf(x.text).length} oraciones`);
    expect(bad).toEqual([]);
  });

  it('el ejemplo es un caso inventado («Por ejemplo: …») y el porqué empieza por su razón', () => {
    const bad = ALL.filter((x) => (x.facet === 'example' && !/^Por ejemplo: /.test(x.text)) || x.text.trim().length < 20).map((x) => x.where);
    expect(bad).toEqual([]);
  });

  it('cada «…» está cerrado y es un texto que existe en una pantalla', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      if (!balancedQuotes(x.text)) bad.push(`${x.where}: «» sin cerrar`);
      for (const l of quotedLabels(x.text)) if (!labelFound(l)) bad.push(`${x.where}: «${l}» no está en ninguna pantalla`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('sin fechas, horas, teléfonos, nombres de la demo, palabras del cliente, códigos, «usted» ni nada interno', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      if (concreteDateTime(x.text)) bad.push(`${x.where}: fecha u hora`);
      if (hasPhone(x.text)) bad.push(`${x.where}: teléfono`);
      for (const w of DEMO_WORDS) if (new RegExp(`\\b${w}\\b`).test(x.text)) bad.push(`${x.where}: «${w}»`);
      if (/freddy|bernal|reporte bernal|semanario/i.test(x.text)) bad.push(`${x.where}: palabra del cliente`);
      if (/\bAC-\d|\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b|\bE-\d{3,}/.test(x.text)) bad.push(`${x.where}: un código`);
      if (/\busted(?:es)?\b/i.test(x.text)) bad.push(`${x.where}: «usted»`);
      if (/—/.test(x.text)) bad.push(`${x.where}: raya`);
      if (/\bbase de datos\b|\bservidor|\bsupabase\b|\bfase\b|npm run|\bD-\d+\b|\.tsx?\b|\bplataforma\b|\bpor ahora\b|\bmila\b/i.test(x.text)) bad.push(`${x.where}: algo interno`);
      // (A day said as 360 would say it, outside the screen's labels and the quoted examples: «Hoy» is a screen.)
      if (/(?<![\p{L}])(?:hoy|mañana|ayer|lunes|martes|miércoles|jueves|viernes|sábado|domingo)(?![\p{L}])/u.test(x.text.replace(/«[^«»]*»|“[^”]*”/g, ' '))) bad.push(`${x.where}: un día`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });
});
