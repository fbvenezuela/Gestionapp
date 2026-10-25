// Every function that reads free text with patterns stays fast on long, hostile input: a pattern that
// backtracks would freeze the server for everyone (one event-title pattern did, before the session was
// checked). Each runs on the longest text it can get (a title is 140 characters, a question or a
// notice 500, a ficha or script 6000, a model's answer about 3000) built from the words the patterns look for.
import { describe, it, expect, beforeAll } from 'vitest';
import * as redact from '@/lib/assistant/redact';
import * as events from '@/lib/assistant/events';
import * as guard from '@/lib/assistant/guard';
import * as titles from '@/lib/assistant/titles';
import * as push from '@/lib/push/text';
import * as title from '@/lib/domain/event-title';
import * as brain from '@/lib/assistant/brain';

const UNITS = [' ', '  ', 'treinta y uno ', 'treinta y uno, ', 'y 1/1 ', '9,30 al ', 'a las 9 ', '[[', '[[E1 ', '«[', 'de la ', 'Calle 7 N° 4-23 ',
  'Plaza Bolívar ', 'lo de la feria ', 'el sábado ', 'mañana ', '0414-1234567 ', 'Alto Verde ', 'entre 8 y 10 ', '12 m ', 'primero de marzo '];
const LIMIT_MS = 250;
// Fichas and scripts the team writes can be 6000 characters, and they are checked on every turn.
const TEACHING = new Set(['guard.teachingProblem', 'guard.scrubTeamFicha', 'guard.scrubTeamScript']);

type Fn = (s: string) => unknown;
const fnsOf = (mod: Record<string, unknown>, name: string) =>
  Object.entries(mod).filter(([, v]) => typeof v === 'function').map(([k, v]) => [`${name}.${k}`, (s: string) => (v as (a: string, ...r: unknown[]) => unknown)(s, [], [])] as [string, Fn]);

function slowest(fn: Fn, length: number) {
  let worst = { ms: 0, unit: '' };
  for (const a of UNITS) {
    for (const b of ['', ...UNITS]) {
      const unit = a + b;
      const text = unit.repeat(Math.ceil(length / unit.length)).slice(0, length - 1) + '!';
      const t0 = performance.now();
      try {
        fn(text);
      } catch {
        // Not every export takes a plain string; only the time matters here.
      }
      const ms = performance.now() - t0;
      if (ms > worst.ms) worst = { ms, unit };
      if (ms > LIMIT_MS) return worst;
    }
  }
  return worst;
}

describe('los patrones sobre texto libre no se traban', () => {
  const cases: [string, Fn, number][] = [
    ...fnsOf(title as never, 'event-title').map(([n, f]) => [n, f, 140] as [string, Fn, number]),
    // A notice is refused above NOTICE_MAX before any check runs on it.
    ...[...fnsOf(redact as never, 'redact'), ...fnsOf(events as never, 'events'), ...fnsOf(guard as never, 'guard'), ...fnsOf(push as never, 'push')].map(
      ([n, f]) => [n, f, n === 'guard.noticeIssues' ? guard.NOTICE_MAX : TEACHING.has(n) ? 6000 : 1500] as [string, Fn, number],
    ),
    ...fnsOf(titles as never, 'titles').map(([n, f]) => [n, f, 3000] as [string, Fn, number]),
  ];
  it.each(cases)('%s', (_name, fn, length) => {
    const worst = slowest(fn, length);
    expect(worst.ms, `más lento con ${JSON.stringify(worst.unit)}`).toBeLessThan(LIMIT_MS);
  }, 120_000);

  it('un título más largo que el máximo no pasa por los patrones de fecha', () => {
    const long = 'Acto ' + 'treinta y uno y '.repeat(40) + 'x';
    const t0 = performance.now();
    expect(title.alwaysWhen(long)).toBe(false);
    expect(title.dateMentions(long)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('un marcador cortado al final se quita, también con mucho espacio en blanco', () => {
    expect(titles.stripTokens('Te cuento de «[[E')).toBe('Te cuento de');
    expect(titles.stripTokens(`Hola${' '.repeat(2000)}[[E1`)).toBe('Hola');
    expect(titles.stripTokens('Sin marcador [no es eso]')).toBe('Sin marcador [no es eso]');
  });
});

// What a person can see is up to 3000 event titles and their places (titles.ts loads at most that), and
// every check of a turn reads them: one at a time, a check took seconds. Invented titles and places, as
// varied as real ones (a kind, a thing and a name each).
// The bars leave room for a slow CI machine: the regressions they guard against took 1 to 2 seconds.
describe('con 3000 títulos y 3000 lugares a la vista, cada revisión tarda poco', () => {
  const KINDS = ['Entrega de', 'Inauguración de', 'Recorrido por', 'Jornada de salud en', 'Reunión con productores de café en', 'Feria de emprendedores en', 'Asamblea comunal en', 'Visita a', 'Toma aérea de', 'Rueda de prensa en', 'Operativo de vacunación en', 'Cabildo abierto en', 'Conversatorio con docentes de'];
  const THINGS = ['la cancha techada', 'el ambulatorio', 'la escuela bolivariana', 'el puente', 'las viviendas', 'el acueducto', 'la vialidad', 'el mercado municipal', 'el liceo', 'la plaza', 'el módulo policial', 'la biblioteca pública', 'el estadio', 'la casa de la cultura', 'el centro de diagnóstico', 'la planta de tratamiento', 'el gimnasio vertical', 'la granja escolar', 'el terminal', 'el muro de contención'];
  const SYL = ['ta', 'ri', 'ba', 'pal', 'mi', 'ra', 'lo', 'que', 'ni', 'co', 'gre', 'se', 'bo', 'ru', 'cha', 'qui', 'mon', 'te', 'lar', 'gua'];
  const PLACE_KINDS = ['Cancha comunal', 'Escuela', 'Casa comunal', 'Plaza', 'Urbanismo', 'Sector', 'Liceo', 'Ambulatorio'];
  const name = (k: number) => {
    const w = `${SYL[k % 20]}${SYL[Math.floor(k / 20) % 20]}${SYL[Math.floor(k / 400) % 20]}`;
    return w[0].toUpperCase() + w.slice(1);
  };
  const N = 3000;
  const T = {
    events: Array.from({ length: N }, (_, k) => `${KINDS[k % KINDS.length]} ${THINGS[k % THINGS.length]} ${k % 2 ? 'en' : 'de'} ${name(k)}`),
    pieces: [] as string[],
    places: Array.from({ length: N }, (_, k) => `${PLACE_KINDS[k % PLACE_KINDS.length]} ${name(k * 7 + 3)}`),
    people: ['kevin', 'daniela', 'carla'],
  };
  type Set3 = typeof T;
  // Every turn reads the titles again: new lists with the same titles (or one more, just created).
  const sameTitles = (): Set3 => ({ events: [...T.events], pieces: [], places: [...T.places], people: [...T.people] });
  const oneMore = (): Set3 => ({ ...sameTitles(), events: [`Entrega de la cancha techada de Nuevo${Math.random().toString(36).slice(2, 8)}`, ...T.events] });
  const fill = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const TEXTS = {
    pregunta: fill('¿Cómo hago un copy para la jornada de salud y el puentesito, y qué llevo a la cancha techada? La canchitica arranca ahorita en Taribaco, a las 3. ', 1500),
    'los títulos mismos': fill(`${T.events.slice(0, 80).join('. ')}. `, 1500),
    'palabras de los títulos': fill('la cancha el puente las viviendas la escuela entrega de jornada de salud ', 1500),
  };
  const cases: [string, (s: string, t: Set3) => unknown][] = [
    ['events.eventSignals', (s, t) => events.eventSignals(s, t)],
    ['events.aboutEvent', (s, t) => events.aboutEvent(s, t)],
    ['events.mentionsEvent', (s, t) => events.mentionsEvent(s, t)],
    ['events.eventIsSubject', (s, t) => events.eventIsSubject(s, t)],
    ['events.eventThread', (s, t) => events.eventThread([s, s.slice(0, 500)], t)],
    ['events.namedTitleWords (eventos)', (s, t) => events.namedTitleWords(s, t.events)],
    ['events.namedTitleWords (lugares)', (s, t) => events.namedTitleWords(s, t.places)],
    ['events.redactPlaceAfterA', (s, t) => events.redactPlaceAfterA(s, t)],
    ['guard.noticeIssues', (s, t) => guard.noticeIssues(s.slice(0, guard.NOTICE_MAX), t)],
    ['guard.teachingProblem', (s, t) => guard.teachingProblem({ said: [s], asked: [s.slice(0, 500)], titles: t })],
    ['guard.scrubTeamFicha', (s, t) => guard.scrubTeamFicha('Ficha', s, t)],
    ['guard.scrubTeamScript', (s, t) => guard.scrubTeamScript(s, t)],
    ['brain.guardQuestion', (s, t) => brain.guardQuestion(s, t)],
    ['brain.breaksAgendaRule', (s, t) => brain.breaksAgendaRule('Es el sábado a las 4 en la plaza.', s, [], t)],
    ['titles.Placeholders', (s, t) => new titles.Placeholders(t).mask(s)],
    ['titles.withTitleHoles', (s, t) => titles.withTitleHoles(s, t, { names: true })],
  ];
  // The first turn reads each title once.
  beforeAll(() => {
    for (const [, fn] of cases) fn('hola', T);
  });

  // The middle of three turns: a pause of the garbage collector in one is not the check's.
  it.each(cases)('%s', (_name, fn) => {
    for (const [what, text] of Object.entries(TEXTS)) {
      for (const [lists, make] of [['los mismos títulos', sameTitles], ['uno nuevo', oneMore]] as const) {
        const times = [0, 1, 2].map(() => {
          const t = make();
          const t0 = performance.now();
          fn(text, t);
          return performance.now() - t0;
        });
        expect(times.sort((a, b) => a - b)[1], `${what}, ${lists}`).toBeLessThan(150);
      }
    }
  });

  it('3000 títulos nuevos se leen una vez, en pocos segundos como mucho', () => {
    const fresh = { events: T.events.map((t) => `${t} bis`), pieces: [], places: T.places.map((p) => `${p} Bis`), people: T.people };
    const t0 = performance.now();
    events.eventSignals(TEXTS.pregunta, fresh);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
