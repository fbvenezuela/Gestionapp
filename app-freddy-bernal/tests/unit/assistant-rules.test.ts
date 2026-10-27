// Round 4: the structural rules that replace phrase lists (docs/ASISTENTE.md).
// R2: the team's fichas and scripts are for how the team works, never about one event.
// R3: a notice that names an event only asks the team for something and says nothing of the event but
//     a deadline for the work; one that names none keeps its days and deadlines, with their real time.
// R4: an «aviso al equipo» goes to administración only (since 27/10/2026), with the event scrubbed out.
// R5: a placeholder never reaches a person raw. S6: the app checking the content is not «support».
// Round 5: a distinctive word of a visible title names its event (S1); «a» + a Name is a place (S4); the
// rare placeholder shapes (S6).
// Demo database (PGlite, invented data); only the session, Next's cache and the provider are faked.
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';

const state: { session: Session | null } = { session: null };
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => state.session),
}));

const actions = await import('@/lib/actions/assistant');
const admin = await import('@/lib/assistant/admin');
const { handleTurn } = await import('@/lib/assistant');
const { withSystem } = await import('@/lib/db');
const { parseChain } = await import('@/lib/assistant/providers');
const { EVENT_NAMED_MESSAGE, EVENT_WHEN_MESSAGE, noticeIssues, scrubTeamFicha, teachingProblem } = await import('@/lib/assistant/guard');
const { eventIsSubject } = await import('@/lib/assistant/events');
const { escalate } = await import('@/lib/assistant/escalate');
const { Placeholders, peopleWords, stripTokens } = await import('@/lib/assistant/titles');
const { filterOutput } = await import('@/lib/assistant/brain');
const { NOTICE_REMINDER } = await import('@/components/assistant/panel-core');

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: true, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const A = sessionOf('admin');
const LOCAL = { chain: [] };
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';
const userOf = (key: DemoUserKey) => DEMO_USERS.find((u) => u.key === key)!.id;

type Body = { messages: { role: string; content: string | null }[] };
function provider(answer: (n: number) => unknown) {
  const seen: Body[] = [];
  const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)) as Body);
    return new Response(JSON.stringify(answer(seen.length)), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const say = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const callTool = (name: string, args: unknown) => ({ choices: [{ message: { content: '', tool_calls: [{ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const draftsOf = (conversationId: string | null) => withSystem((sql) => sql.query<{ id: string; body: string }>(`select id, body from public.assistant_drafts where conversation_id = $1`, [conversationId]));
const makeDraft = (body: string) =>
  withSystem((sql) => sql.one<{ id: string }>(`insert into public.assistant_drafts (kind, created_by, summary, body, target) values ('aviso', $1, 'Aviso para Redes', $2, '{"role":"social"}'::jsonb) returning id`, [A.userId, body]));
const lastNotice = (key: DemoUserKey, kind: string) =>
  withSystem((sql) => sql.one<{ body: string }>(`select body from public.notifications where user_id = $1 and kind = $2 order by created_at desc limit 1`, [userOf(key), kind]));

// Two events the review used, visible to the admin (the demo's six are there too).
let eventIds: string[] = [];
beforeAll(async () => {
  eventIds = await withSystem(async (sql) => {
    const out: string[] = [];
    for (const t of ['Toma aérea Tariba', 'Feria de Pirineos']) out.push((await sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ($1, 'accepted', $2) returning id`, [t, A.userId]))!.id);
    return out;
  });
});
afterAll(async () => {
  await withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = any($1::uuid[])`, [eventIds]));
});
beforeEach(() => {
  state.session = A;
});

describe('R2: lo que se le enseña es cómo trabaja el equipo, nunca un evento', () => {
  it('fichas del equipo: rechaza las que nombran un evento (también por dos palabras de su título o un nombre suyo) o un día con su hora', async () => {
    for (const [k, why] of [
      [{ title: 'Toma aérea', body: 'Salimos el sábado a las 6 desde la plaza. Lleven el dron.' }, EVENT_WHEN_MESSAGE],
      [{ title: 'Lo del sábado', body: 'Llevar toldo, arranca a las 8.' }, EVENT_WHEN_MESSAGE],
      // «El finde» and «en un par de días» are a when, for every check (the shared time rules).
      [{ title: 'Pirineos', body: 'Arranca el finde. Llevar toldo.' }, EVENT_WHEN_MESSAGE],
      [{ title: 'Caravana', body: 'La caravana sale en un par de días.' }, EVENT_WHEN_MESSAGE],
      [{ title: 'Toldos', body: 'La feria es en el hotel Tamá. Llevar toldo.' }, EVENT_NAMED_MESSAGE],
      [{ title: 'Lo de la toma aérea', body: 'Llevar el dron con baterías.' }, EVENT_NAMED_MESSAGE],
    ] as const) {
      await expect(admin.saveKnowledge(A, k), k.title).rejects.toThrow(why);
    }
    // How the team works, events in general, or the hours of publishing: they stay.
    for (const k of [
      { title: 'Tomas con dron', body: 'Para volar el dron, revisa el viento y lleva baterías de repuesto.' },
      { title: 'Caravanas', body: 'En una caravana se graba desde el carro, con estabilizador.' },
      { title: 'Horas de los tweets', body: 'Los tweets del sábado salen a las 9:00 y a las 13:00.' },
    ]) expect(await admin.saveKnowledge(A, k), k.title).toMatchObject({ origin: 'equipo' });
  });

  it('guiones del equipo: lo mismo, en lo que dice 360 y en lo que pregunta la persona', async () => {
    for (const [i, why] of [
      [{ topic: 'Caravana', script: '[ASISTENTE]: La caravana sale en un par de días.' }, EVENT_WHEN_MESSAGE],
      [{ topic: 'Tariba', script: '[ASISTENTE]: Lo de Tariba va bien, falta el storyboard.' }, EVENT_NAMED_MESSAGE],
      [{ topic: 'Cómo va', script: 'Persona: ¿cómo va lo de Pirineos?\n[ASISTENTE]: Va bien.' }, EVENT_NAMED_MESSAGE],
      [{ topic: 'Toldo', script: '[ASISTENTE]: Lo del sábado arranca a las 8, lleva toldo.' }, EVENT_WHEN_MESSAGE],
    ] as const) {
      await expect(admin.saveScript(A, i), i.script).rejects.toThrow(why);
    }
    expect(await admin.saveScript(A, { topic: 'Proponer un evento', script: '[ASISTENTE]: Para proponer un evento, toca «Crear» → Nuevo evento.' })).toMatchObject({ origin: 'equipo' });
    // The same check, pure, without the titles: a name alone means nothing to whoever can't see it, but
    // «lo de…» is one event by another name for anyone.
    expect(teachingProblem({ said: ['[ASISTENTE]: Tariba va bien.'] })).toBeNull();
    expect(teachingProblem({ said: ['[ASISTENTE]: Lo de Tariba va bien.'] })).toBe(EVENT_NAMED_MESSAGE);
    // What «Así se contesta» leaves of a title is the scripts' hueco, not one event.
    expect(teachingProblem({ said: ['[ASISTENTE]: Lo de «[titulo]» va en ficha.'], asked: ['¿cómo va lo de [titulo]?'] })).toBeNull();
  });

  it('ronda 4b: fichas y guiones con el tiempo dicho sin nombrarlo, un lugar por su tira de mayúsculas o un evento que hay', async () => {
    for (const k of [
      { title: 'Viviendas', body: 'Llevar chalecos; el acto de entrega arranca en la mañanita.' },
      { title: 'Feria', body: 'En noviembre hay feria; lleven toldo y chalecos.' },
      { title: 'Plan del finde', body: 'El finde salimos tempranito para Alto Verde.' },
      { title: 'Alto Verde', body: 'Lleven el dron y el trípode, y la extensión larga.' },
      { title: 'Lo de la cancha', body: 'Lleven toldo y extensión.' },
      { title: 'Cafeteros', body: 'Con los de la zona alta arrancamos de madrugada.' },
      { title: 'Salida', body: 'Nos vamos de madrugada desde la gobernación.' },
      { title: 'Luz', body: 'En el hotel Tamá hay buena luz a las 5.' },
    ]) await expect(admin.saveKnowledge(A, k), k.title).rejects.toThrow(/Quita|quítale/);
    for (const script of [
      '[ASISTENTE]: El finde es lo de la cancha, lleva el dron y los chalecos.',
      'Persona: ¿qué llevo?\n[ASISTENTE]: Para Alto Verde lleva botas.',
      'Persona: ¿qué llevo a lo de la cancha?\n[ASISTENTE]: Lleva el toldo.',
    ]) await expect(admin.saveScript(A, { topic: 'Qué llevo', script }), script).rejects.toThrow(/Quita|quítale/);
    // How the team works still goes.
    expect(await admin.saveKnowledge(A, { title: 'Cómo se cubre un acto', body: 'Llega antes, ubica la tarima y graba planos abiertos.' })).toMatchObject({ origin: 'equipo' });
  });

  it('ronda 4b: si una ficha así ya estaba guardada, al proveedor no le llega su tiempo ni su lugar', async () => {
    const rows = [
      ['Viviendas', 'Llevar chalecos; el acto de entrega arranca en la mañanita.'],
      ['Feria', 'En noviembre hay feria; lleven toldo y chalecos.'],
      ['Plan del finde', 'El finde salimos tempranito para Alto Verde.'],
      ['Luz', 'En el hotel Tamá hay buena luz a las 5.'],
    ];
    const ids = await withSystem(async (sql) => {
      const out: string[] = [];
      for (const [title, body] of rows) out.push((await sql.one<{ id: string }>(`insert into public.assistant_knowledge (roles, title, body, tags, origin, created_by) values ('{camera}', $1, $2, '{chalecos}', 'equipo', $3) returning id`, [title, body, A.userId]))!.id);
      out.push((await sql.one<{ id: string }>(`insert into public.assistant_scripts (roles, topic, triggers, script, origin, created_by) values ('{camera}', 'chalecos', '{chalecos}', '[ASISTENTE]: El finde es lo de la cancha, lleva el dron y los chalecos.', 'equipo', $1) returning id`, [A.userId]))!.id);
      return out;
    });
    try {
      const p = provider(() => say('Lleva los chalecos.'));
      const r = await handleTurn(sessionOf('camera'), { question: '¿qué llevo, chalecos o el toldo?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(r.model).toBe('groq:llama-3.3-70b');
      const sys = String(p.seen[0].messages[0].content);
      expect(sys).toContain('Llevar chalecos');
      for (const leak of ['mañanita', 'finde', 'noviembre', 'tempranito', 'Alto Verde', 'Tamá', 'a las 5']) expect(sys, leak).not.toContain(leak);
    } finally {
      await withSystem(async (sql) => {
        await sql.query(`delete from public.assistant_knowledge where id = any($1::uuid[])`, [ids.slice(0, -1)]);
        await sql.query(`delete from public.assistant_scripts where id = $1`, [ids.at(-1)]);
      });
    }
  });

  it('en el prompt, por si algo pasó antes: una ficha del equipo con un día pierde días y horas', () => {
    const [title, body] = scrubTeamFicha('Lo del sábado', 'Llevar toldo, arranca a las 8.');
    expect(`${title} ${body}`).not.toMatch(/sábado|a las 8/);
    expect(scrubTeamFicha('Horas de los tweets', 'Salen a las 9:00.')).toEqual(['Horas de los tweets', 'Salen a las 9:00.']);
  });
});

// Round 4, S1: notices that named an event and told its day, hour or place in ways no rule saw.
const EVENT_NOTICES = [
  'la feria es el finde',
  'el acto arranca en 2 horas',
  'la feria arranca en la mañanita',
  'la feria es el veinticuatro',
  'la feria es en un par de días',
  'la feria es en noviembre',
  'el recorrido arranca en el puente La Quebrada',
  'la entrega es en el hotel Tamá',
  // What follows the event says more of it; getting ready for it is its hour.
  'suban las fotos de la feria del finde',
  'manden el video de la caravana por El Mirador',
  'suban el material de la entrega en el galpón de Los Pinos',
  'en el club Demócrata, suban las fotos de la feria',
  'tengan las cámaras listas antes de las 7 am para la caravana',
  'gracias por lo de Pirineos el treinta y uno',
  // Round 4b: something of the event before it or in another clause, a month alone, «hay», a place by
  // the run of its capitalised words.
  'este finde hay feria, tengan el material listo',
  'Tamá: la feria. Suban las fotos.',
  'Noviembre: feria. Revisen el material.',
  'para la feria: hotel Tamá. Suban las fotos.',
  'noviembre trae feria, suban las fotos',
  'suban las fotos de la feria, pinta para noviembre',
  'tengan las cámaras cargadas para el finde de la feria',
  'lleven el dron a Alto Verde el sábado',
  'Este finde hay feria: tengan el material listo.',
];

describe('R3: un aviso que nombra un evento solo le pide algo al equipo', () => {
  it('la revisión compartida: ninguno pasa, con los títulos de quien lo prepara', async () => {
    const titles = { events: ['Feria de Pirineos', 'Recorrido por la rehabilitación del puente La Quebrada', 'Entrega de la cancha techada de El Mirador'], pieces: [], places: ['Puente La Quebrada', 'Cancha comunal El Mirador', 'Casa comunal Alto Verde'] };
    for (const t of EVENT_NOTICES) expect(noticeIssues(t, titles), t).not.toEqual([]);
    // Every word counts, before and after the event: what is not the team's instruction says something of it.
    expect(noticeIssues('Tamá: la feria. Suban las fotos.', titles)).toEqual(['datos del evento']);
    expect(noticeIssues('lleven el dron a Alto Verde', titles)).toEqual(['el lugar', 'datos del evento']);
    // A team instruction about an event, with a deadline for the work, goes; so do its title's words,
    // the team's tools, a role, the boss and a count.
    for (const t of [
      'suban el material de la feria antes de las 3 pm',
      'revisen los copies de la Feria de Pirineos',
      'tengan el material de la feria para las 2 pm',
      'suban hoy las fotos de la jornada',
      'suban el material del puente antes de las 3 pm',
      'hay que subir las fotos de la entrega',
      'manden el video del recorrido a Despacho',
      'lleven el dron y las baterías a la feria',
      'recuerden pedir la frase al jefe para el video del acto',
      'revisen los 3 copies de la feria',
    ]) expect(noticeIssues(t, titles), t).toEqual([]);
  });

  it('cerebro de demostración, la herramienta del modelo y al confirmar: no sale ninguno', async () => {
    for (const t of EVENT_NOTICES) {
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([]);
      expect(r.answer, t).toMatch(/^Un aviso no puede llevar .*Si nombra un evento, solo le pide algo al equipo/);
      expect(await draftsOf(r.conversationId), t).toEqual([]);
    }
    for (const t of EVENT_NOTICES) {
      const p = provider((n) => (n === 1 ? callTool('preparar_aviso', { rol: 'social', texto: t }) : say('No lo pude preparar.')));
      const r = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(r.did, t).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae .*solo va en la Agenda/) }]);
      expect(await draftsOf(r.conversationId), t).toEqual([]);
    }
    const before = (await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_notice'`)))!.n;
    for (const t of EVENT_NOTICES) {
      const d = (await makeDraft(t))!;
      expect(await actions.confirmAssistantDraft({ id: d.id }), t).toMatchObject({ ok: false, error: expect.stringMatching(/^No se mandó: el aviso trae /) });
    }
    expect((await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_notice'`)))!.n).toBe(before);
  });

  it('un aviso que no nombra un evento lleva su plazo con la hora real hasta Redes (S4)', async () => {
    for (const t of ['manden las fotos esta tarde', 'cambien su contraseña esta semana', 'gracias por el trabajo de esta semana']) expect(noticeIssues(t), t).toEqual([]);
    for (const t of ['suban el material antes de las 3 pm', 'tienen hasta las 5 pm para subir el material', 'hay que subir la tanda de tweets hoy', 'aprueben las verdes antes del mediodía']) {
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([{ tool: 'preparar_aviso' }]);
      const [d] = await draftsOf(r.conversationId);
      expect(d.body, t).toBe(t);
      expect(await actions.confirmAssistantDraft({ id: d.id }), t).toMatchObject({ ok: true, data: { sent: 2 } });
      expect((await lastNotice('social', 'assistant_notice'))!.body, t).toBe(t);
    }
    // Contacts never go in a notice to a whole role (also said digit by digit); nor a day with an hour
    // that is not a deadline (also «el finde», «en la mañanita»).
    expect(noticeIssues('llamen al 0414-1234567 si falla la app')).toEqual(['los contactos']);
    expect(noticeIssues('si falla la app llamen al cero cuatro uno cuatro uno dos tres cuatro cinco seis siete')).toEqual(['los contactos']);
    expect(noticeIssues('este finde en la mañanita lleven baterías')).toEqual(['la fecha', 'la hora']);
    expect(noticeIssues('manden las fotos el finde')).toEqual([]);
    expect(noticeIssues('el sábado a las 6, lleven baterías')).toEqual(['el día', 'la hora']);
    expect(noticeIssues('suban todo antes del viernes a las 3 pm')).toEqual([]);
  });

  it('al confirmar, administración ve el recordatorio en el diálogo', () => {
    expect(NOTICE_REMINDER).toBe('Revisa que no diga el día, la hora ni el lugar de un evento.');
    const src = fs.readFileSync('src/app/(panel)/ajustes/asistente/panel-buttons.tsx', 'utf8');
    expect(src).toMatch(/\{NOTICE_REMINDER\}/);
  });
});

describe('R4: el aviso al equipo va solo a administración, con el evento limpio', () => {
  it('administración lee el motivo limpio; el jefe no recibe nada, ni de aprobaciones', async () => {
    const conv = async (key: DemoUserKey) => (await handleTurn(sessionOf(key), { question: 'hola' }, LOCAL)).conversationId!;
    expect((await escalate(await conv('social'), 'No le aprueban la pieza de lo de Pirineos del finde en el hotel Tamá.')).to).toEqual(['administración']);
    expect((await lastNotice('admin', 'assistant_escalation'))!.body).toMatch(/^Daniela Pernía necesita ayuda: No le aprueban la pieza de lo de Pirineos/);
    // By a placeholder the model invented, too.
    await escalate(await conv('social2'), 'No le aprueban la pieza de [[E9]].');
    expect((await lastNotice('admin', 'assistant_escalation'))!.body).toBe('Yorman Chacón necesita ayuda: No le aprueban la pieza de ese evento.');
    // An event's place by the run of its capitalised words: administración reads «ese lugar».
    await escalate(await conv('social'), 'Quiere que revisen la pieza de Alto Verde antes de que salga');
    expect((await lastNotice('admin', 'assistant_escalation'))!.body).toBe('Daniela Pernía necesita ayuda: Quiere que revisen la pieza de ese lugar antes de que salga');
    // About an approval and no event: administración reads it as it is; the boss gets no assistant noise.
    await escalate(await conv('camera'), 'No le aprueban la pieza: el copy está muy largo.');
    expect((await lastNotice('admin', 'assistant_escalation'))!.body).toBe('Kevin Sánchez necesita ayuda: No le aprueban la pieza: el copy está muy largo.');
    for (const key of ['boss', 'dispatch', 'social', 'politics'] as DemoUserKey[]) expect(await lastNotice(key, 'assistant_escalation'), key).toBeNull();
  });
});

describe('R5: una marca nunca le llega cruda a una persona', () => {
  it('restoreArgs: una marca desconocida es «ese evento» / «ese lugar»; restore quita una marca cortada al final', () => {
    const ph = new Placeholders({ events: ['Feria de Pirineos'], pieces: [], places: [] });
    ph.mask('la Feria de Pirineos');
    expect(ph.restoreArgs('{"motivo":"Pregunta por [[E7]] y por [[L2]] y por [[E1]]."}')).toBe('{"motivo":"Pregunta por ese evento y por ese lugar y por Feria de Pirineos."}');
    expect(ph.restore(filterOutput('El evento [[E1'))).toBe('El evento');
    expect(ph.restore('Va en ficha: [[P')).toBe('Va en ficha:');
    // One left open in the middle is read as its kind.
    expect(ph.restore('Texto con [[E1 en medio y [[L3 también')).toBe('Texto con ese evento en medio y ese lugar también');
    expect(ph.restoreArgs('{"motivo":"Pregunta por [[E1 y más"}')).toBe('{"motivo":"Pregunta por ese evento y más"}');
    expect(stripTokens('Pregunta por [[E7]], [L2] y [[X]]')).toBe('Pregunta por ese evento, ese lugar y eso');
    // An invented placeholder is not a loose number in a notice.
    expect(noticeIssues('Revisen el material de [[E7]].')).toEqual([]);
  });

  it('con modelo: el motivo con marcas inventadas llega a administración sin marcas; el aviso con una marca se prepara', async () => {
    const p = provider((n) => (n === 1 ? callTool('avisar_al_equipo', { motivo: 'Pregunta por [[E7]] y por [[L2]].' }) : say('Listo, ya le avisé al equipo.')));
    const r = await handleTurn(sessionOf('social'), { question: 'no me deja entrar, ayuda' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'avisar_al_equipo' }]);
    expect((await lastNotice('admin', 'assistant_escalation'))!.body).toBe('Daniela Pernía necesita ayuda: Pregunta por ese evento y por ese lugar.');
    const q = provider((n) => (n === 1 ? callTool('preparar_aviso', { rol: 'social', texto: 'Revisen el material de [[E7]].' }) : say('Listo, quedó preparado.')));
    const t = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: q.fetchImpl } });
    expect(t.did).toEqual([{ tool: 'preparar_aviso' }]);
    expect((await draftsOf(t.conversationId)).map((d) => d.body)).toEqual(['Revisen el material de ese evento.']);
  });
});

describe('S6: un error de la app sobre el contenido no es soporte', () => {
  it('«me salió un error que dice que el copy es muy largo» lo contesta una ficha; «tengo un problema que no me deja entrar» sigue siendo soporte', async () => {
    const SUPPORT = /No hay teléfono de soporte/;
    expect((await handleTurn(sessionOf('social'), { question: 'me salió un error que dice que el copy es muy largo' }, LOCAL)).answer).not.toMatch(SUPPORT);
    expect((await handleTurn(sessionOf('social'), { question: 'tengo un problema que no me deja entrar' }, LOCAL)).answer).toMatch(SUPPORT);
  });
});

describe('ronda 5, S1: una palabra propia de un título visible nombra su evento', () => {
  const titles = {
    events: ['Entrega de la cancha techada de El Mirador', 'Recorrido por la rehabilitación del puente La Quebrada', 'Jornada de salud en la escuela Los Andes', 'Entrega de viviendas en el urbanismo Nuevo Amanecer', 'Feria de emprendedores en la plaza central'],
    pieces: [],
    places: ['Cancha comunal El Mirador', 'Puente La Quebrada', 'Escuela Los Andes', 'Urbanismo Nuevo Amanecer', 'Plaza central'],
  };

  it('también como lo que pasa: «la cancha es…», «el puente arranca…» (sin palabras de tiempo nuevas)', () => {
    expect(eventIsSubject('La cancha es en semana santa; lleven toldo.', titles)).toBe(true);
    expect(eventIsSubject('El puente arranca al rato.', titles)).toBe(true);
    expect(eventIsSubject('Arranca la cancha.', titles)).toBe(true);
    // Not after «de»: the material of the cancha is the work; and only for whoever can see that title.
    expect(eventIsSubject('Las fotos de la cancha son buenas.', titles)).toBe(false);
    expect(eventIsSubject('La cancha es en semana santa.')).toBe(false);
  });

  it('R2: no se enseña (ficha y guion del equipo)', async () => {
    for (const k of [
      { title: 'Cancha', body: 'La cancha es en semana santa; lleven toldo y chalecos.' },
      { title: 'Viviendas', body: 'Las viviendas son el día de la madre; lleven el dron.' },
    ]) await expect(admin.saveKnowledge(A, k), k.title).rejects.toThrow(EVENT_NAMED_MESSAGE);
    await expect(admin.saveScript(A, { topic: 'Qué llevo', script: '[ASISTENTE]: La cancha es en semana santa, lleva el dron.' })).rejects.toThrow(EVENT_NAMED_MESSAGE);
    expect(teachingProblem({ said: ['El puente arranca al rato.'], titles })).toBe(EVENT_NAMED_MESSAGE);
  });

  it('R3: el aviso que lo nombra así no dice nada del evento; ni el cerebro de demostración ni el modelo lo preparan', async () => {
    for (const t of ['la cancha es en semana santa, tengan el material listo', 'el puente arranca al rato, tengan las cámaras cargadas', 'las viviendas son el día de la madre, suban las fotos']) {
      expect(noticeIssues(t, titles), t).toContain('datos del evento');
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([]);
      expect(await draftsOf(r.conversationId), t).toEqual([]);
    }
    const p = provider((n) => (n === 1 ? callTool('preparar_aviso', { rol: 'social', texto: 'La cancha es en semana santa: tengan el material listo.' }) : say('No lo pude preparar.')));
    const r = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae datos del evento/) }]);
    // A team instruction that names it so still goes («de la cancha» alone is a landmark, a place: «del puente» is not).
    expect(noticeIssues('suban las fotos del puente antes de las 3 pm', titles)).toEqual([]);
  });

  it('R4: va solo a administración (que sí ve la agenda); el jefe no recibe nada', async () => {
    const conv = async (key: DemoUserKey) => (await handleTurn(sessionOf(key), { question: 'hola' }, LOCAL)).conversationId!;
    for (const motivo of ['Dice que la cancha arranca al rato y la pieza no está aprobada', 'Quiere que revisen la pieza; el puente es en semana santa']) {
      expect((await escalate(await conv('social'), motivo)).to, motivo).toEqual(['administración']);
      expect((await lastNotice('admin', 'assistant_escalation'))!.body, motivo).toMatch(/^Daniela Pernía necesita ayuda: /);
      expect(await lastNotice('boss', 'assistant_escalation'), motivo).toBeNull();
    }
  });
});

describe('ronda 6, V1: la palabra propia de un título hecha más chiquita o más grande también lo nombra', () => {
  const titles = {
    events: ['Entrega de la cancha techada de El Mirador', 'Recorrido por la rehabilitación del puente La Quebrada', 'Jornada de salud en la escuela Los Andes', 'Entrega de viviendas en el urbanismo Nuevo Amanecer'],
    pieces: [],
    places: ['Cancha comunal El Mirador', 'Puente La Quebrada', 'Escuela Los Andes', 'Urbanismo Nuevo Amanecer'],
  };

  it('R2: no se enseña (ficha y guion)', async () => {
    for (const k of [
      { title: 'Canchita', body: 'La canchita es en semana santa; lleven toldo y chalecos.' },
      { title: 'Puentecito', body: 'El puentecito arranca al rato; lleven chalecos.' },
      { title: 'Toldo', body: 'La escuelita es el día de la madre; lleven toldo.' },
    ]) await expect(admin.saveKnowledge(A, k), k.title).rejects.toThrow(EVENT_NAMED_MESSAGE);
    await expect(admin.saveScript(A, { topic: 'Qué llevo', script: '[ASISTENTE]: La canchita es en semana santa, lleva el dron y los chalecos.' })).rejects.toThrow(EVENT_NAMED_MESSAGE);
    expect(eventIsSubject('El puentecito arranca al rato.', titles)).toBe(true);
    expect(eventIsSubject('Arranca la canchita.', titles)).toBe(true);
  });

  it('R3: el aviso no sale por ningún camino; uno que solo pide algo al equipo sí', async () => {
    const said = ['la canchita es en semana santa, tengan el material listo', 'tengan las cámaras cargadas, el puentecito arranca al rato', 'la escuelita es el día de la madre, suban las fotos'];
    for (const t of said) {
      expect(noticeIssues(t, titles), t).toContain('datos del evento');
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([]);
      expect(await draftsOf(r.conversationId), t).toEqual([]);
      const d = (await makeDraft(t))!;
      expect(await actions.confirmAssistantDraft({ id: d.id }), t).toMatchObject({ ok: false, error: expect.stringMatching(/^No se mandó: el aviso trae /) });
    }
    const p = provider((n) => (n === 1 ? callTool('preparar_aviso', { rol: 'social', texto: 'La canchita es en semana santa: tengan el material listo.' }) : say('No lo pude preparar.')));
    const r = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae datos del evento/) }]);
    // Its own word, made smaller, is the event's name in the instruction.
    expect(noticeIssues('suban las fotos del puentecito antes de las 3 pm', titles)).toEqual([]);
  });

  it('R4: va solo a administración (que sí ve la agenda); el jefe no recibe nada', async () => {
    const conv = async () => (await handleTurn(sessionOf('social'), { question: 'hola' }, LOCAL)).conversationId!;
    for (const motivo of ['La pieza de la canchita no está aprobada y arranca al rato', 'La pieza del puentecito: es en semana santa', 'La pieza no está aprobada y la escuelita es el día de la madre']) {
      expect((await escalate(await conv(), motivo)).to, motivo).toEqual(['administración']);
      expect((await lastNotice('admin', 'assistant_escalation'))!.body, motivo).toMatch(/^Daniela Pernía necesita ayuda: /);
      expect(await lastNotice('boss', 'assistant_escalation'), motivo).toBeNull();
    }
  });
});

describe('ronda 7, A1: la palabra propia por su raíz («-sito», «-itico», «-ón», el otro género) también lo nombra', () => {
  // Round 8: and the root spelled as it sounds made smaller («finquita», «bodeguita», «banquito», «estadito»):
  // four more events, visible to the admin and to Redes while this block runs.
  const SPELLED = ['Visita a la finca cafetalera', 'Visita a la bodega del sector', 'Entrega del banco de leche', 'Reinauguración del estadio'];
  const titles = {
    events: ['Entrega de la cancha techada de El Mirador', 'Recorrido por la rehabilitación del puente La Quebrada', 'Jornada de salud en la escuela Los Andes', 'Reunión con productores de café de la zona alta', ...SPELLED],
    pieces: [],
    places: ['Cancha comunal El Mirador', 'Puente La Quebrada', 'Escuela Los Andes', 'Casa comunal Alto Verde'],
  };
  let spelledIds: string[] = [];
  beforeAll(async () => {
    spelledIds = await withSystem(async (sql) => {
      const out: string[] = [];
      for (const t of SPELLED) out.push((await sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ($1, 'accepted', $2) returning id`, [t, A.userId]))!.id);
      return out;
    });
  });
  afterAll(async () => {
    await withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = any($1::uuid[])`, [spelledIds]));
  });

  it('R1: la pregunta no llega al proveedor (ronda 8)', async () => {
    for (const q of ['la finquita es en semana santa, ¿qué copy hago?', 'la bodeguita es en semana santa, ¿qué copy hago?', 'el banquito es en semana santa, ¿qué copy hago?', 'el estadito es en semana santa, ¿qué copy hago?']) {
      const p = provider(() => say('No debería llegar aquí.'));
      const r = await handleTurn(sessionOf('social'), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(p.fetchImpl, q).not.toHaveBeenCalled();
      expect(r.model, q).toBe('local');
    }
  });

  it('R2: no se enseña (ficha y guion)', async () => {
    for (const k of [
      { title: 'Puentesito', body: 'El puentesito es en semana santa; lleven toldo y chalecos.' },
      { title: 'Canchitica', body: 'La canchitica arranca al rato; lleven chalecos.' },
      { title: 'Canchón', body: 'El canchón es el día de la madre; lleven el dron.' },
      { title: 'Toldo', body: 'El techado es en semana santa; lleven toldo.' },
      { title: 'Finquita', body: 'La finquita es en semana santa; lleven toldo y chalecos.' },
      { title: 'Bodeguita', body: 'La bodeguita arranca al rato; lleven chalecos.' },
      { title: 'Banquito', body: 'El banquito es el día de la madre; lleven el dron.' },
      { title: 'Estadito', body: 'El estadito es en semana santa; lleven toldo.' },
    ]) await expect(admin.saveKnowledge(A, k), k.title).rejects.toThrow(EVENT_NAMED_MESSAGE);
    await expect(admin.saveScript(A, { topic: 'Qué llevo', script: '[ASISTENTE]: El puentesito es en semana santa, lleva el dron y los chalecos.' })).rejects.toThrow(EVENT_NAMED_MESSAGE);
    for (const t of ['El puentesito es en semana santa.', 'La escuelitica es el día de la madre.', 'Las productoras llegan al rato.', 'El café es en semana santa.', 'El cafecito es en semana santa.', 'La finquita es en semana santa.', 'La bodeguita es en semana santa.', 'El banquito es en semana santa.', 'El estadito es en semana santa.']) {
      expect(eventIsSubject(t, titles), t).toBe(true);
      expect(teachingProblem({ said: [t], titles }), t).toBe(EVENT_NAMED_MESSAGE);
    }
    // How the team works still goes: «la toma» is a shot, «saludos» no form of «salud».
    const more = { ...titles, events: [...titles.events, 'Toma aérea Tariba'] };
    for (const t of ['La toma es vertical si es para reels.', 'Saludos: el copy va con la fórmula del día.']) expect(teachingProblem({ said: [t], titles: more }), t).toBeNull();
  });

  it('R3: el aviso no sale por ningún camino', async () => {
    const said = [
      'el puentesito es en semana santa, tengan el material listo',
      'la canchitica es en semana santa, tengan el material listo',
      'el canchón arranca ahorita, tengan las cámaras listas',
      'el techado es en semana santa, tengan el material listo',
      'Suban las fotos del puentesito en semana santa',
      'la finquita es en semana santa, tengan el material listo',
      'la bodeguita es en semana santa, tengan el material listo',
      'el banquito arranca ahorita, tengan las cámaras listas',
      'el estadito es en semana santa, tengan el material listo',
    ];
    for (const t of said) {
      expect(noticeIssues(t, titles), t).toContain('datos del evento');
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([]);
      const d = (await makeDraft(t))!;
      expect(await actions.confirmAssistantDraft({ id: d.id }), t).toMatchObject({ ok: false, error: expect.stringMatching(/^No se mandó: el aviso trae /) });
    }
    const p = provider((n) => (n === 1 ? callTool('preparar_aviso', { rol: 'social', texto: 'El puentesito es en semana santa: tengan el material listo.' }) : say('No lo pude preparar.')));
    const r = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae datos del evento/) }]);
    // Its own word, in another form, is the event's name in the instruction.
    expect(noticeIssues('suban las fotos del puentesito antes de las 3 pm', titles)).toEqual([]);
  });

  it('R4: va solo a administración (que sí ve la agenda); el jefe no recibe nada', async () => {
    const conv = async () => (await handleTurn(sessionOf('social'), { question: 'hola' }, LOCAL)).conversationId!;
    for (const motivo of [
      'La pieza del puentesito no está aprobada y arranca al rato',
      'La pieza de la canchitica no está aprobada y es en semana santa',
      'La pieza no está aprobada y el canchón es el día de la madre',
      'La pieza no está aprobada y el techado es en semana santa',
      'La pieza de la finquita no está aprobada y es en semana santa',
      'La pieza de la bodeguita no está aprobada y es en semana santa',
      'La pieza del banquito no está aprobada y es en semana santa',
      'La pieza no está aprobada y el estadito es en semana santa',
    ]) {
      expect((await escalate(await conv(), motivo)).to, motivo).toEqual(['administración']);
      expect((await lastNotice('admin', 'assistant_escalation'))!.body, motivo).toMatch(/^Daniela Pernía necesita ayuda: /);
      expect(await lastNotice('boss', 'assistant_escalation'), motivo).toBeNull();
    }
  });
});

describe('ronda 7, A5 y A6: un apellido que es un lugar no es alguien; «al rato» junto a un evento es su hora', () => {
  const titles = { events: ['Entrega de la cancha techada de El Mirador', 'Recorrido por la rehabilitación del puente La Quebrada'], pieces: [], places: ['Cancha comunal El Mirador', 'Puente La Quebrada'] };

  it('A5: del equipo cuenta el nombre, no el apellido («a Rubio» es un lugar)', () => {
    const people = peopleWords(['Juan Rubio', 'María Cárdenas', 'Kevin Sánchez']);
    expect(people).toEqual(['juan', 'maria', 'kevin']);
    const withPeople = { ...titles, people };
    for (const t of ['mañana lleven el dron a Rubio', 'mañana lleven el dron a Cárdenas']) expect(noticeIssues(t, withPeople), t).toContain('el lugar');
    expect(noticeIssues('manden las fotos a Juan', withPeople)).toEqual([]);
  });

  it('A6: «al rato», «ya mismo» junto al evento dicen cuándo es; para lo que se entrega son un plazo', async () => {
    for (const t of ['Tengan todo listo para la cancha al rato', 'Tengan las cámaras listas para la cancha ya mismo', 'tengan las cámaras listas, el puente arranca dentro de poco']) {
      expect(noticeIssues(t, titles), t).toContain('la hora');
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${t}` }, LOCAL);
      expect(r.did, t).toEqual([]);
    }
    for (const t of ['suban las fotos del puente al rato', 'manden el video del puente ya mismo', 'tienen 24 h para subir el material del puente']) expect(noticeIssues(t, titles), t).toEqual([]);
  });
});

describe('ronda 5, S4: «a» + un nombre es un lugar; en un aviso con evento, solo las palabras del título que nombra', () => {
  const titles = { events: ['Feria de emprendedores en la plaza central', 'Jornada de salud en la escuela Los Andes'], pieces: [], places: ['Plaza central', 'Escuela Los Andes'], people: ['kevin', 'sanchez', 'daniela'] };

  it('en el aviso', () => {
    expect(noticeIssues('mañana lleven el dron a Táriba', titles)).toEqual(['el día', 'el lugar', 'datos del evento']);
    // Someone of the team is no place.
    expect(noticeIssues('manden las fotos a Kevin', titles)).toEqual([]);
    expect(noticeIssues('manden el video del recorrido a Despacho', titles)).toEqual([]);
    // An hour something happens at is not a deadline; the work handed in at an hour is.
    expect(noticeIssues('a las 6 lleven el dron', titles)).toEqual(['la hora']);
    expect(noticeIssues('suban el material a las 3 pm', titles)).toEqual([]);
    // Every sentence that names an event asks the team for something; a lone number word is an hour.
    expect(noticeIssues('Suban las fotos de la feria. Escuela.', titles)).toContain('datos del evento');
    expect(noticeIssues('Suban las fotos de la feria, ocho.', titles)).toContain('datos del evento');
    expect(noticeIssues('revisen los copies de cuatro piezas de la feria', titles)).toEqual([]);
    // The words of a title it does name still go.
    expect(noticeIssues('suban las fotos de la jornada de salud', titles)).toEqual([]);
  });

  it('en el motivo de un aviso al equipo: solo administración lo lee, con «[direccion]»', async () => {
    const conv = (await handleTurn(sessionOf('social2'), { question: 'hola' }, LOCAL)).conversationId!;
    await escalate(conv, 'Pide que revisen la pieza antes de llevar el dron a Táriba');
    expect(await lastNotice('boss', 'assistant_escalation')).toBeNull();
    const forAdmin = (await lastNotice('admin', 'assistant_escalation'))!.body;
    expect(forAdmin).not.toContain('Táriba');
    expect(forAdmin).toContain('a [direccion]');
  });
});

describe('ronda 5, S6: las formas raras de una marca tampoco llegan crudas', () => {
  it('corchetes anchos, un corchete de más, sin abrir', () => {
    const ph = new Placeholders({ events: ['Feria de Pirineos'], pieces: [], places: [] });
    ph.mask('la Feria de Pirineos');
    for (const [t, restored, stripped] of [
      ['Ver ［［E1］］', 'Ver «Feria de Pirineos»', 'Ver ese evento'],
      ['Ver [[E１]]', 'Ver «Feria de Pirineos»', 'Ver ese evento'],
      ['Ver [[E1]]]', 'Ver «Feria de Pirineos»', 'Ver ese evento'],
      ['Ver [[[E1]]]', 'Ver «Feria de Pirineos»', 'Ver ese evento'],
      ['Ver E1]]', 'Ver ese evento', 'Ver ese evento'],
      ['Ver ［L2］', 'Ver ese lugar', 'Ver ese lugar'],
    ]) {
      expect(ph.restore(t), t).toBe(restored);
      expect(stripTokens(t), t).toBe(stripped);
    }
  });
});
