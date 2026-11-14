// 360 explains (src/lib/assistant/explain.ts, design §4(c)): which asks are explain asks (dictated and short forms,
// courtesy words, «lo de X» as a topic and never as an event), what each facet says of a topic (the easy text, the steps
// three at a time with «¿Sigo?», the example, what comes next in the task and in its flow, what it is for, the reason only
// where the guide gives it, what a word means, the rest), never the same text twice in a thread, never after a thread
// about an event, nothing for the web's roles, and the content rules of the help content on every text it says.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TEAM_ROLES, type Role } from '@/lib/roles';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, quotedLabels } from '@/lib/guides/check';
import { canOpen } from '@/lib/assistant/screens';
import { allEntries, entryById } from '@/lib/assistant/answers/engine';
import { explainAnswer, explainAsk, explainUnitId, type ExplainContext, type Facet } from '@/lib/assistant/explain';
import { facetsOf } from '@/lib/guides/explain';
import { toursForRoles } from '@/lib/guides';

const FACETS: Facet[] = ['simpler', 'steps', 'example', 'next', 'purpose', 'why', 'meaning', 'more'];
const ask = (q: string, last?: string) => explainAsk(q, last ? { last } : {});
const ctx = (roles: Role[], more: Partial<ExplainContext> = {}): ExplainContext => ({ roles, said: [], earlier: [], ...more });

// ── What is an explain ask ─────────────────────────────────────────────────────────────────────────────────────────

describe('explainAsk: lo que se pide', () => {
  const cases: [string, Facet, string?][] = [
    // simpler
    ['no entendí', 'simpler'],
    ['No te entendí', 'simpler'],
    ['no capté', 'simpler'],
    ['¿cómo así?', 'simpler'],
    ['no te entendí, ¿cómo así?', 'simpler'],
    ['explícamelo más fácil', 'simpler'],
    ['explicame mas facil porfa', 'simpler'],
    ['dímelo más sencillo', 'simpler'],
    ['más fácil porfa', 'simpler'],
    ['en palabras sencillas', 'simpler'],
    ['como a un niño', 'simpler'],
    ['no me quedó claro', 'simpler'],
    ['no entendí nada', 'simpler'],
    ['ok chamo explícame mejor', 'simpler'],
    // steps
    ['paso a paso', 'steps'],
    ['paso a paso porfa', 'steps'],
    ['paso a paso xfa', 'steps'],
    ['dímelo paso a paso', 'steps'],
    ['por pasos', 'steps'],
    ['¿qué hago primero?', 'steps'],
    ['¿y cómo lo hago?', 'steps'],
    ['¿cuáles son los pasos?', 'steps'],
    ['paso a paso como lo activo', 'steps'],
    // example
    ['dame un ejemplo', 'example'],
    ['¿por ejemplo?', 'example'],
    ['¿cómo sería?', 'example'],
    ['me das un ejemplo porfa', 'example'],
    ['un ejemplito', 'example'],
    ['dame un ejemplo de nota', 'example', 'nota'],
    // next
    ['¿y después?', 'next'],
    ['y luego?', 'next'],
    ['¿qué sigue?', 'next'],
    ['¿y entonces?', 'next'],
    ['y después de eso?', 'next'],
    ['y dps?', 'next'],
    ['y despues de avisar al jefe?', 'next', 'avisar al jefe'],
    ['y después qué hace Grabación', 'next', 'grabacion'],
    ['y despues de aprobarla q pasa', 'next', 'aprobarla'],
    // purpose
    ['¿para qué sirve?', 'purpose'],
    ['¿y eso pa qué sirve?', 'purpose'],
    ["¿pa' qué?", 'purpose'],
    ['pa que sirve guardar borrador', 'purpose', 'guardar borrador'],
    ['y eso de la cajita pa que es', 'purpose', 'la cajita'],
    // why
    ['¿por qué?', 'why'],
    ['¿y eso por qué?', 'why'],
    ['¿por qué es así?', 'why'],
    ['y xq?', 'why'],
    ['¿y por qué no?', 'why'],
    ['¿cuál es la razón?', 'why'],
    // meaning
    ['¿qué significa eso?', 'meaning'],
    ['¿y eso qué significa?', 'meaning'],
    ['¿qué quiere decir eso?', 'meaning'],
    ['que significa limpio?', 'meaning', 'limpio'],
    ['q significa la tanda', 'meaning', 'tanda'],
    ['y lo de la importancia del uno al diez que es', 'meaning', 'la importancia de 1 a 10'],
    // more
    ['dime más', 'more'],
    ['sigue', 'more'],
    ['¿algo más?', 'more'],
    ['continúa por favor', 'more'],
    ['¿y qué más?', 'more'],
    // «lo de X» is a topic
    ['no entendí lo de limpio', 'simpler', 'limpio'],
    ['no entendi lo de la cajita del nivel', 'simpler', 'la cajita del nivel'],
    ['no entendí lo de antes de aprobar', 'simpler', 'antes de aprobar'],
    ['no entendí lo de por confirmar', 'simpler', 'por confirmar'],
    ['no entiendo lo del #1 abajo a la derecha', 'simpler', '1 abajo a la derecha'],
    ['no entendi lo de quien graba', 'simpler', 'quien graba'],
    ['no entendí la diferencia entre mover y cambiar todo junto', 'simpler', 'mover y cambiar todo junto'],
  ];
  for (const [q, facet, about] of cases) {
    it(`«${q}» → ${facet}${about ? ` (${about})` : ''}`, () => {
      const a = ask(q);
      expect(a?.facet, q).toBe(facet);
      if (about) expect(a?.about, q).toBe(about);
      else expect(a?.about, q).toBeUndefined();
    });
  }

  it('«sí», «dale» y «ok» siguen con los pasos solo después de «¿Sigo?»', () => {
    const page = 'Armar un canal, paso a paso: 1) … 2) … 3) … ¿Sigo?';
    for (const q of ['sí', 'Sí', 'dale', 'ok', 'si porfa', 'sí, sigue']) expect(ask(q, page)?.facet, q).toBe('more');
    for (const q of ['sí', 'dale', 'ok']) expect(ask(q), q).toBeNull();
    expect(ask('sí', 'Es el texto que va con la publicación.')).toBeNull();
  });

  it('una pregunta nueva no es pedir que explique (la contestan los pasos de hoy)', () => {
    for (const q of [
      '¿cómo apruebo una pieza?',
      '¿qué es el feed?',
      '¿qué es esto?',
      '¿qué más?',
      'hola',
      'gracias',
      '¿y si lo rechazo qué pasa?',
      '¿qué tengo pendiente?',
      'no entiendo la app',
      'no entiendo esta pantalla',
      '¿qué hago?',
      'muéstrame el tutorial',
      '¿quién aprueba los tweets?',
      'paso a paso de la feria del sábado y la hora',
    ])
      expect(ask(q), q).toBeNull();
  });

  it('«lo de X» con un evento, un lugar, un día o una hora no es un tema: va a los pasos de la agenda', () => {
    for (const q of [
      'no entendí lo de la feria',
      '¿y después de la feria?',
      'dame un ejemplo de la feria',
      'no entendí lo de mañana',
      'explícame lo de la hora',
      'no entendí lo de la dirección',
      '¿y después qué hace el jefe en la feria?',
      'no entendi lo del acto del sábado',
      '¿por qué lo de la visita?',
      'no entendí lo de cómo se llega',
      'y después de eso, ¿a qué hora es?',
    ])
      expect(ask(q), q).toBeNull();
    // A title this person can see, by its words.
    const titles = { events: ['Techado de la cancha'], pieces: [], places: ['Sector Alto'] };
    expect(explainAsk('no entendí lo de la cancha', { titles }), 'título').toBeNull();
    expect(explainAsk('explícame lo de Sector Alto', { titles }), 'lugar').toBeNull();
    // Without those titles, «la cajita» stays a topic.
    expect(explainAsk('no entendí lo de la cajita', { titles })?.facet).toBe('simpler');
  });
});

// ── What it says ───────────────────────────────────────────────────────────────────────────────────────────────────

const BOSS: Role[] = ['boss'];
const SOCIAL: Role[] = ['social'];

describe('explainAnswer: cada faceta', () => {
  it('más fácil: la versión fácil de «Explicado fácil»; y no repite', () => {
    const r = explainAnswer('simpler', 'jefe:paso-a-paso:aprobar-verdes', ctx(BOSS));
    expect(r?.text).toBe(facetsOf('jefe:paso-a-paso:aprobar-verdes')!.easy);
    expect(r?.entryId).toBe('jefe:paso-a-paso:aprobar-verdes');
    const again = explainAnswer('simpler', 'jefe:paso-a-paso:aprobar-verdes', ctx(BOSS, { said: [r!.text] }));
    expect(again?.text).not.toBe(r!.text);
  });

  it('paso a paso: tres pasos por respuesta con «¿Sigo?», el tutorial, y «sigue» continúa hasta el final', () => {
    const id = 'jefe:paso-a-paso:aprobar-pieza';
    const p1 = explainAnswer('steps', id, ctx(BOSS))!;
    expect(p1.text).toMatch(/^Aprobar una amarilla o una roja, paso a paso: 1\) /);
    expect(p1.text).toMatch(/ 3\) .*¿Sigo\?$/);
    expect(p1.text).not.toMatch(/ 4\) /);
    expect(p1.cursor).toBe(3);
    expect(p1.tutorial).toBe('aprobar-pieza');
    const p2 = explainAnswer('more', id, ctx(BOSS, { said: [p1.text], cursor: p1.cursor }))!;
    expect(p2.text).toMatch(/^4\) .* 6\) .*¿Sigo\?$/);
    expect(p2.cursor).toBe(6);
    const p3 = explainAnswer('more', id, ctx(BOSS, { said: [p1.text, p2.text], cursor: p2.cursor }))!;
    expect(p3.text).toMatch(/^7\) .* 8\) /);
    expect(p3.text).not.toMatch(/¿Sigo\?/);
    expect(p3.cursor).toBeUndefined();
  });

  it('paso a paso después de una respuesta que ya dio los primeros pasos sigue desde ahí', () => {
    const e = entryById('redes:paso-a-paso:pieza')!;
    const said = typeof e.a === 'string' ? e.a : '';
    expect(said).toMatch(/1\) /);
    const r = explainAnswer('steps', e, ctx(SOCIAL, { said: [said] }));
    // The guide's «paso a paso» said its first steps: the explain answer starts after the last one it said.
    expect(r?.text).toMatch(/^\d\) /);
    expect(r?.text).not.toMatch(/^1\) /);
  });

  it('paso a paso de una pantalla: su tutorial', () => {
    const r = explainAnswer('steps', 'jefe:pantalla:12', ctx(BOSS));
    expect(r?.tutorial).toBe('feed');
  });

  it('un ejemplo: el de «Explicado fácil», con las etiquetas de la guía', () => {
    const r = explainAnswer('example', 'redes:paso-a-paso:feed', ctx(SOCIAL))!;
    expect(r.text).toMatch(/^Por ejemplo: /);
    expect(r.text).toContain('«Elegir publicación»');
    const w = explainAnswer('example', 'palabra:tanda', ctx(SOCIAL))!;
    expect(w.text).toBe(facetsOf('palabra:tanda')!.example);
  });

  it('¿y después?: el paso siguiente; al final de la tarea, el paso de su flujo que hace otro rol', () => {
    const step = explainAnswer('next', 'jefe:paso-a-paso:aprobar-pieza:6', ctx(BOSS))!;
    expect(step.text).toMatch(/^Después: toca «Aprobar»/);
    // The task said whole: what comes after it in «El semáforo» is Redes'.
    const flow = explainAnswer('next', 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS))!;
    expect(flow.text).toMatch(/^Después le toca a Redes: le llega «Aprobada: lista para publicar»/);
    expect(flow.entryId).toBe('flujo:aprobacion:aprobada');
    // And from there the flow goes on, or ends.
    const end = explainAnswer('next', flow.entryId, ctx(BOSS, { said: [flow.text] }))!;
    expect(end.text).toMatch(/^Ahí termina el camino/);
    // The despacho's date goes to the IVT's visits.
    const desp = explainAnswer('next', 'despacho:paso-a-paso:poner-fecha', ctx(['dispatch']))!;
    expect(desp.text).toMatch(/^Después le toca al IVT: ve la fecha en «Mis visitas de obra»/);
    // Política's report goes to the boss or the despacho.
    const pol = explainAnswer('next', 'politica:paso-a-paso:nueva-ficha', ctx(['politics']))!;
    expect(pol.text).toMatch(/^Después le toca al jefe o al despacho: «Por ponerle fecha»/);
    // «¿Y después qué hace Grabación?»: the next step of the flow that Grabación does.
    const who = explainAnswer('next', 'despacho:paso-a-paso:quien-graba', ctx(['dispatch'], { about: 'grabacion' }))!;
    expect(who.text).toMatch(/^Después le toca a Grabación: graba, sube cada parte/);
  });

  it('¿y después? de la tarea propia sigue con lo tuyo y dice quién viene después', () => {
    const r = explainAnswer('next', 'ivt:paso-a-paso:nueva-obra', ctx(['ivt'], { about: 'avisar al jefe' }))!;
    expect(r.text).toMatch(/^Después te toca a ti: .*Luego le toca al jefe o al despacho: «Por ponerle fecha»/);
  });

  it('¿para qué sirve?: lo que la pantalla es; la palabra, lo que significa; «X», lo que la guía dice de X', () => {
    const s = explainAnswer('purpose', 'jefe:pantalla:7', ctx(BOSS))!;
    expect(s.text).toMatch(/^Por aprobar: todo lo que espera tu aprobación/);
    const t = explainAnswer('purpose', 'palabra:trancado', ctx(SOCIAL))!;
    expect(t.text).toMatch(/^Trancado: /);
    const x = explainAnswer('purpose', 'ivt:paso-a-paso:nueva-obra', ctx(['ivt'], { about: 'guardar borrador' }))!;
    expect(x.text).toContain('todavía no le llega al jefe');
  });

  it('¿por qué?: solo la razón que da la guía; si no la da, lo dice y ofrece la guía', () => {
    const w = explainAnswer('why', 'todos:fecha', ctx(SOCIAL))!;
    expect(w.text).toContain('información de seguridad');
    const none = explainAnswer('why', 'jefe:paso-a-paso:leer', ctx(BOSS))!;
    expect(none.text).toMatch(/^La guía no da el porqué de eso\./);
    expect(none.goTo).toBe('/ayuda/jefe');
  });

  it('¿qué significa eso?: la palabra de la respuesta de antes; ¿qué significa X?: la palabra X', () => {
    const r = explainAnswer('meaning', null, ctx(SOCIAL, { said: ['Sube la tanda de la semana en «Tweets de la semana».'] }))!;
    expect(r.text).toMatch(/^Tanda: /);
    const x = explainAnswer('meaning', 'redes:paso-a-paso:tweets', ctx(SOCIAL, { about: 'la tanda' }))!;
    expect(x.text).toMatch(/^Tanda: /);
    // A colour of the semáforo, said alone.
    const c = explainAnswer('meaning', 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS, { about: 'roja' }))!;
    expect(c.text).toMatch(/^El semáforo: .*sensible/);
  });

  it('«no entendí lo de X»: lo que la tarea dice de X, con su paso', () => {
    const a = explainAnswer('simpler', 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS, { about: 'antes de aprobar' }))!;
    expect(a.text).toMatch(/^Es el paso 6: marca la lista «Antes de aprobar»: «Cada cifra tiene su fuente»/);
    const b = explainAnswer('simpler', 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS, { about: 'la cajita del nivel' }))!;
    expect(b.text).toMatch(/^Es el paso 8: .*cajita del nivel/);
    const c = explainAnswer('meaning', 'grabacion:paso-a-paso:subir', ctx(['camera'], { about: 'limpio' }))!;
    expect(c.text).toContain('sin esperas ni tomas que no sirven');
    const d = explainAnswer('simpler', 'ivt:paso-a-paso:nueva-obra', ctx(['ivt'], { about: 'los telefonos' }))!;
    expect(d.text).toContain('doble factor');
    const e = explainAnswer('simpler', 'redes:paso-a-paso:feed', ctx(SOCIAL, { about: 'publicar antes y despues' }))!;
    expect(e.text).toContain('«Publicar antes (#20)»');
  });

  it('dime más: lo que la pantalla tiene que no se dijo', () => {
    const screen = entryById('jefe:pantalla:10')!;
    const said = typeof screen.a === 'string' ? screen.a : '';
    const r = explainAnswer('more', screen, ctx(BOSS, { said: [said] }))!;
    expect(r.text.length).toBeGreaterThan(40);
    expect(said).not.toContain(r.text.replace(/^En [^:]+, además: /, '').slice(0, 40));
  });

  it('una respuesta curada se explica desde su tarea de la guía (su tutorial y sus formas de preguntar)', () => {
    expect(explainUnitId('curado:jefe-aprobar-pieza', BOSS)).toBe('jefe:paso-a-paso:aprobar-pieza');
    const r = explainAnswer('steps', 'curado:jefe-aprobar-pieza', ctx(BOSS))!;
    expect(r.text).toMatch(/^Aprobar una amarilla o una roja, paso a paso: 1\) /);
    expect(r.entryId).toBe('jefe:paso-a-paso:aprobar-pieza');
  });

  it('un flujo entero guardado como «flujo:<id>»: sus pasos, de quién es cada uno', () => {
    const r = explainAnswer('steps', 'flujo:entrega', ctx(['camera']))!;
    expect(r.text).toMatch(/^La entrega de Grabación, paso a paso: 1\) Tú: lee la ficha/);
    expect(r.entryId).toBe('flujo:entrega');
  });
});

describe('explainAnswer: lo que nunca hace', () => {
  it('nunca dice dos veces lo mismo en la conversación', () => {
    for (const [topic, roles] of [
      ['jefe:paso-a-paso:aprobar-pieza', BOSS],
      ['redes:pantalla:7', SOCIAL],
      ['palabra:feed', SOCIAL],
      ['todos:sin-senal', ['ivt']],
      ['flujo:evento', ['dispatch']],
    ] as [string, Role[]][]) {
      for (const facet of FACETS) {
        const said: string[] = [];
        for (let k = 0; k < 4; k++) {
          const r = explainAnswer(facet, topic, ctx(roles, { said: [...said] }));
          if (!r) break;
          expect(said, `${topic} ${facet}`).not.toContain(r.text);
          said.push(r.text);
        }
      }
    }
  });

  it('nunca después de una conversación sobre un evento', () => {
    for (const earlier of [['¿cuándo es la feria?'], ['¿dónde queda el acto?', 'y eso'], ['¿a qué hora llega el jefe a la visita?']])
      for (const facet of FACETS) expect(explainAnswer(facet, 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS, { earlier })), `${earlier.join(' / ')} ${facet}`).toBeNull();
    // A thread about the app is fine.
    expect(explainAnswer('simpler', 'jefe:paso-a-paso:aprobar-pieza', ctx(BOSS, { earlier: ['¿cómo apruebo una amarilla?'] }))).not.toBeNull();
  });

  it('nada para los roles de la web y de la atención, y nada de la guía de otro rol', () => {
    for (const r of ['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'] as Role[])
      for (const facet of FACETS) expect(explainAnswer(facet, 'palabra:feed', ctx([r])), `${r} ${facet}`).toBeNull();
    expect(explainAnswer('steps', 'jefe:paso-a-paso:aprobar-pieza', ctx(SOCIAL))).toBeNull();
    expect(explainAnswer('simpler', 'admin:pantalla:0', ctx(BOSS))).toBeNull();
    // Administración is out of Mensajes.
    expect(explainAnswer('simpler', 'todos:mensajes', ctx(['admin']))).toBeNull();
    expect(explainAnswer('simpler', 'todos:mensajes', ctx(['admin', 'social']))).toBeNull();
  });

  it('sin tema no explica (salvo «¿qué significa eso?» con una palabra en la respuesta de antes)', () => {
    for (const facet of FACETS) expect(explainAnswer(facet, null, ctx(SOCIAL)), facet).toBeNull();
    expect(explainAnswer('simpler', 'no-es-una-entrada', ctx(SOCIAL))).toBeNull();
  });
});

// ── The content rules, on everything it says ───────────────────────────────────────────────────────────────────────

// The screens' text: src/ outside the help content and 360's own lines, without comments.
const HELP = [path.join('src', 'lib', 'guides'), path.join('src', 'lib', 'assistant', 'answers'), path.join('src', 'lib', 'assistant', 'explain.ts')];
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (HELP.some((h) => p.startsWith(h))) return [];
    if (d.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
const SOURCE = sourceFiles('src')
  .map((f) =>
    fs
      .readFileSync(f, 'utf8')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
      .replace(/\s\/\/\s.*$/gm, ' '),
  )
  .join('\n')
  .replace(/\s+/g, ' ');
const labelFound = (label: string) => SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label);

describe('explainAnswer: las reglas del contenido en todo lo que dice', () => {
  // Every task, screen, flow step, topic and word of the index, as each of its roles, with each facet; and a sample of
  // curated answers (their unit is found by matching: slower).
  const EVERYONE: Role[] = [...TEAM_ROLES, 'admin'];
  const entries = allEntries().filter((e) => ['task', 'step', 'screen', 'item', 'flow', 'topic', 'line', 'term', 'job'].includes(e.kind));
  const curated = allEntries().filter((e) => e.kind === 'curated').filter((_, k) => k % 60 === 0);
  const said: { where: string; text: string; goTo?: string; tutorial?: string; roles: Role[]; cursor?: number }[] = [];
  for (const e of [...entries, ...curated]) {
    for (const role of e.roles ?? EVERYONE) {
      for (const facet of FACETS) {
        const r = explainAnswer(facet, e, ctx([role]));
        if (r) said.push({ where: `${e.id} ${role} ${facet}`, text: r.text, goTo: r.goTo, tutorial: r.tutorial, roles: [role], cursor: r.cursor });
      }
    }
  }

  it('dice algo de casi todo', () => {
    expect(said.length).toBeGreaterThan(3000);
  });

  it('sin fechas, horas, teléfonos, nombres de la demo, «usted», rayas ni nada interno; corto', () => {
    const bad: string[] = [];
    for (const x of said) {
      if (concreteDateTime(x.text)) bad.push(`${x.where}: fecha u hora :: ${x.text}`);
      if (hasPhone(x.text)) bad.push(`${x.where}: teléfono`);
      for (const w of DEMO_WORDS) if (new RegExp(`\\b${w}\\b`).test(x.text)) bad.push(`${x.where}: «${w}»`);
      if (/\busted(?:es)?\b/i.test(x.text)) bad.push(`${x.where}: «usted»`);
      if (/—/.test(x.text)) bad.push(`${x.where}: raya`);
      if (/freddy|bernal/i.test(x.text)) bad.push(`${x.where}: palabra del cliente`);
      if (/\bbase de datos\b|\bservidor|\bsupabase\b|\bfase\b|npm run|\bD-\d+\b|\.tsx?\b|\bplataforma\b/i.test(x.text)) bad.push(`${x.where}: algo interno`);
      if (x.text.length > 480) bad.push(`${x.where}: ${x.text.length} letras`);
      if (/\[[A-Z]+\]|\[\[/.test(x.text)) bad.push(`${x.where}: hueco o marca`);
    }
    expect(bad.slice(0, 30), `\n${bad.slice(0, 30).join('\n')}`).toEqual([]);
  });

  it('cada «…» está cerrado y existe en una pantalla', () => {
    const bad = new Set<string>();
    for (const x of said) {
      if (!balancedQuotes(x.text)) bad.add(`${x.where}: «» sin cerrar`);
      for (const l of quotedLabels(x.text)) if (!labelFound(l)) bad.add(`«${l}» (${x.where})`);
    }
    expect([...bad].slice(0, 30)).toEqual([]);
  });

  it('el botón abre para esa persona, el tutorial es suyo y «¿Sigo?» va con su cursor', () => {
    const bad: string[] = [];
    for (const x of said) {
      if (x.goTo && !canOpen(x.goTo, x.roles)) bad.push(`${x.where}: botón a ${x.goTo}`);
      if (x.tutorial && !toursForRoles(x.roles, { admin: x.roles.includes('admin') }).some((t) => t.id === x.tutorial)) bad.push(`${x.where}: tutorial ${x.tutorial}`);
      if (/¿Sigo\?$/.test(x.text) !== (x.cursor !== undefined)) bad.push(`${x.where}: «¿Sigo?» sin cursor o al revés`);
    }
    expect(bad.slice(0, 30)).toEqual([]);
  });
});
