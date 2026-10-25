// Every function that reads free text with patterns stays fast on long, hostile input: a pattern that
// backtracks would freeze the server for everyone (one event-title pattern did, before the session was
// checked). Each runs on the longest text it can get (a title is 140 characters, a question or a
// notice 500, a ficha or script 6000, a model's answer about 3000) built from the words the patterns look for.
import { describe, it, expect } from 'vitest';
import * as redact from '@/lib/assistant/redact';
import * as events from '@/lib/assistant/events';
import * as guard from '@/lib/assistant/guard';
import * as titles from '@/lib/assistant/titles';
import * as push from '@/lib/push/text';
import * as title from '@/lib/domain/event-title';

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
    expect(performance.now() - t0).toBeLessThan(20);
  });

  it('un marcador cortado al final se quita, también con mucho espacio en blanco', () => {
    expect(titles.stripTokens('Te cuento de «[[E')).toBe('Te cuento de');
    expect(titles.stripTokens(`Hola${' '.repeat(2000)}[[E1`)).toBe('Hola');
    expect(titles.stripTokens('Sin marcador [no es eso]')).toBe('Sin marcador [no es eso]');
  });
});
