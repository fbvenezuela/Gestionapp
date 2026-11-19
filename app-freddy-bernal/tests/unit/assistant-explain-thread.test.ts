// 360 explains through a whole conversation (WF-C2, design §4(c)): the topic of the thread is the entry that answered its
// last content turn, and it stays across follow-ups (go_to.entry; its cursor walks the steps). «Paso a paso» gives the
// topic's steps, never the list of the tutorials; «¿y después?» at the end of a task goes to the next step of its flow,
// done by another role, and the one that fits who asks («¿Lo creó el jefe?»); «¿y después quién lo publica?» goes to the
// step where someone does it; «¿por qué?» gives the guide's reason; «no entendí lo de X» and «¿y si…?» say the topic's
// part about X and are never an event lookup when no event is named; an answer written for the follow-up wins when it
// says it better. In a thread 360 never says the same text twice, and the explain hook never answers after a turn about
// an event. Through the demo brain on the demo database, as the demo users; threads written for this file.
import { describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn, type TurnResult } from '@/lib/assistant';
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
const EXPLAINED = /Lo que dice es esto|Lo que sé es esto|La guía no da el porqué|De eso no tengo el porqué|paso a paso: 1\)|¿Sigo\?|^Es el paso \d+:|^Después(?::| te toca a ti:| le toca a )|^Primero: /;
const TUTORIAL_LIST = /Puedo mostrarte, paso a paso/;
const NO_EVENT = /No encontré ningún evento/;

beforeEach(resetHourly);

describe('360 explica en toda la conversación (WF-C2)', () => {
  it('«paso a paso» de un tema: sus pasos (la tarea que se preguntó), nunca la lista de tutoriales; el tema queda guardado', async () => {
    const { answers, conversationId } = await thread('social', ['oye, ¿cómo se hace el storyboard de un evento?', 'paso a paso por favor']);
    expect(answers[1].answer).toMatch(/^Armar el storyboard, paso a paso: 1\) /);
    expect(answers[1].answer).toContain('«Guardar storyboard»');
    expect(answers[1].answer).not.toMatch(TUTORIAL_LIST);
    expect(await savedGoTo(conversationId)).toMatchObject({ entry: 'redes:paso-a-paso:storyboard' });
    await resetHourly();
    // A screen whose tutorial several tasks share: the one asked about.
    const pub = (await thread('social', ['¿cómo publico en las redes una pieza que ya aprobaron?', 'por pasos'])).answers[1];
    expect(pub.answer).toMatch(/^Publicar a mano, paso a paso: 1\) /);
    expect(pub.answer).not.toMatch(TUTORIAL_LIST);
  });

  it('pasos cortos van juntos; los largos, de a tres con «¿Sigo?», y «sigue» camina el mismo tema sin repetir', async () => {
    const short = (await thread('boss', ['¿cómo decido un evento que me propuso el despacho?', 'por pasos'])).answers[1];
    expect(short.answer).toMatch(/1\) .*«Aceptar» o «Rechazar»/);
    expect(short.answer).not.toMatch(/¿Sigo\?/);
    await resetHourly();
    const { answers, conversationId } = await thread('boss', ['¿cómo apruebo una pieza que vino en rojo?', 'por pasos', 'sigue']);
    expect(answers[1].answer).toMatch(/1\) .* 3\) .*¿Sigo\?$/);
    expect(answers[2].answer).toMatch(/^4\) /);
    expect((await savedGoTo(conversationId))?.entry).toBe('jefe:paso-a-paso:aprobar-pieza');
    expect(new Set(answers.map((a) => plain(a.answer))).size).toBe(answers.length);
  });

  it('«¿y después?» al final de la tarea: lo que pasa por su salida y el paso de su flujo que hace otro rol, el que va con quien pregunta', async () => {
    // The despacho's event waits for the boss («Por decidir», «Tu decisión»); only the boss's own is born accepted.
    const desp = (await thread('dispatch', ['¿cómo meto un evento nuevo en la agenda?', '¿y después?'])).answers[1];
    expect(desp.answer).toMatch(/jefe/);
    expect(desp.answer).toMatch(/«Por decidir»|«Tu decisión»/);
    expect(desp.answer).not.toMatch(/«Aceptado»/);
    await resetHourly();
    const pol = await thread('politics', ['¿cómo cargo un reporte nuevo de una comunidad?', '¿y luego qué pasa?', '¿y después?']);
    expect(pol.answers[1].answer).toMatch(/jefe o (?:al |el )?despacho|«Por ponerle fecha»/);
    expect(pol.answers[2].answer).not.toBe(pol.answers[1].answer);
    expect(pol.answers[2].answer).not.toMatch(/^Ahí termina/);
  });

  it('«¿y después quién los publica?»: el paso del flujo donde alguien lo hace', async () => {
    const r = (await thread('boss', ['¿cómo se aprueban los tweets de la semana?', '¿y después quién los publica?'])).answers[1];
    expect(r.answer).toMatch(/^Después le toca a Redes: /);
    expect(r.answer).toContain('«Ya lo publiqué»');
  });

  it('«¿por qué?» da la razón que da la guía, nunca una línea de rol', async () => {
    const r = (await thread('boss', ['¿cómo apruebo de un toque las piezas verdes?', '¿y por qué van todas juntas?'])).answers[1];
    expect(r.answer).toMatch(/^Porque /);
    expect(r.answer).not.toMatch(/^Solo el jefe/);
  });

  it('«¿y si…?» dice lo que el tema dice que pasa; «esa visita» es la del tema, nunca una búsqueda de evento', async () => {
    const { answers } = await thread('dispatch', ['¿cómo le pongo fecha a la ficha de una obra?', '¿y si esa visita no va?']);
    expect(answers[1].answer).toContain('«No va»');
    expect(answers[1].answer).not.toMatch(NO_EVENT);
    expect(answers[1].did.map((d) => d.tool)).not.toContain('buscar_evento');
    await resetHourly();
    const none = (await thread('social', ['¿cómo programo una pieza para publicarla?', '¿y si no tengo ninguna pieza aprobada?'])).answers[1];
    expect(none.answer).toMatch(/aprueba el jefe|sin aprobar/);
    expect(none.answer).not.toMatch(NO_EVENT);
  });

  it('una respuesta escrita para el seguimiento gana cuando lo dice mejor', async () => {
    const r = (await thread('politics', ['¿cómo le doy seguimiento a un reporte?', '¿y si me equivoqué escribiendo la nota?'])).answers[1];
    expect(r.answer).toMatch(/otra nota/);
    expect(r.answer).not.toMatch(/Mensajes/);
  });

  it('en una conversación larga nunca dice dos veces lo mismo', async () => {
    const { answers } = await thread('social', ['¿cómo armo el feed de este mes?', 'no entendí', 'dame un ejemplo', 'paso a paso', 'sigue', '¿y después?', '¿y para qué sirve eso?']);
    const said = answers.map((a) => plain(a.answer));
    expect(new Set(said).size, said.join('\n')).toBe(said.length);
  });

  it('el paso E nunca contesta después de una pregunta sobre un evento', async () => {
    for (const [key, qs] of [
      ['boss', ['¿cuándo es la feria de emprendedores?', 'no entendí']],
      ['dispatch', ['¿a qué hora sale la caravana al urbanismo?', '¿y por qué?']],
      ['social', ['¿dónde queda la reunión con los productores de café?', 'paso a paso']],
    ] as [DemoUserKey, string[]][]) {
      await resetHourly();
      const { answers } = await thread(key, qs);
      expect(answers[1].answer, qs.join(' → ')).not.toMatch(EXPLAINED);
    }
  });

  it('sin tema, «paso a paso» sigue siendo la lista de tutoriales', async () => {
    const r = (await thread('camera', ['paso a paso'])).answers[0];
    expect(r.answer).toMatch(TUTORIAL_LIST);
  });
});
