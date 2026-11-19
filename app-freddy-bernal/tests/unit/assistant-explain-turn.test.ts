// 360 explains at the turn (design §4(c), WF-C): the hook of local.ts (step E) with what its last answer was about and
// where its steps go on, kept in assistant_messages.go_to («entry», «cursor»). Through the demo brain on the demo
// database, as the demo users, with whole threads; never after a turn about an event. Also the client's words of the
// web's guide: fillHuecos fills their four huecos and the index reads them filled. Invented data; the hourly count is
// set back between threads (like the harness).
import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn, type TurnResult } from '@/lib/assistant';
import { allEntries, indexedText } from '@/lib/assistant/answers/engine';
import { lastTopic } from '@/lib/assistant/store';
import { fillHuecos } from '@/lib/assistant/text';
import { concreteDateTime } from '@/lib/guides/check';
import { UNFILLED_HUECO, clientWords, fillClientWords, wordsByHueco } from '@/lib/guides/web/words';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const resetHourly = () =>
  withSystem(async (sql) => {
    await sql.query(`set local session_replication_role = replica`);
    await sql.query(`delete from public.assistant_messages where who = 'persona'`);
  });

/** A whole thread, in one conversation: each answer, and the conversation. */
async function thread(key: DemoUserKey, questions: string[], screen?: string): Promise<{ answers: TurnResult[]; conversationId: string }> {
  let conversationId: string | null = null;
  const answers: TurnResult[] = [];
  for (const question of questions) {
    const r = await handleTurn(sessionOf(key), { question, conversationId, screen }, { chain: [] });
    conversationId = r.conversationId;
    answers.push(r);
  }
  return { answers, conversationId: conversationId! };
}

/** What 360's last answer of a conversation keeps in go_to. */
const savedGoTo = async (conversationId: string) =>
  (await withSystem((sql) => sql.one<{ go_to: Record<string, unknown> | null }>(`select go_to from public.assistant_messages where conversation_id = $1 and who = 'asistente' order by created_at desc limit 1`, [conversationId])))?.go_to ?? null;

// What only an explain answer says: never next to a turn about an event.
const EXPLAINED = /Lo que dice es esto|Lo que sé es esto|La guía no da el porqué|De eso no tengo el porqué|paso a paso: 1\)|¿Sigo\?|^Es el paso \d+:|^Después(?::| te toca a ti:| le toca a )/;

beforeEach(resetHourly);

describe('360 explica en la conversación (el paso E de local.ts)', () => {
  it('«paso a paso»: tres pasos con «¿Sigo?» y el botón; «sí» dice los siguientes; el tema y el cursor van y vuelven en go_to', async () => {
    const { answers, conversationId } = await thread('boss', ['¿cómo apruebo una amarilla?', 'paso a paso porfa']);
    const steps = answers[1];
    expect(steps.answer).toMatch(/^Aprobar una amarilla o una roja, paso a paso: 1\) .+ 2\) .+ 3\) .+ ¿Sigo\?$/);
    expect(steps.answer).not.toMatch(/Puedo mostrarte, paso a paso/);
    expect(steps.goTo ?? steps.tutorial, steps.answer).toBeTruthy();
    expect(await savedGoTo(conversationId)).toMatchObject({ entry: 'jefe:paso-a-paso:aprobar-pieza', cursor: 3 });
    const more = await handleTurn(sessionOf('boss'), { question: 'sí', conversationId }, { chain: [] });
    expect(more.answer).toMatch(/^4\) /);
    const after = await savedGoTo(conversationId);
    expect(after?.entry).toBe('jefe:paso-a-paso:aprobar-pieza');
    if (/¿Sigo\?$/.test(more.answer)) expect(Number(after?.cursor)).toBeGreaterThan(3);
    else expect(after?.cursor).toBeUndefined();
  });

  it('«ok» o «dale» después de «¿Sigo?» también siguen (no son una charla)', async () => {
    for (const yes of ['ok', 'dale']) {
      await resetHourly();
      const { answers } = await thread('boss', ['¿cómo apruebo una amarilla?', 'paso a paso porfa', yes]);
      expect(answers[2].answer, yes).toMatch(/^4\) /);
    }
  });

  it('«no entendí lo de limpio»: lo que la tarea dice de eso, con su paso; nunca «No encontré ningún evento»', async () => {
    const { answers } = await thread('camera', ['¿cómo subo el material?', 'no entendí lo de limpio']);
    const r = answers[1];
    expect(r.answer).toMatch(/^Es el paso \d+: .*limpio/);
    expect(r.answer).not.toMatch(/No encontré ningún evento/);
    expect(r.did.map((d) => d.tool)).not.toContain('buscar_evento');
  });

  it('«¿y después?», «más fácil» y «¿qué significa eso?» del tema de la respuesta de antes', async () => {
    const next = (await thread('social', ['¿cómo mando una pieza a aprobación?', '¿y después?'])).answers[1];
    // (After «Enviar a aprobación» comes the jefe's step, whatever its colour: the flow's next box, never «Aprobada» first.)
    expect(next.answer).toMatch(/^Después le toca al jefe: .*«Antes de aprobar»/);
    await resetHourly();
    const easy = (await thread('politics', ['¿cómo cargo una ficha comunitaria?', 'no entendí, explícamelo más fácil'])).answers[1];
    expect(easy.answer).toMatch(/«Nueva ficha comunitaria»/);
    expect(easy.answer.length).toBeLessThan(240);
    await resetHourly();
    const meaning = (await thread('social', ['¿qué es el cupo?', '¿qué significa eso?'])).answers[1];
    expect(meaning.answer).toMatch(/cupo/i);
  });

  it('después de una pregunta de un evento sigue lo de hoy: la negativa no guarda tema y nada se explica', async () => {
    const cases: [DemoUserKey, string, string][] = [
      ['dispatch', '¿cuándo es la feria?', '¿y por qué?'],
      ['social2', '¿Dónde es la feria?', 'explícamelo más fácil'],
      ['dispatch', '¿dónde queda lo de la cancha?', 'dame un ejemplo'],
      ['boss', '¿cuándo es la entrega de viviendas?', 'paso a paso'],
      ['social', '¿a qué hora termina la feria?', '¿y después?'],
      ['camera', '¿A qué hora es la jornada de salud?', 'dime más'],
    ];
    for (const [key, first, ask] of cases) {
      await resetHourly();
      const { answers, conversationId } = await thread(key, [first]);
      expect(answers[0].answer, first).toMatch(/no lo manejo|no la tengo/);
      expect((await savedGoTo(conversationId))?.entry, first).toBeNull();
      const r = await handleTurn(sessionOf(key), { question: ask, conversationId }, { chain: [] });
      const who = `${key}: ${first} → ${ask} → ${r.answer}`;
      expect(r.answer, who).not.toMatch(EXPLAINED);
      expect(concreteDateTime(r.answer), who).toBe(false);
    }
  });

  it('«lo de X» con un evento o un lugar no es un tema: lo contestan los pasos de la agenda, sin explicar', async () => {
    for (const [key, q, before] of [
      ['social', 'no entendí lo de la feria', undefined],
      ['camera', 'no entendí lo de la jornada de salud', '¿cómo subo el material?'],
      ['dispatch', 'dame un ejemplo de lo del lunes', '¿cómo creo un evento?'],
    ] as [DemoUserKey, string, string | undefined][]) {
      await resetHourly();
      const { answers } = await thread(key, [...(before ? [before] : []), q]);
      const r = answers.at(-1)!;
      expect(r.answer, `${q} → ${r.answer}`).not.toMatch(EXPLAINED);
    }
  });

  it('una conversación guardada antes de que 360 guardara el tema: vuelve a buscar la pregunta de antes', async () => {
    const { conversationId } = await thread('boss', ['¿cómo apruebo una amarilla?']);
    // As an answer saved before this round: its button and no «entry».
    await withSystem(async (sql) => {
      await sql.query(`set local session_replication_role = replica`);
      await sql.query(`update public.assistant_messages set go_to = $2::text::jsonb where conversation_id = $1 and who = 'asistente'`, [conversationId, JSON.stringify({ href: '/aprobar', label: 'Por aprobar' })]);
    });
    const r = await handleTurn(sessionOf('boss'), { question: 'paso a paso porfa', conversationId }, { chain: [] });
    expect(r.answer).toMatch(/^Aprobar una amarilla o una roja, paso a paso: 1\) /);
  });

  it('go_to guarda el botón y de qué fue la respuesta: lastTopic lo lee solo como lo escribe el servidor', () => {
    expect(lastTopic(null)).toBeNull();
    expect(lastTopic({ href: '/hoy', label: 'Hoy' })).toBeNull();
    expect(lastTopic({ href: '/hoy', label: 'Hoy', entry: null })).toEqual({ entry: null });
    expect(lastTopic({ entry: 'jefe:paso-a-paso:aprobar-pieza', cursor: 3 })).toEqual({ entry: 'jefe:paso-a-paso:aprobar-pieza', cursor: 3 });
    expect(lastTopic({ entry: 'flujo:pieza' })).toEqual({ entry: 'flujo:pieza' });
    // Anything else is no topic, and a cursor goes only with one.
    expect(lastTopic({ entry: 'DROP TABLE x' })).toEqual({ entry: null });
    expect(lastTopic({ entry: 'jefe:paso-a-paso:aprobar-pieza', cursor: -1 })).toEqual({ entry: 'jefe:paso-a-paso:aprobar-pieza' });
    expect(lastTopic({ entry: 'jefe:paso-a-paso:aprobar-pieza', cursor: 2.5 })).toEqual({ entry: 'jefe:paso-a-paso:aprobar-pieza' });
    expect(lastTopic({ entry: null, cursor: 3 })).toEqual({ entry: null });
    // Every id of the index is one go_to can keep.
    for (const e of allEntries()) expect(lastTopic({ entry: e.id })?.entry, e.id).toBe(e.id);
  });
});

describe('las palabras del cliente en lo que dice 360', () => {
  const words = clientWords();

  it('fillHuecos llena los cuatro huecos de la guía de la web con config/clients', () => {
    const text = 'El [PROGRAMA], el [SEMANARIO], la web oficial ([WEB_OFICIAL]) y [ORGANIZACION].';
    const filled = fillHuecos(text, { name: '360', app: 'la app', boss: 'el jefe', person: 'Ana', words: wordsByHueco() });
    expect(filled).toBe(fillClientWords(text, words));
    expect(filled).not.toMatch(UNFILLED_HUECO);
    for (const w of Object.values(words)) expect(filled).toContain(w);
    // Without the words (an old caller), the huecos stay as they are.
    expect(fillHuecos('[PROGRAMA]', { name: '360', app: 'la app', boss: 'el jefe', person: 'Ana' })).toBe('[PROGRAMA]');
  });

  it('el índice lee las palabras llenas (así «¿qué es el …?» con ese nombre encuentra lo que lo nombra), y ninguna entrada se queda con un hueco', () => {
    expect(indexedText('¿qué es el [PROGRAMA]?')).toContain(words.program);
    expect(indexedText('¿qué es el [SEMANARIO]?')).toContain(words.weekly);
    for (const e of allEntries()) expect(`${e.q.join(' ')} ${e.doc ?? ''}`, e.id).not.toMatch(UNFILLED_HUECO);
  });
});
