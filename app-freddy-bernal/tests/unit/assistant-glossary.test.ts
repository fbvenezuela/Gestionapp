// «Palabras de la app» in 360 (12/11; Juan: «asegúrate que el bot sepa todo… y cómo poder explicarlo»): every word of
// the glossary (src/lib/guides/glossary.ts) and every name it is asked with, as «¿qué es…?», «¿qué significa…?»,
// «¿qué quiere decir…?» and «¿para qué sirve…?», for every team role and administración, gets what it means: the word's own entry, or a curated
// answer that says the same. A «¿cómo…?» that names the word goes to how it is done, and a label that only contains the
// word keeps its own answer. The demo brain says it whole, «9:16» included, never with the agenda's refusal. The index
// first (pure); then a few turns on the demo database (invented data, a handful per person, under the hourly cap).
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { GLOSSARY, glossaryLine } from '@/lib/guides';
import { allEntries, bestAnswer } from '@/lib/assistant/answers/engine';
import { handleTurn } from '@/lib/assistant';

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
            const ok = !!m && (m.entry.id === `palabra:${g.id}` || (m.entry.kind === 'curated' && KEY[g.id].test(m.text)));
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

  it('una etiqueta que lleva la palabra («Copy faltante») sigue con su respuesta', () => {
    const m = bestAnswer('¿qué es «Copy faltante»?', { roles: ['social'] })!;
    expect(m.entry.kind).not.toBe('term');
    expect(m.text).toMatch(/Copy faltante/);
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

  it('«9:16» se explica como la forma de la pantalla; una hora de verdad sigue con la negativa', async () => {
    const r = await handleTurn(sessionOf('camera'), { question: '¿qué significa 9:16?', conversationId: null }, { chain: [] });
    expect(r.answer).toContain('9:16 es vertical');
    const hour = await handleTurn(sessionOf('camera2'), { question: '¿a qué hora es la jornada de salud? ¿a las 9:16?', conversationId: null }, { chain: [] });
    expect(hour.answer).toMatch(REFUSAL);
  });
});
