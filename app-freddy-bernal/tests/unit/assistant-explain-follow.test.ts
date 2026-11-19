// The follow-ups people say in a thread and how 360 reads them (WF-C2, design §4(c)): «¿qué hago, paso a paso?» and
// «paso a paso cómo …» are the topic's steps, and «… paso a paso» said of a topic of its own is that topic's steps (never
// the list of the tutorials); «¿y qué pasa con X?» is what the topic says of X («¿y después qué pasa con esos…?» is what
// comes next); a yes or no («¿y se borra?») is what the topic says of it, by its own verb and about the topic; «¿y yo qué
// hago ahí?» is the person's own part; «¿y X en qué se diferencia?» is what X is; «¿y a quién le llega?» is a «who»;
// «¿y cómo lo pongo otra vez?» is how it is got back; «¿se borra?» alone is about the topic. «¿Y después?» goes on by the
// flow: the jefe's step after «Enviar a aprobación», the way the person named, what each answer of someone else's step
// does, and one's own steps in a row before someone else's. In a thread 360 never says the same text twice: an answer
// that would say again what it said is the sentence of it that answers. The asks alone, and threads through the demo
// brain on the demo database, as the demo users; asks and threads written for this file.
import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn, type TurnResult } from '@/lib/assistant';
import { explainAsk, saysVerb, sentenceSaying } from '@/lib/assistant/explain';
import { plain } from '@/lib/assistant/text';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const resetHourly = () =>
  withSystem(async (sql) => {
    await sql.query(`set local session_replication_role = replica`);
    await sql.query(`delete from public.assistant_messages where who = 'persona'`);
  });

async function thread(key: DemoUserKey, questions: string[]): Promise<TurnResult[]> {
  let conversationId: string | null = null;
  const answers: TurnResult[] = [];
  for (const question of questions) {
    const r = await handleTurn(sessionOf(key), { question, conversationId }, { chain: [] });
    conversationId = r.conversationId;
    answers.push(r);
  }
  return answers;
}

const TUTORIAL_LIST = /Puedo mostrarte, paso a paso/;
const NOT_SURE = /No estoy seguro/;
const distinct = (answers: TurnResult[]) => new Set(answers.map((a) => plain(a.answer))).size === answers.length;

describe('explainAsk: los seguimientos de una conversación (WF-C2)', () => {
  it('«paso a paso» con el verbo de lo que se quiere hacer alrededor: los pasos del tema', () => {
    for (const q of ['¿qué hago, paso a paso?', 'y cómo lo hago, paso a paso', 'paso a paso cómo cambio algo ahí', 'pasito a pasito qué tengo que hacer']) expect(explainAsk(q)?.facet, q).toBe('steps');
  });

  it('«¿y qué pasa con X?» es lo que el tema dice de X; con «esos» o «ella», lo que sigue', () => {
    expect(explainAsk('¿y qué pasa con la vieja?')).toEqual({ facet: 'whatif', about: 'la vieja', of: true });
    expect(explainAsk('¿y qué hago con las fotos?')).toMatchObject({ facet: 'whatif', about: 'las fotos', of: true });
    expect(explainAsk('y luego qué pasa con esas piezas')).toEqual({ facet: 'next' });
    expect(explainAsk('¿y después qué pasa con ella?')).toEqual({ facet: 'next' });
  });

  it('un sí o un no del tema: lo que dice de eso, con su verbo; con una palabra de pregunta primero, no', () => {
    expect(explainAsk('¿y eso se borra?')).toMatchObject({ facet: 'whatif', verb: 'borra' });
    expect(explainAsk('y la gente lo ve?')).toMatchObject({ facet: 'whatif', about: 'la gente lo ve', verb: 've' });
    expect(explainAsk('o sea que no sale sola?')).toMatchObject({ facet: 'whatif', verb: 'sale' });
    // (A «which» of it too, never a «what comes next»: «¿y después qué le llega?» is not a yes or no.)
    expect(explainAsk('y cuál versión queda?')).toMatchObject({ facet: 'whatif', verb: 'queda' });
    expect(explainAsk('¿y después qué le llega a la persona?')?.verb).toBeUndefined();
    expect(explainAsk('¿y cuándo contesta la persona?')).toBeNull();
    // (The verb itself, never a longer word that only starts like it.)
    expect(saysVerb('Nada se borra: queda archivado.', 'borra')).toBe(true);
    expect(saysVerb('Se queda en el borrador hasta que la publicas.', 'borra')).toBe(false);
  });

  it('«¿y yo qué hago ahí?» es lo de quien pregunta; un «¿qué hago?» solo es una pregunta suya', () => {
    expect(explainAsk('¿y yo qué hago ahí?')?.facet).toBe('mine');
    expect(explainAsk('y entonces qué sí puedo hacer')?.facet).toBe('mine');
    expect(explainAsk('¿qué hago?')).toBeNull();
  });

  it('«¿y X en qué se diferencia?» es qué es X', () => {
    expect(explainAsk('¿y la petición en qué se diferencia?')).toMatchObject({ facet: 'meaning', about: 'la peticion' });
    expect(explainAsk('¿en qué se diferencia una sugerencia?')).toMatchObject({ facet: 'meaning', about: 'una sugerencia' });
  });

  it('«¿y a quién le llega?» pregunta quién, nunca un sí o un no', () => {
    expect(explainAsk('¿y a quién le llega eso?')).toMatchObject({ facet: 'who' });
    expect(explainAsk('¿y a quién le llega eso?')?.verb).toBeUndefined();
    expect(explainAsk('¿y con quién lo hablo?')?.facet).toBe('who');
  });

  it('«¿y cómo lo dejo otra vez?» es cómo se recupera, como «¿y si lo quiero de vuelta?»; «¿cómo lo subo otra vez?» son los pasos', () => {
    for (const q of ['¿y cómo lo dejo otra vez?', '¿cómo lo recupero?', '¿y cómo lo vuelvo a poner?', 'y como la pongo de nuevo']) expect(explainAsk(q), q).toEqual({ facet: 'whatif', about: 'lo quiero de vuelta' });
    expect(explainAsk('¿y cómo lo subo otra vez?')?.facet).toBe('steps');
    // («De vuelta», «vuelve», «volver» y «desarchivar» son la misma familia de palabras.)
    expect(sentenceSaying('whatif', 'lo quiero de vuelta', 'Nada se pierde. Si te arrepientes, «Desarchivar» lo vuelve a poner.')).toBe('Si te arrepientes, «Desarchivar» lo vuelve a poner.');
    expect(sentenceSaying('whatif', 'despues la quiero de vuelta', 'Nada se pierde. Si te arrepientes, «Desarchivar» lo vuelve a poner.')).toBe('Si te arrepientes, «Desarchivar» lo vuelve a poner.');
  });

  it('un sí o un no con solo su verbo («¿se borra?») es del tema', () => {
    expect(explainAsk('¿se borra?')).toMatchObject({ facet: 'whatif', verb: 'borra' });
    expect(explainAsk('¿ya se pierde?')).toMatchObject({ facet: 'whatif', verb: 'pierde' });
    expect(explainAsk('¿se borra el evento?')).toBeNull();
  });

  it('con un evento nombrado no es ninguno de ellos (los pasos de la agenda contestan)', () => {
    for (const q of ['¿y se cancela el evento?', '¿y qué pasa con la feria?', '¿y la visita sale en la agenda?']) expect(explainAsk(q), q).toBeNull();
  });
});

beforeEach(resetHourly);

describe('360 sigue el tema con esos seguimientos (WF-C2)', () => {
  it('«… paso a paso» de un tema suyo, sin tutorial, da sus pasos; nunca la lista de tutoriales', async () => {
    const [r] = await thread('boss', ['¿cómo se programa una noticia de la web para que salga sola, paso a paso?']);
    expect(r.answer).toMatch(/paso a paso: 1\) /);
    expect(r.answer).toContain('«Programar»');
    expect(r.answer).not.toMatch(TUTORIAL_LIST);
  });

  it('«¿qué hago, paso a paso?» después de una respuesta: los pasos de esa tarea', async () => {
    const answers = await thread('boss', ['desaprobé el diseño de una pieza que ya estaba aprobada, ¿cómo lo marco?', '¿qué hago, paso a paso?']);
    expect(answers[1].answer).toMatch(/paso a paso: 1\) /);
    expect(answers[1].answer).toContain('«Diseño desaprobado»');
    expect(answers[1].answer).not.toMatch(TUTORIAL_LIST);
  });

  it('un sí o un no del tema: lo que el tema dice con ese verbo', async () => {
    const answers = await thread('admin', ['quiero apagar el área de alumbrado, ¿cómo lo hago?', '¿y se borran sus casos?']);
    expect(answers[1].answer).toMatch(/nada se borra/);
    expect(answers[1].answer).not.toMatch(/evento/);
  });

  it('«¿y yo qué hago ahí?» en Atención: el jefe lee, no atiende', async () => {
    const answers = await thread('boss', ['¿cómo atienden los casos que llegan por la web?', '¿y yo qué hago ahí?']);
    expect(answers[1].answer).toMatch(/\blees\b/);
    expect(answers[1].answer).toContain('«Cifras»');
    expect(answers[1].answer).not.toMatch(NOT_SURE);
  });

  it('«¿y X en qué se diferencia?» dice lo de X que dice la guía', async () => {
    const answers = await thread('boss', ['¿qué tipos de solicitudes puede mandar la gente?', '¿y la denuncia qué tiene de distinto?']);
    expect(answers[1].answer).toMatch(/[Cc]onfidencial|privada/);
    expect(distinct(answers)).toBe(true);
  });

  it('en Web: «¿y después?» sigue los pasos del tema y su flujo, y nunca dice dos veces lo mismo', async () => {
    const answers = await thread('boss', ['¿cómo saco de la web algo que publiqué?', '¿y eso lo borra?', '¿y si lo quiero de vuelta?', '¿y después?']);
    expect(answers[1].answer).not.toMatch(NOT_SURE);
    expect(distinct(answers), answers.map((a) => a.answer).join('\n')).toBe(true);
  });

  it('después de «Espera al jefe», lo que pasa entonces; «¿y después de enviarla?», el paso del jefe, sea del color que sea', async () => {
    const [, luego] = await thread('social', ['¿cómo mando una pieza a que la apruebe el jefe?', '¿y luego?']);
    expect(luego.answer).toMatch(/^Después: cuando el jefe la aprueba/);
    await resetHourly();
    const [, after] = await thread('social', ['ya corregí la pieza que el jefe me devolvió con cambios, ¿qué hago?', '¿y después de enviarla?']);
    expect(after.answer).toMatch(/^Después le toca al jefe/);
    expect(after.answer).not.toMatch(/evento/);
  });

  it('la vía que la persona nombró («una pieza roja») y lo que hace cada respuesta del jefe', async () => {
    const [, red] = await thread('social', ['mandé a aprobación una pieza roja', '¿y luego qué pasa?']);
    expect(red.answer).toMatch(/rojo en 30/);
    expect(red.answer).toMatch(/Si la aprueba, «Aprobar»; si no, «Pedir cambios»/);
    await resetHourly();
    const [, saved] = await thread('dispatch', ['¿cómo creo un evento nuevo?', '¿y después de guardarlo?']);
    expect(saved.answer).toMatch(/^Después le toca al jefe: .*Si lo acepta, «Aceptar»; si no, «Rechazar»/);
  });

  it('«¿y luego qué hago?» de una pantalla sigue el flujo: los pasos propios seguidos, nunca saltados, y luego el del otro', async () => {
    const answers = await thread('social', ['¿qué campos tiene un post nuevo?', '¿y luego qué hago?']);
    expect(answers[1].answer).toMatch(/^Después te toca a ti: arma el «Feed».* Luego, «Enviar a aprobación».* Luego le toca al jefe/);
    expect(answers[1].answer).not.toMatch(/Grabación/);
  });

  it('«¿y a quién le llega?» dice lo que la guía nombra de más, no la misma oración otra vez', async () => {
    const answers = await thread('boss', ['¿cada cuánto avisa la app de un caso quieto?', '¿y a quién le llega eso?']);
    expect(answers[1].answer).toMatch(/Si nadie lo tiene, a los responsables de su área/);
    expect(distinct(answers)).toBe(true);
  });

  it('«¿y cómo lo dejo otra vez?» de un evento cancelado: cómo vuelve a la agenda', async () => {
    const answers = await thread('dispatch', ['cancelé por error un evento', '¿y cómo lo dejo otra vez?']);
    expect(answers[1].answer).toContain('«Volver a la agenda»');
    expect(answers[1].answer).not.toMatch(/«Usar lo de él»|«Ponerle fecha»/);
    expect(distinct(answers)).toBe(true);
  });

  it('«¿se borra?» y «¿y si después la quiero de vuelta?» siguen el tema de la web', async () => {
    const answers = await thread('boss', ['¿cómo archivo una página de la web?', '¿se borra?', '¿y si después la quiero de vuelta?']);
    expect(answers[1].answer).toMatch(/nada se borra/);
    expect(answers[1].answer).not.toMatch(/evento/);
    expect(answers[2].answer).toContain('«Desarchivar»');
    expect(answers[2].answer).not.toMatch(NOT_SURE);
  });

  it('el camino de una obra nunca dice «Se sigue con el paso…»: dice el paso', async () => {
    const answers = await thread('dispatch', ['¿cómo le pongo la fecha a la visita de una obra?', '¿y después?', '¿y luego?']);
    for (const a of answers) expect(a.answer).not.toMatch(/sigue con el paso \d/);
    expect(distinct(answers)).toBe(true);
  });
});
