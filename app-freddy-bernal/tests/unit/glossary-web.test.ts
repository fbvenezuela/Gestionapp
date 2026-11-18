// «Palabras de la web» and «Palabras de la atención» (src/lib/guides/web/glossary.ts, WF-C; Juan: «asegúrate que el bot
// sepa todo, TODO lo que está en las guías y cómo poder explicarlo»): the words of «Web» and «Atención», only for the boss
// and Administración. The data keeps the rules of the help content (labels that exist, no date, hour, phone, code, key,
// demo name or client word, «tú», nothing internal); /ayuda/web and /ayuda/atencion list each page's words, closed, at
// #palabras; the docs keep their printed text. In 360: every name asked «¿qué es…?», «¿qué significa…?», «¿qué quiere
// decir…?» is the word, for the boss and Administración, never for a team role; a name the team also uses («borrador»,
// «vencidas») is this word only with the web's or Atención's words or on their screens; a «¿cómo…?» with the word goes
// to how it is done. The demo brain says it with where the words are and the page's button, and explains it («más fácil»,
// «un ejemplo», «¿por qué?», «¿para qué sirve?»).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { TEAM_ROLES, type Role } from '@/lib/roles';
import { GLOSSARY, glossaryLine } from '@/lib/guides';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, hasReceiptCode, quotedLabels } from '@/lib/guides/check';
import { WEB_GLOSSARY, clientWords, webEntry, webGlossaryOf } from '@/lib/guides/web';
import { WEB_WORDS_TITLE, WebGuidePage } from '@/components/guides/web-guide';
import { askedTerm, bestAnswer, entryById, findAnswers, readable } from '@/lib/assistant/answers/engine';
import { canOpen } from '@/lib/assistant/screens';
import { TERM_WHERE_WEB } from '@/lib/assistant/local';
import { handleTurn } from '@/lib/assistant';

const BOSS_ADMIN: Role[] = ['boss', 'admin'];
const ASKS = (x: string) => [`¿qué es ${x}?`, `¿qué significa ${x}?`, `¿qué quiere decir ${x}?`];
// A name the team also uses, said with its domain's words.
const IN_DOMAIN: Record<'web' | 'atencion', string> = { web: 'en la web', atencion: 'en Atención' };
// (As the index has them: lower case, without the term's article: «La franja» is asked «¿qué es la franja?».)
const namesOf = (g: (typeof WEB_GLOSSARY)[number]) => [...new Set([g.term, ...g.aka].map((x) => x.toLowerCase().replace(/^(?:el|la|los|las) /, '')))];
const shared = (g: (typeof WEB_GLOSSARY)[number], n: string) => (g.shared ?? []).some((s) => readable(s) === readable(n));

// The screens' text: src/ outside the help content (as the guides' label checks read it), without comments.
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
const labelFound = (label: string) => SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label);

// Every text of the web's words, with where it is.
const TEXTS = WEB_GLOSSARY.flatMap((g) =>
  (['text', 'easy', 'example', 'why'] as const).flatMap((k) => {
    const t = g[k];
    const list = typeof t === 'string' ? [t] : t ? Object.values(t).filter((x): x is string => typeof x === 'string') : [];
    return list.map((text) => ({ where: `${g.id}.${k}`, text }));
  }),
);

describe('«Palabras de la web» y «Palabras de la atención»: los datos', () => {
  it('unas 35 palabras, ids únicos (también frente a las del equipo), de una de las dos páginas, con su sección de la guía', () => {
    expect(WEB_GLOSSARY.length).toBeGreaterThanOrEqual(35);
    const ids = [...WEB_GLOSSARY, ...GLOSSARY].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of WEB_GLOSSARY) {
      expect(g.id, g.term).toMatch(/^(?:web|atencion)-[a-z0-9-]+$/);
      expect(g.id.startsWith(g.page === 'atencion' ? 'atencion-' : 'web-'), g.id).toBe(true);
      expect(['web', 'atencion'], g.id).toContain(g.page);
      expect(g.section && webEntry(g.section), `${g.id}: sección ${g.section}`).toBeTruthy();
      expect(g.aka.length, g.id).toBeGreaterThan(0);
      for (const w of g.aka) expect(w, g.id).toBe(w.toLowerCase());
      // A shared name is one of its names.
      for (const s of g.shared ?? []) expect(namesOf(g), `${g.id}: ${s}`).toContain(s);
      expect(g.text.length, g.id).toBeGreaterThan(30);
      expect(g.text.length, g.id).toBeLessThanOrEqual(300);
      expect(g.easy && g.example, `${g.id}: fácil y ejemplo`).toBeTruthy();
    }
    expect(webGlossaryOf('web').length + webGlossaryOf('atencion').length).toBe(WEB_GLOSSARY.length);
    // The labels of the lists (4.3), the states of a case (5.6), the figures (5.15) and the words of the design (§4(b)).
    const terms = WEB_GLOSSARY.map((g) => g.term);
    for (const t of ['Borrador', 'Programado', 'Publicado', 'Cambios sin publicar', 'Devuelto con comentario', 'Archivado', 'Recibido', 'Asignado', 'En atención', 'Requiere información', 'Derivado', 'Resuelto', 'Cerrado', 'No procede', 'Vencidas', 'Tiempo a la primera respuesta', 'Tiempo de resolución', 'Mediana y promedio', 'Fecha comprometida', 'Redirección', 'Texto alternativo', 'Punto de interés', 'Bloque', 'Vista previa', 'Comprobante', 'Apoyo', 'Caso unido', 'Casos atendidos', 'Spam', 'Versión de prueba', 'La franja'])
      expect(terms, t).toContain(t);
    expect(terms.filter((t) => t === 'En revisión')).toHaveLength(2);
  });

  it('cada «…» está cerrado y existe en una pantalla', () => {
    const bad: string[] = [];
    for (const x of TEXTS) {
      if (!balancedQuotes(x.text)) bad.push(`${x.where}: «» sin cerrar`);
      for (const l of quotedLabels(x.text)) if (!labelFound(l)) bad.push(`${x.where}: «${l}» no está en ninguna pantalla`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('sin fechas, horas, teléfonos, nombres de la demo, palabras del cliente, códigos ni claves, «usted», raya ni nada interno', () => {
    const bad: string[] = [];
    for (const x of TEXTS) {
      if (concreteDateTime(x.text)) bad.push(`${x.where}: fecha u hora`);
      if (hasPhone(x.text)) bad.push(`${x.where}: teléfono`);
      if (hasReceiptCode(x.text) || /\bAC-\d/.test(x.text)) bad.push(`${x.where}: un código o una clave`);
      for (const w of DEMO_WORDS) if (new RegExp(`\\b${w}\\b`).test(x.text)) bad.push(`${x.where}: «${w}»`);
      if (/freddy|bernal|freddybernaloficial|semanario|\[[A-Z_]+\]/i.test(x.text)) bad.push(`${x.where}: palabra del cliente o un hueco`);
      if (/\busted(?:es)?\b/i.test(x.text)) bad.push(`${x.where}: «usted»`);
      if (/—/.test(x.text)) bad.push(`${x.where}: raya`);
      if (/\bbase de datos\b|\bservidor|\bsupabase\b|\bfase\b|npm run|\bD-\d+\b|\.tsx?\b|\bplataforma\b|\bpor ahora\b/i.test(x.text)) bad.push(`${x.where}: algo interno`);
      if (/(?<![\p{L}])(?:hoy|mañana|ayer|lunes|martes|miércoles|jueves|viernes|sábado|domingo)(?![\p{L}])/iu.test(x.text.replace(/«[^«»]*»|“[^”]*”/g, ' '))) bad.push(`${x.where}: un día`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
    // None of the client's own names (config/clients), whatever they are.
    const w = clientWords();
    for (const name of [w.program, w.weekly, w.officialSite, w.organization].filter((x) => x && x.length > 3))
      for (const x of TEXTS) expect(x.text.includes(name), `${x.where}: «${name}»`).toBe(false);
  });
});

describe('«Ayuda y guías»: cada página con sus palabras', () => {
  const words = clientWords();
  const html = (page: 'web' | 'atencion', q: { parte?: string } = {}) => renderToStaticMarkup(createElement(WebGuidePage, { page, words, ...q }));

  it('el índice de «La web» trae «Palabras de la web», cerradas, con cada palabra de la web y ninguna de la atención', () => {
    const out = html('web');
    expect(out).toContain('id="palabras"');
    expect(out).toContain(`>${WEB_WORDS_TITLE.web}<`);
    expect(out).toMatch(/<details[^>]*>(?![^]*<details)/);
    const dl = out.slice(out.indexOf('id="palabras"'));
    expect(dl.match(/<dt /g)?.length).toBe(webGlossaryOf('web').length);
    for (const g of webGlossaryOf('web')) expect(dl).toContain(`>${g.term}</dt>`);
    // (Atención's own words; «En revisión» is a word of both pages, with its meaning on each.)
    const webTerms = new Set(webGlossaryOf('web').map((g) => g.term));
    for (const g of webGlossaryOf('atencion').filter((x) => !webTerms.has(x.term))) expect(dl).not.toContain(`>${g.term}</dt>`);
    for (const g of webGlossaryOf('atencion')) expect(dl).not.toContain(g.text);
  });

  it('el de «Atención ciudadana», «Palabras de la atención», con las suyas', () => {
    const out = html('atencion');
    expect(out).toContain(`>${WEB_WORDS_TITLE.atencion}<`);
    const dl = out.slice(out.indexOf('id="palabras"'));
    expect(dl.match(/<dt /g)?.length).toBe(webGlossaryOf('atencion').length);
    for (const g of webGlossaryOf('atencion')) expect(dl).toContain(`>${g.term}</dt>`);
  });

  it('una parte no las repite; las palabras del equipo siguen solo en «Para todos»', () => {
    expect(html('web', { parte: '4' })).not.toContain(WEB_WORDS_TITLE.web);
    expect(html('atencion', { parte: '5' })).not.toContain(WEB_WORDS_TITLE.atencion);
    expect(html('web')).not.toContain(`>${GLOSSARY[0].term}</dt>`);
  });

  it('las guías de la web en docs/ no cambian por las palabras (no tienen dónde ir)', () => {
    for (const f of ['docs/GUIA-WEB.md', 'docs/MANUAL-ADMIN-WEB.md', 'docs/MANUAL-ATENCION.md', 'docs/FLUJOS-WEB.md']) {
      const doc = fs.readFileSync(f, 'utf8');
      expect(doc, f).not.toContain(WEB_WORDS_TITLE.web);
      expect(doc, f).not.toContain(WEB_WORDS_TITLE.atencion);
    }
  });

  it('360 dice dónde están con los mismos títulos', () => {
    expect(TERM_WHERE_WEB.web).toContain(`«${WEB_WORDS_TITLE.web}»`);
    expect(TERM_WHERE_WEB.atencion).toContain(`«${WEB_WORDS_TITLE.atencion}»`);
  });
});

describe('360: las palabras de la web y de la atención en el índice', () => {
  it('cada palabra es una entrada del jefe y de administración, de su dominio, con el botón a sus palabras', () => {
    for (const g of WEB_GLOSSARY) {
      const e = entryById(`palabra:${g.id}`)!;
      expect(e, g.id).toBeTruthy();
      expect(e.kind).toBe('term');
      expect(e.roles).toEqual(BOSS_ADMIN);
      expect(e.domain).toBe(g.page);
      expect(e.source.startsWith('web:')).toBe(true);
      expect(e.a).toBe(glossaryLine(g));
      expect(e.go).toBe(`/ayuda/${g.page}#palabras`);
      for (const r of BOSS_ADMIN) expect(canOpen(e.go!, [r]), `${g.id} · ${r}`).toBe(true);
      for (const r of TEAM_ROLES.filter((x) => x !== 'boss')) expect(canOpen(e.go!, [r]), `${g.id} · ${r}`).toBe(false);
    }
  });

  it('«¿qué es…?», «¿qué significa…?» y «¿qué quiere decir…?» de cada nombre son la palabra, para el jefe y administración', () => {
    const bad: string[] = [];
    let n = 0;
    for (const g of WEB_GLOSSARY)
      for (const name of namesOf(g))
        for (const q0 of ASKS(name)) {
          // (A name the team also uses is asked with its domain's words.)
          const q = shared(g, name) ? q0.replace(/\?$/, ` ${IN_DOMAIN[g.page as 'web' | 'atencion']}?`) : q0;
          for (const r of BOSS_ADMIN) {
            n++;
            const t = askedTerm(q, [r]);
            const m = bestAnswer(q, { roles: [r] });
            if (t?.id !== `palabra:${g.id}`) bad.push(`${r} · ${q} → askedTerm ${t?.id ?? 'nada'}`);
            else if (m?.entry.id !== `palabra:${g.id}` || m.confidence !== 'strong') bad.push(`${r} · ${q} → ${m?.entry.id} ${m?.confidence}`);
          }
        }
    expect(n).toBeGreaterThan(500);
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('a un rol del equipo nunca le llega una palabra de la web ni de la atención', () => {
    const bad: string[] = [];
    for (const g of WEB_GLOSSARY)
      for (const name of namesOf(g).slice(0, 3))
        for (const q of ASKS(`${name} ${IN_DOMAIN[g.page as 'web' | 'atencion']}`))
          for (const r of TEAM_ROLES.filter((x) => x !== 'boss')) {
            if (askedTerm(q, [r])?.id.startsWith('palabra:web-') || askedTerm(q, [r])?.id.startsWith('palabra:atencion-')) bad.push(`${r} · ${q}: askedTerm`);
            if (findAnswers(q, { roles: [r], limit: 8 }).some((m) => m.entry.id === `palabra:${g.id}`)) bad.push(`${r} · ${q}: en las respuestas`);
          }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('un nombre que el equipo también usa, sin palabras de la web ni de la atención, no es la palabra de la web', () => {
    for (const [r, q, not] of [
      ['boss', '¿qué son las vencidas?', 'palabra:atencion-vencidas'],
      ['boss', '¿qué significa vencidas?', 'palabra:atencion-vencidas'],
      ['boss', '¿qué significa borrador?', 'palabra:web-borrador'],
      ['admin', '¿qué es programado?', 'palabra:web-programado'],
      ['boss', '¿qué significa publicado?', 'palabra:web-publicado'],
      ['boss', '¿qué es en revisión?', 'palabra:web-en-revision'],
      ['boss', '¿qué es en revisión?', 'palabra:atencion-en-revision'],
      ['boss', '¿qué es un bloque?', 'palabra:web-bloque'],
      ['admin', '¿qué significa archivada?', 'palabra:web-archivado'],
    ] as [Role, string, string][]) {
      expect(askedTerm(q, [r])?.id, `${r}: ${q}`).not.toBe(not);
      expect(findAnswers(q, { roles: [r], limit: 8 }).find((m) => m.entry.id === not)?.confidence ?? 'none', `${r}: ${q}`).not.toBe('strong');
    }
    // With the web's or Atención's words, or on their screens, it is.
    expect(askedTerm('¿qué son las vencidas en atención?', ['boss'])?.id).toBe('palabra:atencion-vencidas');
    expect(askedTerm('¿qué son las vencidas?', ['boss'], '/admin/atencion/estadisticas')?.id).toBe('palabra:atencion-vencidas');
    expect(askedTerm('¿qué significa borrador en la lista de noticias de la web?', ['boss'])?.id).toBe('palabra:web-borrador');
    expect(askedTerm('en un caso, ¿qué significa en revisión?', ['boss'])?.id).toBe('palabra:atencion-en-revision');
    expect(askedTerm('¿qué significa en revisión en una noticia?', ['admin'])?.id).toBe('palabra:web-en-revision');
  });

  it('un «¿cómo…?» o un «¿puedo…?» con la palabra va a cómo se hace, no a lo que significa', () => {
    for (const [r, q] of [
      ['boss', '¿cómo archivo una noticia?'],
      ['boss', '¿cómo hago una redirección?'],
      ['admin', '¿cómo agrego una redirección?'],
      ['boss', '¿cómo pongo el texto alternativo de una foto?'],
      ['boss', '¿cómo marco el punto de interés?'],
      ['boss', '¿cómo veo la vista previa de una noticia?'],
      ['boss', '¿cómo se marca un caso como spam?'],
      ['admin', '¿cómo cambio la fecha comprometida?'],
      ['boss', '¿puedo reabrir un caso?'],
      ['boss', '¿puedo exportar los casos atendidos?'],
    ] as [Role, string][]) {
      const m = bestAnswer(q, { roles: [r] });
      expect(m?.entry.kind, `${r}: ${q} → ${m?.text}`).not.toBe('term');
      expect(askedTerm(q, [r]), `${r}: ${q}`).toBeNull();
      expect(findAnswers(q, { roles: [r], limit: 8 }).find((x) => x.entry.kind === 'term')?.confidence ?? 'none', `${r}: ${q}`).not.toBe('strong');
    }
  });

  it('una palabra del equipo preguntada con palabras de la web o en su pantalla no es la del equipo («las etiquetas de esta lista»)', () => {
    expect(askedTerm('¿qué significan las etiquetas?', ['boss'], '/admin/web')).toBeNull();
    expect(askedTerm('¿qué significan las etiquetas de esta lista?', ['boss'])).toBeNull();
    expect(askedTerm('¿qué significan las etiquetas?', ['boss'])?.id).toBe('palabra:etiquetas');
  });
});

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const ask = async (key: DemoUserKey, questions: string[]) => {
  let conversationId: string | null = null;
  const out = [];
  for (const question of questions) {
    const r = await handleTurn(sessionOf(key), { question, conversationId }, { chain: [] });
    conversationId = r.conversationId ?? null;
    out.push(r);
  }
  return out;
};

describe('360 dice y explica las palabras de la web y de la atención (el cerebro de la demo)', () => {
  it('lo que significa, dónde están y el botón a la guía de su página', async () => {
    const [web] = await ask('boss', ['¿qué es una redirección?']);
    expect(web.model).toBe('local');
    expect(web.answer).toContain(glossaryLine(WEB_GLOSSARY.find((g) => g.id === 'web-redireccion')!));
    expect(web.answer).toContain(TERM_WHERE_WEB.web);
    expect(web.goTo?.href).toBe('/ayuda/web#palabras');
    const [att] = await ask('admin', ['¿qué quiere decir fecha comprometida?']);
    expect(att.answer).toMatch(/^Fecha comprometida: La fecha interna/);
    expect(att.answer).toContain(TERM_WHERE_WEB.atencion);
    expect(att.goTo?.href).toBe('/ayuda/atencion#palabras');
    expect(att.answer).not.toMatch(/no lo manejo|no la tengo/);
  });

  it('«más fácil», «un ejemplo», «¿por qué?» y «¿para qué sirve?» después: lo de la palabra, sin repetir', async () => {
    const g = (id: string) => WEB_GLOSSARY.find((x) => x.id === id)!;
    const [, easy] = await ask('boss', ['¿qué significa cambios sin publicar?', 'explícamelo más fácil']);
    expect(easy.answer).toContain(g('web-cambios-sin-publicar').easy as string);
    const [, example] = await ask('boss', ['¿qué es el tiempo a la primera respuesta?', 'dame un ejemplo']);
    expect(example.answer).toContain(g('atencion-tiempo-primera-respuesta').example as string);
    const [, why] = await ask('boss', ['¿qué es el texto alternativo?', '¿y por qué?']);
    expect(why.answer).toContain(g('web-texto-alternativo').why as string);
    const [first, purpose] = await ask('boss', ['¿qué es la versión de prueba de la web?', '¿y pa qué sirve?']);
    expect(purpose.answer).toMatch(/^Es para conocer la app y practicar cada rol antes de abrir la web al público/);
    expect(purpose.answer).not.toBe(first.answer);
  });

  it('a un rol del equipo, nunca la palabra de la web: lo de siempre, que no está en su menú', async () => {
    for (const key of ['social', 'camera', 'dispatch'] as DemoUserKey[]) {
      const [r] = await ask(key, ['¿qué es la fecha comprometida en atención?']);
      expect(r.answer, key).not.toMatch(/La fecha interna en que el caso/);
      expect(r.goTo?.href ?? '', key).not.toMatch(/\/ayuda\/(?:web|atencion)/);
    }
  });
});
