// What «Ayuda y guías» says since the team guide (12/11), 360 knows too (13/11; Juan: «que el bot sepa todo, TODO lo que
// está en las guías y cómo poder explicarlo»): how to read the guide (the «» and the numbers in brackets), where «Palabras
// de la app» are, «Cómo pasa tu trabajo a los demás» and «Cómo sigue el trabajo». The index first (pure); then a few
// turns on the demo database (invented data, a handful per person, under the hourly cap).
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { HOW_TO_READ } from '@/lib/guides/shared';
import { bestAnswer } from '@/lib/assistant/answers/engine';
import { handleTurn } from '@/lib/assistant';

const ASKED: [Role, string, string, RegExp][] = [
  ['dispatch', '¿qué es Palabras de la app?', 'curado:todo-palabras-app', /«Para todos» → «Palabras de la app»/],
  ['social', '¿dónde están las palabras de la app?', 'curado:todo-palabras-app', /«Palabras de la app»/],
  ['admin', '¿dónde veo lo que significa cada palabra?', 'curado:todo-palabras-app', /«Palabras de la app»/],
  ['social', '¿qué significan los números entre paréntesis de la guía?', 'curado:todo-ayuda-comillas', /cambian según el día/],
  ['dispatch', '¿qué quiere decir lo que va entre comillas en la guía?', 'curado:todo-ayuda-comillas', /texto exacto de la pantalla/],
  ['boss', '¿qué significa lo que va entre comillas?', 'curado:todo-ayuda-comillas', /texto exacto de la pantalla/],
  ['social', '¿qué es «Cómo sigue el trabajo»?', 'curado:todo-ayuda-como-sigue', /debajo de cada tarea/],
  ['boss', '¿qué es «Cómo pasa tu trabajo a los demás»?', 'curado:todo-ayuda-como-pasa', /los flujos de tu rol/],
  ['camera', '¿qué hay en ayuda?', 'curado:todo-ayuda-que-es', /las palabras de la app/],
];

describe('lo nuevo de «Ayuda y guías» en el índice de 360', () => {
  it('cada parte nueva tiene su respuesta, segura', () => {
    for (const [role, q, id, says] of ASKED) {
      const m = bestAnswer(q, { roles: [role] })!;
      expect(m.entry.id, `${role}: ${q} → ${m.text}`).toBe(id);
      expect(m.confidence, `${role}: ${q}`).toBe('strong');
      expect(m.text, `${role}: ${q}`).toMatch(says);
    }
  });

  // What the guide explains, explained (13/11): the feed's menu, what política sees of a date, what a flow is, the cupo.
  it('lo que la guía explica, 360 lo explica igual', () => {
    for (const [role, q, id, says] of [
      ['social', '¿qué hace Publicar antes en el feed?', 'curado:red-feed-mover', /«Publicar antes \(#20\)»/],
      ['social', '¿cómo muevo una pieza un espacio antes en el feed?', 'curado:red-feed-mover', /«Cambiar de espacio»/],
      ['politics', 'cuando el jefe le pone fecha a mi reporte, ¿qué veo yo?', 'curado:pol-saber-agenda', /«Ya tiene fecha/],
      ['politics', '¿qué hace el jefe con mi reporte?', 'curado:pol-jefe-hace', /«Por ponerle fecha»/],
      ['social', '¿qué es un flujo?', 'curado:todo-flujos', /^Un flujo es el camino que sigue un trabajo de un rol a otro\./],
      ['social', '¿qué pasa si hago más piezas que el cupo?', 'curado:red-cupo-pasarse', /si haces más piezas, no pasa nada/],
      ['social', '¿qué pasa si me paso del cupo?', 'curado:red-cupo-pasarse', /si haces más piezas, no pasa nada/],
      // The boss is told in «tú» that the tweets come to him (the guide's boss texts).
      ['boss', '¿cómo subo los tweets de la semana?', 'curado:todo-quien-tweets', /te los manda para aprobar/],
    ] as [Role, string, string, RegExp][]) {
      const m = bestAnswer(q, { roles: [role] })!;
      expect(m.entry.id, `${role}: ${q} → ${m.text}`).toBe(id);
      expect(m.confidence, `${role}: ${q}`).toBe('strong');
      expect(m.text, `${role}: ${q}`).toMatch(says);
    }
  });

  it('cómo leer la guía dice lo mismo que la línea de arriba de «Ayuda y guías»', () => {
    const m = bestAnswer('¿qué quiere decir lo que va entre comillas?', { roles: ['ivt'] })!;
    const [quotes, numbers] = HOW_TO_READ.split('. ');
    expect(m.text).toContain(quotes);
    expect(m.text).toContain(numbers.replace(/\.$/, ''));
  });
});

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

describe('360 lo dice en la conversación (el cerebro de la demo)', () => {
  it('las palabras de la app y cómo leer la guía, con el botón a «Ayuda y guías»', async () => {
    for (const [key, q, says] of [
      ['dispatch', '¿qué es Palabras de la app?', /«Palabras de la app»/],
      ['social2', '¿qué significan los números entre paréntesis de la guía?', /cambian según el día/],
      ['camera2', '¿qué es «Cómo sigue el trabajo»?', /debajo de cada tarea/],
    ] as [DemoUserKey, string, RegExp][]) {
      const r = await handleTurn(sessionOf(key), { question: q, conversationId: null }, { chain: [] });
      expect(r.answer, `${key}: ${q} → ${r.answer}`).toMatch(says);
      expect(r.goTo?.href, `${key}: ${q}`).toBe('/ayuda');
    }
  });
});
