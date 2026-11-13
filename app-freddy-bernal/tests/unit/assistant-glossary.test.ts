// «Palabras de la app» in 360 (12/11; Juan: «asegúrate que el bot sepa todo… y cómo poder explicarlo»): every word of
// the glossary (src/lib/guides/glossary.ts) and every name it is asked with, as «¿qué es…?», «¿qué significa…?»,
// «¿qué quiere decir…?» and «¿para qué sirve…?», for every team role and administración, gets what it means: the word's own
// entry, a curated answer that says the same, or the curated answer written for that role and that very question (13/11:
// «¿qué es FAB?» of Redes is the copy's formula). A «¿cómo…?», a «¿puedo…?», a «¿quién…?» that names the word goes to how
// it is done (the meaning is never sure there), a «¿dónde…?» to where it is when an answer says it, and a label or a
// field that only contains the word («Sin programar», «Lo que va a decir») keeps its own answer. The demo brain says it
// whole, «9:16», «16:9» and «4:5» included, never with the agenda's refusal. The index first (pure); then a few turns on
// the demo database (invented data, a handful per person, under the hourly cap).
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { GLOSSARY, glossaryLine } from '@/lib/guides';
import { allEntries, bestAnswer, findAnswers, readable } from '@/lib/assistant/answers/engine';
import { handleTurn } from '@/lib/assistant';
import { glossaryFichas, systemPrompt, type TurnContext } from '@/lib/assistant/brain';
import { defaultProfile } from '@/lib/assistant/config';

const ROLES: Role[] = ['social', 'boss', 'camera', 'dispatch', 'politics', 'ivt', 'admin'];
const ASK = (x: string) => [`¿qué es ${x}?`, `¿qué significa ${x}?`, `¿qué quiere decir ${x}?`, `¿para qué sirve ${x}?`];
// Administración has no Mensajes (D-49): a word of Mensajes is never asked in its name.
const MESSAGES_WORDS = /\b(?:mensajes?|canal(?:es)?|globitos?)\b/i;

// The words that carry each meaning: a curated answer that wins must say them (the word's own entry always does).
const KEY: Record<string, RegExp> = {
  pieza: /publicaci[oó]n|reel|carrusel/i,
  'reel-y-short': /video corto|vertical/i,
  'carrusel-y-lamina': /varias im[aá]genes|l[aá]mina/i,
  'historia-y-sticker': /un d[ií]a en el perfil|sticker/i,
  copy: /texto que acompa[ñn]a|texto que sale con la pieza/i,
  caption: /debajo de la foto|copy largo|el largo es el caption/i,
  'hook-y-cta': /primera frase|engancha|invitaci[oó]n del final/i,
  'texto-del-arte': /dentro de la imagen|Antet[ií]tulo/i,
  feed: /cuadr[ií]cula|24 espacios/i,
  'mes-cupo-y-pilar': /cu[aá]ntas piezas|tema/i,
  storyboard: /guion|qu[eé] se graba/i,
  'ficha-tecnica': /de qu[eé] es|datos con su fuente/i,
  'dialogo-fab': /qu[eé] mejora|qu[eé] gana la gente/i,
  'nota-para-el-editor': /qu[eé] toma sirve|quien edita/i,
  semaforo: /verde.*amarillo.*rojo|rutina/i,
  'motivos-rapidos': /ya escritos|Muy largo/i,
  'avisos-de-cumplimiento': /autorizaci[oó]n|cuidado/i,
  receptividad: /1 a 10|c[oó]mo recibi[oó]/i,
  programar: /d[ií]a y la hora|calendario/i,
  tanda: /tweets de una semana|tweets de la semana/i,
  trancado: /se par[oó]|necesita una mano/i,
  etiquetas: /recuadritos|c[oó]mo va algo/i,
  campos: /donde se escribe/i,
  'numeros-y-medidas': /vertical|cu[aá]ntas letras|peso/i,
  csv: /hoja de c[aá]lculo|muchos resultados/i,
  oficina: /salas|dibujad/i,
  'web-y-atencion': /web p[uú]blica|atenci[oó]n a la gente/i,
  administracion: /parte t[eé]cnica|rol t[eé]cnico/i,
};

describe('las palabras de la app en el índice de 360', () => {
  const entries = allEntries();

  it('cada palabra tiene su entrada, para el equipo y administración, que dice lo que significa', () => {
    expect(Object.keys(KEY).sort()).toEqual(GLOSSARY.map((g) => g.id).sort());
    for (const g of GLOSSARY) {
      const e = entries.find((x) => x.id === `palabra:${g.id}`)!;
      expect(e, g.id).toBeTruthy();
      expect(e.kind).toBe('term');
      expect(e.roles).toBeNull();
      expect(e.a).toBe(glossaryLine(g));
      expect(e.go).toBe('/ayuda');
      expect(KEY[g.id].test(g.text), g.id).toBe(true);
    }
  });

  it('«¿qué es…?», «¿qué significa…?», «¿qué quiere decir…?» y «¿para qué sirve…?» de cada palabra y cada nombre, para cada rol', () => {
    const bad: string[] = [];
    let n = 0;
    for (const g of GLOSSARY) {
      const names = [...new Set([g.term, ...g.aka].map((x) => x.toLowerCase()))];
      for (const name of names)
        for (const q of ASK(name))
          for (const role of ROLES) {
            if (role === 'admin' && MESSAGES_WORDS.test(name)) continue;
            n++;
            const m = bestAnswer(q, { roles: [role] });
            // (A curated answer written for this role and asked word for word says it for the role: «¿qué es FAB?» of Redes.)
            const own = !!m && m.entry.kind === 'curated' && !!m.entry.roles?.includes(role) && m.entry.q.map(readable).includes(readable(q));
            const ok = !!m && (m.entry.id === `palabra:${g.id}` || (m.entry.kind === 'curated' && KEY[g.id].test(m.text)) || own);
            if (!ok) bad.push(`${role} · ${q} → ${m?.entry.id ?? 'nada'}: ${m?.text.slice(0, 90) ?? ''}`);
          }
    }
    expect(n).toBeGreaterThan(2000);
    expect(bad).toEqual([]);
  });

  it('un «¿cómo…?» que nombra la palabra va a cómo se hace, no a lo que significa', () => {
    const how: [Role, string][] = [
      ['social', '¿cómo hago un reel?'],
      ['social', '¿cómo armo el storyboard?'],
      ['social', '¿cómo hago los copies?'],
      ['social', '¿cómo programo una publicación?'],
      ['social', '¿cómo subo la tanda?'],
      ['social', '¿cómo armo el feed?'],
      ['social', '¿cómo funciona el semáforo?'],
      ['social', '¿cómo cargo un CSV?'],
      ['boss', '¿cómo elimino una pieza?'],
      ['boss', '¿cómo apruebo una pieza en rojo?'],
      ['camera', '¿cómo dejo la nota para el editor?'],
      ['ivt', '¿cómo genero el diálogo fab?'],
    ];
    for (const [role, q] of how) expect(bestAnswer(q, { roles: [role] })?.entry.kind, `${role}: ${q}`).not.toBe('term');
  });

  // Every name with the verbs people use, and the other kinds of question (13/11): the meaning may back up another
  // answer, but it is never a sure answer by itself to «¿cómo hago un reel?», «¿puedo cambiar el copy?», «¿quién arma
  // el feed?», «¿cuántos reels…?» or «¿por qué no me sale…?».
  it('a un «¿cómo…?», «¿puedo…?», «¿quién…?» o «¿cuántos…?» la palabra nunca contesta segura', () => {
    const VERBS = ['hago', 'subo', 'armo', 'pongo', 'escribo', 'cambio', 'mando', 'veo'];
    const OTHER = ['¿puedo cambiar', '¿quién hace', '¿cuántos', '¿por qué no me sale', '¿qué tengo que hacer para'];
    const sure: string[] = [];
    let n = 0;
    for (const g of GLOSSARY)
      for (const name of new Set(g.aka.map((x) => x.toLowerCase())))
        for (const role of ['social', 'camera', 'admin'] as Role[]) {
          if (role === 'admin' && MESSAGES_WORDS.test(name)) continue;
          for (const q of [...VERBS.map((v) => `¿cómo ${v} ${name}?`), ...OTHER.map((w) => `${w} ${name}?`)]) {
            n++;
            const m = findAnswers(q, { roles: [role], limit: 8 }).find((x) => x.entry.kind === 'term');
            if (m?.confidence === 'strong') sure.push(`${role} · ${q} → ${m.entry.id} ${m.score.toFixed(2)}`);
          }
        }
    expect(n).toBeGreaterThan(2000);
    expect(sure).toEqual([]);
  });

  // Written for the role and asked word for word, a curated answer says the word for that role (13/11): the generic
  // meaning stays behind it.
  it('la respuesta curada del rol, preguntada tal cual, va antes que la palabra', () => {
    const own: [Role, string, string, RegExp][] = [
      ['social', '¿qué es FAB?', 'curado:red-copies-formula', /F[oó]rmula/],
      ['ivt', '¿qué es el feed?', 'curado:ivt-semaforo', /el IVT no ve piezas/],
      ['ivt', '¿qué es el semáforo?', 'curado:ivt-semaforo', /el IVT no ve piezas/],
      ['politics', '¿qué significa trancado?', 'curado:todo-trancado', /No es de tu rol/],
      ['camera', '¿para qué es la nota para el editor?', 'curado:gra-nota-que', /Sin hora, fecha/],
      ['admin', '¿qué son los pilares?', 'curado:adm-pilar-que-son', /Los pones tú/],
    ];
    for (const [role, q, id, says] of own) {
      const m = bestAnswer(q, { roles: [role] })!;
      expect(m.entry.id, `${role}: ${q} → ${m.text}`).toBe(id);
      expect(m.confidence).toBe('strong');
      expect(m.text).toMatch(says);
    }
    // Not asked word for word, the meaning goes first again («¿qué es el diálogo FAB?» of Redes).
    expect(bestAnswer('¿qué es el diálogo FAB?', { roles: ['social'] })?.entry.id).toBe('palabra:dialogo-fab');
  });

  // A label, a field or another word that only shares the root (13/11): its own answer, never the word's meaning. (Where
  // no answer of the role says it, «¿qué es «Sin pilar»?» of the boss, the meaning may come first, never as a sure one.)
  it('una etiqueta, un campo u otra palabra con la misma raíz no es la palabra', () => {
    const boss = findAnswers('¿qué es «Sin pilar»?', { roles: ['boss'], limit: 8 }).find((m) => m.entry.id === 'palabra:mes-cupo-y-pilar');
    expect(boss?.confidence).not.toBe('strong');
    for (const [role, q, not] of [
      ['social', '¿qué significa «Sin programar»?', 'palabra:programar'],
      ['admin', '¿qué es «Sin programar»?', 'palabra:programar'],
      ['social', '¿qué es lo que va a decir en el storyboard?', 'palabra:storyboard'],
      ['social', '¿qué es lo que tengo que hacer con el copy?', 'palabra:copy'],
      ['camera', '¿qué es lo que tengo que hacer con la nota para el editor?', 'palabra:nota-para-el-editor'],
      ['social', '¿qué es el título?', 'palabra:texto-del-arte'],
      ['dispatch', '¿qué es el título?', 'palabra:texto-del-arte'],
      ['politics', '¿qué es el título?', 'palabra:texto-del-arte'],
      ['ivt', '¿qué es el título?', 'palabra:texto-del-arte'],
      ['camera', '¿qué es el título?', 'palabra:texto-del-arte'],
    ] as [Role, string, string][]) {
      const all = findAnswers(q, { roles: [role], limit: 8 });
      expect(all[0]?.entry.id, `${role}: ${q} → ${all[0]?.text}`).not.toBe(not);
      // A quoted label that is not its name, or a word that only shares its root: the meaning is never sure there.
      if (/«|t[ií]tulo/.test(q)) expect(all.find((m) => m.entry.id === not)?.confidence ?? 'none', `${role}: ${q}`).not.toBe('strong');
    }
    // Redes' own answers for them say what they are.
    expect(bestAnswer('¿qué significa «Sin programar»?', { roles: ['social'] })!.text).toMatch(/sin espacio en el feed/);
    expect(bestAnswer('¿qué es lo que va a decir en el storyboard?', { roles: ['social'] })!.text).toMatch(/modo lectura/);
    expect(bestAnswer('¿qué es el título?', { roles: ['social'] })).toMatchObject({ entry: { id: 'curado:red-titulo' }, confidence: 'strong' });
    // With the frame and its fillers, the name alone is still the word: «¿y qué es el hook exactamente?», «trancado, ¿qué es?».
    expect(bestAnswer('¿y qué es el hook exactamente?', { roles: ['social'] })?.entry.id).toBe('palabra:hook-y-cta');
    expect(bestAnswer('¿qué significa la palabra trancado?', { roles: ['boss'] })?.entry.id).toBe('palabra:trancado');
  });

  it('un «¿dónde…?» que nombra la palabra va a dónde está si una respuesta lo dice; si no, a lo que significa', () => {
    // Política's labels are on top of the ficha: the answer that says so, not what an «etiqueta» is.
    const labels = bestAnswer('¿dónde veo las etiquetas?', { roles: ['politics'] })!;
    expect(labels.entry.kind, labels.text).not.toBe('term');
    expect(labels.text).toMatch(/[Aa]rriba/);
    // Nothing else says where the office is: its meaning says it («Lo que abre «Oficina» en el menú…»), never the
    // answer about codes and keys that «la oficina» used to bring.
    for (const [role, q] of [['boss', '¿dónde está la oficina?'], ['admin', '¿dónde veo la oficina?']] as [Role, string][]) {
      const m = bestAnswer(q, { roles: [role] })!;
      expect(m.text, `${role}: ${q}`).toMatch(/Oficina/);
      expect(m.text, `${role}: ${q}`).not.toMatch(/c[oó]digos|claves/);
    }
  });

  it('una etiqueta que lleva la palabra («Copy faltante») sigue con su respuesta', () => {
    const m = bestAnswer('¿qué es «Copy faltante»?', { roles: ['social'] })!;
    expect(m.entry.kind).not.toBe('term');
    expect(m.text).toMatch(/Copy faltante/);
  });
});

// With a model chain (once the legal OK arrives), the words go to the model as fichas of the app, picked like the
// others for the question: «¿qué es un hook?» brings its meaning, a question about something else does not.
describe('con modelo: las palabras van como fichas', () => {
  it('una ficha por palabra, y la del hook en el prompt cuando se pregunta por el hook', () => {
    expect(glossaryFichas().map((f) => f.key)).toEqual(GLOSSARY.map((g) => `palabra:${g.id}`));
    expect(glossaryFichas().every((f) => f.origin === 'plataforma')).toBe(true);
    const ctx: TurnContext = {
      profile: defaultProfile(),
      huecos: { name: 'Asistente', app: 'la app', boss: 'el jefe', person: 'Ana' },
      roles: ['social'],
      personName: 'Ana Prueba',
      knowledge: [],
      scripts: [],
      history: [],
      screen: null,
    };
    const hook = GLOSSARY.find((g) => g.id === 'hook-y-cta')!;
    expect(systemPrompt(ctx, [], '¿qué es un hook?')).toContain(hook.text);
    expect(systemPrompt(ctx, [], '¿cómo cancelo un evento?')).not.toContain(hook.text);
  });
});

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const REFUSAL = /no lo manejo|no la tengo/;

describe('360 lo explica en la conversación (el cerebro de la demo)', () => {
  const PEOPLE: DemoUserKey[] = ['social', 'boss', 'camera', 'dispatch', 'politics', 'ivt', 'admin'];
  const ASKED: [string, string][] = [
    ['¿qué es 9:16?', 'numeros-y-medidas'],
    ['¿qué significa 16:9?', 'numeros-y-medidas'],
    ['¿qué es 4:5?', 'numeros-y-medidas'],
    ['¿qué significa trancado?', 'trancado'],
    ['¿qué es un hook?', 'hook-y-cta'],
    ['¿qué quiere decir CSV?', 'csv'],
    ['¿qué es la oficina?', 'oficina'],
  ];
  for (const key of PEOPLE) {
    it(`${key}: lo que significa cada palabra, sin la negativa de la agenda`, async () => {
      for (const [q, id] of ASKED) {
        const r = await handleTurn(sessionOf(key), { question: q, conversationId: null }, { chain: [] });
        const who = `${key}: ${q} → ${r.answer}`;
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        expect(r.answer, who).not.toMatch(REFUSAL);
        expect(r.answer, who).toMatch(KEY[id]);
      }
    });
  }

  // With its article («¿qué es el feed?») the word is still asked what it means: its meaning, not a card that only uses
  // it («Para armar el feed del mes…»), nor a guess.
  it('con su artículo también es lo que significa («¿qué es el feed?», «¿qué es el copy?»)', async () => {
    for (const [key, q, id] of [
      ['boss', '¿qué es el feed?', 'feed'],
      ['social2', '¿qué es el feed?', 'feed'],
      ['boss', '¿qué es el copy?', 'copy'],
      ['camera2', '¿qué es el storyboard?', 'storyboard'],
    ] as [DemoUserKey, string, string][]) {
      const r = await handleTurn(sessionOf(key), { question: q, conversationId: null }, { chain: [] });
      const who = `${key}: ${q} → ${r.answer}`;
      expect(r.answer, who).toMatch(KEY[id]);
      expect(r.answer, who).not.toMatch(/^Para armar/);
    }
  });

  it('«9:16» se explica como la forma de la pantalla; una hora de verdad sigue con la negativa', async () => {
    const r = await handleTurn(sessionOf('camera'), { question: '¿qué significa 9:16?', conversationId: null }, { chain: [] });
    expect(r.answer).toContain('9:16 es vertical');
    const hour = await handleTurn(sessionOf('camera2'), { question: '¿a qué hora es la jornada de salud? ¿a las 9:16?', conversationId: null }, { chain: [] });
    expect(hour.answer).toMatch(REFUSAL);
  });
});
