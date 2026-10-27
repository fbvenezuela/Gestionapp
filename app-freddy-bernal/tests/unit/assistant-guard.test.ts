// What 360 prepares (notices to a whole role) and what it is taught (scripts and fichas) never carry
// an event's date, time, day, place or contacts, in any way of writing them that is detected: the
// same check in both brains, in the tool and when administración confirms. Plus the demo brain's
// refusal without the title's hour (S4), its support answers (S10) and the panel's labels (S11).
// Demo database (PGlite, invented data); only the session, Next's cache and the provider are faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const { noticeIssues, scrubTeamFicha, teachingProblem } = await import('@/lib/assistant/guard');
const { FACTORY_KNOWLEDGE, FACTORY_SCRIPTS } = await import('@/lib/assistant/config');
const { modelLabel } = await import('@/components/assistant/panel-core');

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: true, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const A = sessionOf('admin');
const ADMIN_ID = A.userId;
const LOCAL = { chain: [] };
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';

type Body = { messages: { role: string; content: string | null }[] };
function fakeProvider(answer: (n: number) => unknown) {
  const seen: Body[] = [];
  const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)) as Body);
    return new Response(JSON.stringify(answer(seen.length)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const say = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const callTool = (name: string, args: unknown) => ({
  choices: [{ message: { content: '', tool_calls: [{ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

beforeEach(() => {
  state.session = A;
});

async function addEvent(title: string): Promise<string> {
  return (await withSystem((sql) => sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ($1, 'accepted', $2) returning id`, [title, ADMIN_ID])))!.id;
}
const dropEvent = (id: string) => withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [id]));
const draftsOf = (conversationId: string | null) => withSystem((sql) => sql.query<{ body: string }>(`select body from public.assistant_drafts where conversation_id = $1`, [conversationId]));
const userOf = (key: DemoUserKey) => DEMO_USERS.find((u) => u.key === key)!.id;

describe('avisos preparados por 360 (S3): la misma revisión en los dos cerebros y al confirmar', () => {
  it('la revisión compartida ve la fecha, el día, la hora, el lugar y los contactos, escritos como sea', () => {
    const D = 'datos del evento';
    expect(noticeIssues('Equipo: la feria de Pirineos es pasado mañana al lado de la plaza Bolívar, lleguen temprano.')).toEqual(['el día', 'la hora', 'el lugar', D]);
    expect(noticeIssues('Acto del 1ro de noviembre, de 7 a 9, qta. Las Flores. Contacto 3561234.')).toEqual(['la fecha', 'la hora', 'el lugar', 'los contactos', D]);
    expect(noticeIssues('la feria de Pirineos: 9,30, al lado de la plaza Bolívar')).toEqual(['la hora', 'el lugar', D]);
    expect(noticeIssues('la caravana del 1ro de noviembre sale de la parroquia La Concordia')).toEqual(['la fecha', 'el lugar', D]);
    // Naming the event by its place says where it is.
    expect(noticeIssues('el acto de la plaza Bolívar arranca 12 m')).toEqual(['la hora', 'el lugar', D]);
    // About an event, with or without an event word (an hour with something happening is one).
    expect(noticeIssues('la toma Tariba es 9.30')).toEqual(['la hora', D]);
    expect(noticeIssues('revisen la Toma aérea Tariba 9.30', ['Toma aérea Tariba 9.30'])).toEqual(['la hora', D]);
    // A notice that names no event keeps its days: they are the team's (round 4).
    expect(noticeIssues('hoy cierra la tanda de tweets')).toEqual([]);
    // A place by its name with something happening is an event's, whoever names it.
    expect(noticeIssues('Equipo: lo de Tariba es en Pueblo Nuevo')).toEqual(['el lugar', D]);
    expect(noticeIssues('Equipo: lo de Tariba es en Pueblo Nuevo', ['Toma aérea Tariba'])).toEqual(['el lugar', D]);
    // Every way of writing it that got through (round 3): assistant-notices.test.ts.
    // A deadline or a day for the team's work is not the event's; nor is an ordinary notice, a count or a network.
    for (const ok of [
      'suban el material de la feria antes de las 3 pm',
      'suban el material de la feria antes del viernes',
      'hoy suben el material de la entrega',
      'suban hoy las fotos de la jornada',
      'mañana hay que subir el material de la entrega',
      'tienen 24 h para subir el material de la feria',
      'revisen los copies antes de las 3 pm',
      'revisen los 3 copies de la feria',
      'suban las 2 piezas de la caravana',
      'revisen los copies en Instagram del acto',
    ]) expect(noticeIssues(ok), ok).toEqual([]);
    // …but only right next to the team's verb: the event's day around it still counts.
    expect(noticeIssues('suban hoy, la feria es mañana')).toEqual(['el día', D]);
    expect(noticeIssues('la feria de mañana suban fotos')).toEqual(['el día', D]);
  });

  it('cerebro de demostración: no prepara ninguno de los avisos que se colaban', async () => {
    for (const q of [
      'prepara un aviso a redes que la feria de Pirineos: 9,30, al lado de la plaza Bolívar',
      'prepara un aviso a redes que la caravana del 1ro de noviembre sale de la parroquia La Concordia',
      'prepara un aviso a redes que el acto de la plaza Bolívar arranca 12 m',
      'prepara un aviso a redes que el acto es pasado mañana',
    ]) {
      const r = await handleTurn(A, { question: q }, LOCAL);
      expect(r.did, q).toEqual([]);
      expect(r.answer, q).toMatch(/no puede llevar la fecha, la hora/);
      expect(await draftsOf(r.conversationId), q).toEqual([]);
    }
  });


  it('con modelo: preparar_aviso se niega (el error vuelve al modelo, nada queda por confirmar)', async () => {
    const id = await addEvent('Toma aérea Tariba 9.30');
    try {
      for (const texto of ['Equipo: la feria de Pirineos es pasado mañana al lado de la plaza Bolívar, lleguen temprano.', 'Acto del 1ro de noviembre, de 7 a 9, qta. Las Flores. Contacto 3561234.', 'Revisen el material de [[E1]].']) {
        const first = await handleTurn(sessionOf('boss'), { question: 'hola' }, LOCAL);
        await withSystem((sql) => sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'asistente', 'El evento «Toma aérea Tariba 9.30» va en ficha.')`, [first.conversationId]));
        const seen: { messages: { role: string; content: string | null }[] }[] = [];
        const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
          seen.push(JSON.parse(String(init?.body)));
          const message = seen.length === 1
            ? { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'preparar_aviso', arguments: JSON.stringify({ rol: 'social', texto }) } }] }
            : { content: 'No lo pude preparar: el aviso no puede llevar eso.' };
          return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
        }) as unknown as typeof fetch;
        const r = await handleTurn(sessionOf('boss'), { question: 'prepara un aviso a redes', conversationId: first.conversationId }, { chain: CHAIN, chatOptions: { fetchImpl } });
        expect(r.did, texto).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae /) }]);
        expect(seen[1].messages.find((m) => m.role === 'tool')!.content, texto).toMatch(/solo va en la Agenda/);
        expect(await draftsOf(r.conversationId), texto).toEqual([]);
      }
    } finally {
      await dropEvent(id);
    }
  });

  it('al confirmar: un borrador con fecha, hora o lugar no sale, queda pendiente y administración ve por qué', async () => {
    const make = (body: string) =>
      withSystem((sql) => sql.one<{ id: string }>(`insert into public.assistant_drafts (kind, created_by, summary, body, target) values ('aviso', $1, 'Aviso para Redes', $2, '{"role":"social"}'::jsonb) returning id`, [ADMIN_ID, body]));
    const before = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_notice'`));
    for (const [body, what] of [
      ['Equipo: la feria de Pirineos es pasado mañana al lado de la plaza Bolívar, lleguen temprano.', 'el día, la hora, el lugar y datos del evento'],
      ['Acto del 1ro de noviembre, de 7 a 9, qta. Las Flores. Contacto 3561234.', 'la fecha, la hora, el lugar, los contactos y datos del evento'],
    ] as const) {
      const d = (await make(body))!;
      const r = await actions.confirmAssistantDraft({ id: d.id });
      expect(r).toEqual({ ok: false, error: `No se mandó: el aviso trae ${what}, y eso solo va en la Agenda. Descártalo y pide otro sin eso.` });
      const row = await withSystem((sql) => sql.one<{ status: string }>(`select status from public.assistant_drafts where id = $1`, [d.id]));
      expect(row!.status).toBe('pendiente');
    }
    const after = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_notice'`));
    expect(after!.n).toBe(before!.n);
    // A deadline for the team still goes.
    const ok = (await make('Suban el material de la feria antes de las [hora]'))!;
    expect(await actions.confirmAssistantDraft({ id: ok.id })).toMatchObject({ ok: true, data: { sent: 2 } });
  });
});

describe('lo que se le enseña (S2, S9): guiones y fichas', () => {
  it('rechaza contactos, direcciones y un evento con su hora o su día; acepta las horas de publicar', async () => {
    const reject = [
      { title: 'Feria', body: 'La feria de Pirineos arranca a las 9:30 al lado de la plaza Bolívar, Calle 7 N° 4-23. Contacto 0414-1234567. Es pasado mañana.' },
      { title: 'Contacto', body: 'Para lo que sea, llamen al 356-1234.' },
      { title: 'La feria', body: 'La feria de Pirineos es el fin de semana.' },
      { title: 'El acto', body: 'El acto de Rubio es temprano, 9,30.' },
    ];
    for (const k of reject) await expect(admin.saveKnowledge(A, k), k.body).rejects.toThrow(/Quita|quítale/);
    await expect(admin.saveScript(A, { topic: 'Acto', script: '[ASISTENTE]: El acto es mañana a primera hora.' })).rejects.toThrow(/quítale la hora y el día/);
    await expect(admin.saveScript(A, { topic: 'Acto', script: '[ASISTENTE]: El acto es en la qta. Las Flores.' })).rejects.toThrow(/direcciones/);
    // Times alone are fine: tweet slots, best hours, a «¿a qué hora…?» asked in an example.
    expect(await admin.saveKnowledge(A, { title: 'Horas de los tweets', body: 'Los tweets salen a las 9:00, 13:00 y 19:00. En Instagram rinde más de 6:00 p. m. a 9:00 p. m.' })).toMatchObject({ origin: 'equipo' });
    expect(await admin.saveScript(A, { topic: '¿A qué hora es el evento de mañana?', script: 'Persona: ¿a qué hora es el evento de mañana?\n[ASISTENTE]: Eso se ve en la Agenda, solo para quien tiene permiso.' })).toMatchObject({ origin: 'equipo' });
  });

  it('una ficha se juzga entera (título y cuerpo), y un evento es también un título visible o quien graba (S9, ronda 3)', async () => {
    const id = await addEvent('Toma aérea Tariba');
    try {
      for (const k of [
        { title: 'Feria de Pirineos', body: 'Arranca el sábado a las 8. Llevar toldo y mesa.' }, // the event in the title, the hour in the body
        { title: 'Toldos', body: 'La feria de Pirineos lleva toldo. Arranca pasado mañana a las 9 y media.' }, // in two sentences
        { title: 'Dron en Tariba', body: 'La Toma aérea Tariba arranca a las 9:30. Lleven el dron.' }, // by its title
        { title: 'Dron', body: 'Kevin graba la toma aérea de Tariba a las 9:30 con el dron.' }, // who records
      ]) await expect(admin.saveKnowledge(A, k), k.body).rejects.toThrow(/quítale la hora y el día/);
      for (const script of ['[ASISTENTE]: Kevin graba la toma aérea de Tariba a las 9:30 con el dron.', '[ASISTENTE]: La Toma aérea Tariba arranca a las 9:30.']) {
        await expect(admin.saveScript(A, { topic: 'Dron', script }), script).rejects.toThrow(/quítale la hora y el día/);
      }
      // A ficha that names no event keeps its hours.
      expect(teachingProblem({ said: ['Horas de los tweets', 'Los tweets salen a las 9:00, 13:00 y 19:00.'], whole: true })).toBeNull();
      expect(scrubTeamFicha('Horas de los tweets', 'Los tweets salen a las 9:00, 13:00 y 19:00.')).toEqual(['Horas de los tweets', 'Los tweets salen a las 9:00, 13:00 y 19:00.']);
    } finally {
      await dropEvent(id);
    }
  });

  it('en el prompt, una ficha del equipo que nombra un evento en cualquier parte pierde sus horas y días (red de seguridad)', async () => {
    const id = await addEvent('Toma aérea Tariba');
    const fichas = [
      ['Feria de Pirineos', 'Arranca el sábado a las 8. Llevar toldo y mesa.'],
      ['Toldos de la feria', 'La feria de Pirineos lleva toldo. Arranca pasado mañana a las 9 y media.'],
      ['Dron en Tariba', 'La Toma aérea Tariba arranca a las 9:30. Lleven el dron.'],
      ['Dron de Kevin', 'Kevin graba la toma aérea de Tariba a las 9:30 con el dron.'],
    ];
    // Saved before the check (straight into the table), as if from an older version.
    const ids = await withSystem(async (sql) => {
      const out: string[] = [];
      for (const [title, body] of fichas) out.push((await sql.one<{ id: string }>(`insert into public.assistant_knowledge (title, body, tags, origin) values ($1, $2, '{zqxficha}', 'equipo') returning id`, [title, body]))!.id);
      return out;
    });
    try {
      // Asked about nothing in particular (a question about an event is 360's, without AI).
      for (const q of ['zqxficha ¿qué hay que llevar?', 'zqxficha ¿qué llevo con el dron?']) {
        const p = fakeProvider(() => say('Lleva lo de la ficha. ¿Algo más?'));
        await handleTurn(sessionOf('social'), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
        const system = p.seen[0].messages[0].content!;
        expect(system, q).toMatch(/Llevar toldo y mesa|Lleven el dron|con el dron/);
        for (const leak of ['sábado', 'a las 8', 'pasado mañana', 'y media', 'a las 9:30', 'Toma aérea Tariba']) expect(system, `${q}: ${leak}`).not.toContain(leak);
      }
    } finally {
      await dropEvent(id);
      await withSystem((sql) => sql.query(`update public.assistant_knowledge set active = false where id = any($1::uuid[])`, [ids]));
    }
  });

  it('el material de fábrica y las fichas automáticas se pueden guardar tal cual (editarlas no las rompe)', async () => {
    for (const s of FACTORY_SCRIPTS) expect(teachingProblem({ said: [s.script, s.notes], asked: [s.topic] }), s.key).toBeNull();
    for (const k of FACTORY_KNOWLEDGE) expect(teachingProblem({ said: [k.title, k.body], whole: true }), k.key).toBeNull();
    for (const k of await admin.listKnowledge(A, { origin: 'plataforma' })) expect(teachingProblem({ said: [k.title, k.body], whole: true }), k.key ?? k.title).toBeNull();
  });

  it('«Así se contesta» guarda la respuesta con «[titulo]» y sin la hora ni el lugar del título', async () => {
    const title = 'Toma aérea Tariba 9.30 frente a la plaza Bolívar';
    const id = await addEvent(title);
    try {
      const t = await handleTurn(sessionOf('social'), { question: '¿Cómo va el evento de Tariba?' }, LOCAL);
      expect(t.answer).toContain(`«${title}»`);
      const conv = (await admin.getConversation(A, t.conversationId!))!;
      const answer = conv.messages.find((m) => m.who === 'asistente')!;
      const r = await actions.saveAnswerAsExample({ conversationId: conv.id, messageId: answer.id });
      expect(r).toMatchObject({ ok: true, data: { origin: 'conversacion' } });
      const saved = (await admin.listScripts(A)).find((x) => x.id === (r as { data: { id: string } }).data.id)!;
      expect(saved.script).toContain('El evento «[titulo]» está en «Ficha»');
      // The question named it by a word of its title: that goes too (a script is never about one event).
      for (const leak of ['9.30', 'plaza Bolívar', 'Toma aérea', 'Tariba']) expect(`${saved.topic} ${saved.script}`).not.toContain(leak);
    } finally {
      await dropEvent(id);
    }
  });
});

describe('cerebro de demostración: la negativa sin la hora del título (S4) y el soporte (S10)', () => {
  it('a Redes y al jefe: la negativa nombra el evento sin su hora, fecha ni lugar', async () => {
    const cases: [string, string, string][] = [
      ['Toma aérea Tariba 9.30', '¿A qué hora es la toma aérea de Tariba?', 'Toma aérea Tariba'],
      ['Caravana Colón 9,30', '¿Cuándo sale la caravana de Colón?', 'Caravana Colón'],
      ['Acto Rubio 12 m frente a la plaza Bolívar', '¿Dónde es el acto de Rubio?', 'Acto Rubio'],
      ['Visita Lobatera 1ro de noviembre', '¿Qué día es la visita de Lobatera?', 'Visita Lobatera'],
    ];
    for (const [title, q, shown] of cases) {
      const id = await addEvent(title);
      try {
        for (const key of ['social', 'boss'] as DemoUserKey[]) {
          const r = await handleTurn(sessionOf(key), { question: q }, LOCAL);
          expect(r.answer, `${key}: ${q}`).toMatch(/no lo manejo|no la tengo/);
          expect(r.answer, `${key}: ${q}`).toContain(`«${shown}»`);
          expect(r.answer, `${key}: ${q}`).not.toContain(title);
        }
      } finally {
        await dropEvent(id);
      }
    }
  });

  it('soporte: no hay teléfono; se ofrece avisar a administración (primera pregunta y después de otra)', async () => {
    const SUPPORT = /^No hay teléfono de soporte en la plataforma; si algo falla, le aviso a administración\. ¿/;
    const asks = ['¿cuál es el teléfono de soporte?', '¿cuál es el número de soporte?', '¿a quién llamo?', '¿a quién llamo si tengo un problema?', 'tengo una falla con la app', 'me sale un error al subir'];
    for (const key of ['social', 'politics', 'ivt', 'admin'] as DemoUserKey[]) {
      for (const q of asks) {
        const fresh = await handleTurn(sessionOf(key), { question: q }, LOCAL);
        expect(fresh.answer, `${key}: ${q}`).toMatch(SUPPORT);
        // As a second turn, after a question about something else: the earlier topic doesn't win.
        const before = await handleTurn(sessionOf(key), { question: '¿cómo subo un video?' }, LOCAL);
        const second = await handleTurn(sessionOf(key), { question: q, conversationId: before.conversationId }, LOCAL);
        expect(second.answer, `${key} (segunda): ${q}`).toMatch(SUPPORT);
      }
    }
    // «Sí» to that offer: administración is told for real.
    const offer = await handleTurn(sessionOf('social'), { question: '¿cuál es el teléfono de soporte?' }, LOCAL);
    const yes = await handleTurn(sessionOf('social'), { question: 'sí, por favor', conversationId: offer.conversationId }, LOCAL);
    expect(yes.did).toEqual([{ tool: 'avisar_al_equipo' }]);
  });

  it('un error o un problema en el contenido no es soporte: contestan las fichas (S10, ronda 3)', async () => {
    const SUPPORT = /No hay teléfono de soporte/;
    const ask = (key: DemoUserKey, q: string) => handleTurn(sessionOf(key), { question: q }, LOCAL);
    expect((await ask('boss', 'hay un error en el copy, ¿cómo lo corrijo?')).answer).toMatch(/^En la pieza, pestaña Copies/);
    expect((await ask('social', '¿qué hago si hay un error en el copy de una pieza aprobada?')).answer).toMatch(/^Las causas: la pieza no está aprobada/);
    for (const key of ['social', 'politics', 'ivt', 'boss', 'admin'] as DemoUserKey[]) {
      for (const q of ['tengo un problema con el copy de la pieza, ¿qué hago?', '¿qué pasa si hay un error en un tweet publicado?']) {
        expect((await ask(key, q)).answer, `${key}: ${q}`).not.toMatch(SUPPORT);
      }
    }
  });

  it('«¿cómo subo un video?» desde un rol que no sube: quién sube y dónde', async () => {
    for (const key of ['politics', 'ivt', 'dispatch', 'boss'] as DemoUserKey[]) {
      const r = await handleTurn(sessionOf(key), { question: '¿cómo subo un video?' }, LOCAL);
      expect(r.answer, key).toMatch(/^Los videos y las fotos los suben Grabación o Redes, en la pestaña Material del evento\./);
    }
    for (const key of ['camera', 'social'] as DemoUserKey[]) {
      const r = await handleTurn(sessionOf(key), { question: '¿cómo subo un video?' }, LOCAL);
      expect(r.answer, key).toMatch(/Material/);
      expect(r.answer, key).not.toMatch(/los suben Grabación o Redes/);
    }
  });
});

describe('aviso al equipo: el motivo que escribe el modelo (rondas 3 y 4)', () => {
  it('solo a administración, con el motivo sin el día ni el lugar; al jefe no le llega', async () => {
    const motivo = 'No puede subir la pieza de la feria de pasado mañana frente a la plaza Bolívar, en la Hacienda El Trapiche, el 1ro nov.';
    const p = fakeProvider((n) => (n === 1 ? callTool('avisar_al_equipo', { motivo }) : say('Listo, ya le avisé al equipo.')));
    // Asked about nothing in particular (a question about an event never reaches the model).
    const r = await handleTurn(sessionOf('camera'), { question: 'no me deja subir la pieza, ayuda' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.model).toBe('groq:llama-3.3-70b');
    expect(r.did).toEqual([{ tool: 'avisar_al_equipo' }]);
    const last = (key: DemoUserKey) => withSystem((sql) => sql.one<{ body: string }>(`select body from public.notifications where user_id = $1 and kind = 'assistant_escalation' order by created_at desc limit 1`, [userOf(key)]));
    const admin = (await last('admin'))!.body;
    expect(admin).toMatch(/necesita ayuda: No puede subir la pieza de la feria/);
    expect(await last('boss')).toBeNull();
    for (const leak of ['pasado mañana', 'plaza Bolívar', 'Bolívar', 'Hacienda', 'Trapiche', '1ro nov']) expect(admin, leak).not.toContain(leak);
  });
});

describe('el panel no muestra nombres internos (S11)', () => {
  it('«tope» es «Límite por hora», y en «Por modelo» va en su propia fila, al final', async () => {
    expect(modelLabel('tope')).toBe('Límite por hora');
    expect(modelLabel('local')).toBe('Demostración (sin IA)');
    expect(modelLabel('groq:llama-3.3-70b')).toBe('groq:llama-3.3-70b');
    const s = sessionOf('ivt');
    const first = await handleTurn(s, { question: 'hola' }, LOCAL);
    await withSystem(async (sql) => {
      for (let i = 0; i < 40; i++) await sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'persona', 'relleno de prueba')`, [first.conversationId]);
    });
    expect((await handleTurn(s, { question: '¿qué tengo pendiente?', conversationId: first.conversationId }, LOCAL)).model).toBe('tope');
    const h = await admin.healthStats(A);
    expect(h.byModel.at(-1)!.model).toBe('tope');
    // The panel's pages never print the raw model name.
    const src = fs.readFileSync('src/app/(panel)/ajustes/asistente/sections.tsx', 'utf8');
    expect(src).not.toMatch(/m\.model === 'local'|m === 'local'/);
    expect(src.match(/modelLabel\(/g)?.length).toBe(3);
  });
});
