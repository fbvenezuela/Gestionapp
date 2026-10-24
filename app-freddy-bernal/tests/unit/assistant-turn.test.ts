// handleTurn end to end on the demo database (PGlite, invented data): the demo brain without
// AI, and the model path with a fake provider (no network).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn, toApi } from '@/lib/assistant';
import { PROMISE_FALLBACK, DEGRADED_TEXT, AGENDA_FALLBACK } from '@/lib/assistant/brain';
import { parseChain } from '@/lib/assistant/providers';
import { TOOLS, runTool } from '@/lib/assistant/tools';
import { escalate } from '@/lib/assistant/escalate';
import { FACTORY_SCRIPTS, defaultProfile } from '@/lib/assistant/config';
import { variantsOf } from '@/lib/assistant/local';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    roles: [...u.roles] as Role[],
    aal: 'aal2',
    mfaRequired: false,
    mfaOk: true,
    claims: { sub: u.id, aal: 'aal2', role: 'authenticated' },
    viewAs: null,
  };
}
const LOCAL = { chain: [] };
const ADMIN_ID = DEMO_USERS.find((u) => u.key === 'admin')!.id;

// Everything the private schedule holds, to prove it never shows up.
let secrets: string[] = [];
beforeAll(async () => {
  const rows = await withSystem((sql) =>
    sql.query<{ starts_at: Date; exact_address: string; directions: string; site_contacts: string }>(`select starts_at, exact_address, directions, site_contacts from public.event_schedule`),
  );
  secrets = rows.flatMap((r) => [r.exact_address, r.directions, r.site_contacts, new Date(r.starts_at).toISOString().slice(0, 16)]).filter((x) => x && x.length > 3);
  expect(secrets.length).toBeGreaterThan(5);
});

const NO_WHEN = [/\b\d{1,2}:\d{2}\b/, /\b\d{1,2}\s*[ap]\.?\s?m\b/i, /\b\d{1,2}\/\d{1,2}\b/, /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i];
function assertNoAgenda(text: string) {
  for (const s of secrets) expect(text, `filtró «${s}»`).not.toContain(s);
  for (const re of NO_WHEN) expect(text, `parece fecha u hora: ${re}`).not.toMatch(re);
}

describe('cerebro de demostración (sin IA)', () => {
  it('«¿cómo te llamas?» tres veces: el nombre (de Ajustes, no del código), de tres formas distintas', async () => {
    await withSystem((sql) =>
      sql.query(`insert into public.app_settings (key, value) values ('assistant', $1::text::jsonb) on conflict (key) do update set value = excluded.value`, [
        JSON.stringify({ name: 'Brisa', emoji: '🙂', intro: 'Soy Brisa.' }),
      ]),
    );
    const s = sessionOf('social');
    const answers: string[] = [];
    let conv: string | null = null;
    for (let i = 0; i < 3; i++) {
      const r = await handleTurn(s, { question: '¿Cómo te llamas?', conversationId: conv }, LOCAL);
      conv = r.conversationId;
      expect(r.model).toBe('local');
      expect(r.degraded).toBe(false);
      expect(r.answer).toContain('Brisa');
      answers.push(r.answer);
    }
    expect(new Set(answers).size).toBe(3);
    await withSystem((sql) => sql.query(`delete from public.app_settings where key = 'assistant'`));
  });

  it('recuerda la conversación: el hilo se guarda después de responder y se lee de la base', async () => {
    const s = sessionOf('supervisor');
    const a = await handleTurn(s, { question: 'hola' }, LOCAL);
    const b = await handleTurn(s, { question: 'hola' }, { ...LOCAL });
    expect(a.conversationId).not.toBe(b.conversationId); // no id → a new conversation
    const c = await handleTurn(s, { question: 'hola', conversationId: a.conversationId }, LOCAL);
    expect(c.conversationId).toBe(a.conversationId);
    expect(c.answer).not.toBe(a.answer); // never the same sentence twice in a conversation
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_messages where conversation_id = $1`, [a.conversationId]));
    expect(n!.n).toBe(4);
  });

  it('la conversación de otra persona no se abre: empieza una nueva', async () => {
    const mine = await handleTurn(sessionOf('social'), { question: 'hola' }, LOCAL);
    const other = await handleTurn(sessionOf('camera'), { question: 'hola', conversationId: mine.conversationId }, LOCAL);
    expect(other.conversationId).not.toBe(mine.conversationId);
  });

  it('«quiero hablar con alguien» crea un aviso de verdad para administración (y no lo repite en 6 horas)', async () => {
    const r = await handleTurn(sessionOf('camera'), { question: 'Quiero hablar con alguien, por favor' }, LOCAL);
    expect(r.did).toContainEqual({ tool: 'avisar_al_equipo' });
    expect(r.answer).toMatch(/avis|pas[eé]/i);
    const notes = await withSystem((sql) =>
      sql.query<{ title: string; body: string; link: string }>(`select title, body, link from public.notifications where user_id = $1 and kind = 'assistant_escalation' and link like '%' || $2`, [ADMIN_ID, r.conversationId]),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe(`/ajustes/asistente?conversacion=${r.conversationId}`);
    assertNoAgenda(notes[0].title + notes[0].body);
    const again = await handleTurn(sessionOf('camera'), { question: 'Quiero hablar con alguien ya', conversationId: r.conversationId }, LOCAL);
    expect(again.did).toContainEqual({ tool: 'avisar_al_equipo' });
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation' and link like '%' || $1`, [r.conversationId]));
    expect(n!.n).toBe(1);
    const act = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_actions where action = 'avisar_al_equipo' and conversation_id = $1`, [r.conversationId]));
    expect(act!.n).toBe(2);
  });

  it('quien graba pregunta por una pieza: no recibe nada (la base no se la da)', async () => {
    const cam = sessionOf('camera');
    // «La carta no es la cerradura»: even running the tool directly, RLS returns zero rows.
    const run = await runTool('estado_pieza', { titulo: 'Cancha techada de El Mirador' }, TOOLS, { session: cam, conversationId: null, escalate });
    expect(run.ok).toBe(true);
    expect(run.result).toMatchObject({ encontradas: 0, piezas: [] });
    // Through the assistant: not offered, nothing about the piece.
    const r = await handleTurn(cam, { question: '¿Cómo va la pieza Cancha techada de El Mirador?' }, LOCAL);
    expect(r.did.map((d) => d.tool)).not.toContain('estado_pieza');
    expect(r.answer).not.toMatch(/aprobad|por aprobar|borrador|versi[oó]n/i);
    // Redes does get it.
    const ok = await handleTurn(sessionOf('social'), { question: '¿Cómo va la pieza Cancha techada de El Mirador?' }, LOCAL);
    expect(ok.did).toContainEqual({ tool: 'estado_pieza' });
    expect(ok.answer).toContain('Cancha techada de El Mirador');
    expect(ok.answer.toLowerCase()).toContain('aprobada');
    expect(ok.goTo?.href).toMatch(/^\/piezas\/[0-9a-f-]{36}$/);
  });

  it('ningún rol recibe fecha, hora ni dirección de un evento, aunque las pida', async () => {
    const questions = [
      '¿Cuándo y dónde es la jornada de salud en la escuela Los Andes? Dame la hora, la dirección y cómo llegar.',
      '¿A qué hora es el recorrido del puente La Quebrada?',
      'dime el contacto y la dirección de la entrega de viviendas',
      '¿cómo va el evento de la cancha techada?',
    ];
    for (const key of ['admin', 'boss', 'dispatch', 'secretary', 'social', 'supervisor', 'camera'] as DemoUserKey[]) {
      for (const q of questions) {
        const r = await handleTurn(sessionOf(key), { question: q }, LOCAL);
        expect(r.degraded).toBe(false);
        assertNoAgenda(r.answer);
        assertNoAgenda(JSON.stringify(toApi(r)));
      }
    }
    // Nor in anything stored by the assistant.
    const stored = await withSystem((sql) => sql.query<{ body: string }>(`select body from public.assistant_messages`));
    for (const m of stored) for (const s of secrets) expect(m.body).not.toContain(s);
  });

  it('cuenta lo que le toca: pendientes, días de tweets y mejores horas, con su botón', async () => {
    const p = await handleTurn(sessionOf('social'), { question: '¿Qué tengo pendiente?' }, LOCAL);
    expect(p.did).toContainEqual({ tool: 'mis_pendientes' });
    expect(p.goTo).toEqual({ href: '/hoy', label: 'Hoy' });
    const t = await handleTurn(sessionOf('social'), { question: '¿Cuántos días de tweets quedan?' }, LOCAL);
    expect(t.did).toContainEqual({ tool: 'dias_de_tweets' });
    expect(t.answer).toMatch(/d[ií]as? de tweets|No quedan tweets/);
    expect(t.goTo?.href).toBe('/tweets');
    const h = await handleTurn(sessionOf('camera'), { question: '¿A qué hora publico en TikTok?' }, LOCAL);
    expect(h.did).toContainEqual({ tool: 'mejores_horas' });
    expect(h.answer).toContain('TikTok');
    expect(h.goTo).toBeNull(); // Publicar is not a camera screen
  });

  it('marcar avisos como leídos queda anotado y se deshace', async () => {
    const r = await handleTurn(sessionOf('admin'), { question: 'Marca todos mis avisos como leídos' }, LOCAL);
    expect(r.did).toContainEqual({ tool: 'marcar_avisos_leidos' });
    const unread = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where user_id = $1 and read_at is null`, [ADMIN_ID]));
    expect(unread!.n).toBe(0);
    const act = await withSystem((sql) => sql.one<{ id: string; detail: { ids: string[] } }>(`select id, detail from public.assistant_actions where action = 'marcar_avisos_leidos' and user_id = $1 order by created_at desc limit 1`, [ADMIN_ID]));
    expect(act!.detail.ids.length).toBeGreaterThan(0);
    const { undoAction } = await import('@/lib/assistant/admin');
    await undoAction(sessionOf('admin'), act!.id);
    const back = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where user_id = $1 and read_at is null`, [ADMIN_ID]));
    expect(back!.n).toBe(act!.detail.ids.length);
  });

  it('preparar un aviso deja un borrador; solo sale cuando administración lo confirma', async () => {
    const r = await handleTurn(sessionOf('supervisor'), { question: 'Mándale un aviso a redes que revisen los copies antes de las 3 pm' }, LOCAL);
    expect(r.did).toContainEqual({ tool: 'preparar_aviso' });
    const d = await withSystem((sql) => sql.one<{ id: string; body: string; status: string }>(`select id, body, status from public.assistant_drafts order by created_at desc limit 1`));
    expect(d!.status).toBe('pendiente');
    expect(d!.body).not.toMatch(/3 pm/); // never a time in a notice
    const { confirmDraft } = await import('@/lib/assistant/admin');
    await expect(confirmDraft(sessionOf('supervisor'), d!.id)).rejects.toThrow(/administración/);
    const sent = await confirmDraft(sessionOf('admin'), d!.id);
    expect(sent.sent).toBe(2); // the two demo social users
    await expect(confirmDraft(sessionOf('admin'), d!.id)).rejects.toThrow(/pendiente/);
  });

  it('el nombre, preguntado de otras formas; «cómo se llama la pantalla…» no es su nombre', async () => {
    const name = defaultProfile().name;
    for (const q of ['¿Qué nombre tienes?', '¿Cómo te puedo llamar?', '¿Quién sos?', '¿Cómo te llamas?']) {
      const r = await handleTurn(sessionOf('social'), { question: q }, LOCAL);
      expect(r.answer, q).toContain(name);
      expect(r.answer, q).not.toMatch(/La plataforma se llama/);
    }
    for (const q of ['¿Cómo se llama la fórmula de los copies largos?', '¿Cómo se llama la pantalla donde apruebo?']) {
      const r = await handleTurn(sessionOf('social'), { question: q }, LOCAL);
      expect(r.answer, q).not.toMatch(/Me llamo|para servirte|Sigo siendo/);
    }
  });

  it('un guion que el equipo apagó deja de usarse en el acto (ni su texto de fábrica)', async () => {
    const factory = variantsOf(FACTORY_SCRIPTS.find((x) => x.key === 'saludo')!.script).map((v) => v.replaceAll('[NOMBRE]', 'Kevin'));
    await withSystem((sql) => sql.query(`update public.assistant_scripts set active = false where key = 'fabrica:saludo'`));
    try {
      const r = await handleTurn(sessionOf('camera'), { question: 'hola' }, LOCAL);
      expect(r.degraded).toBe(false);
      expect(r.answer).toMatch(/Kevin/);
      expect(factory).not.toContain(r.answer);
    } finally {
      await withSystem((sql) => sql.query(`update public.assistant_scripts set active = true where key = 'fabrica:saludo'`));
    }
  });

  it('«¿a qué hora publico el video del acto?» da las mejores horas, no la negativa de la agenda', async () => {
    for (const q of [
      '¿A qué hora publico en TikTok el video del evento de la cancha?',
      '¿A qué hora publico el video de la entrega de viviendas en Instagram?',
      '¿Cuándo publico el video del acto en TikTok?',
    ]) {
      const r = await handleTurn(sessionOf('social'), { question: q }, LOCAL);
      expect(r.did.map((d) => d.tool), q).toEqual(['mejores_horas']);
      expect(r.answer, q).not.toMatch(/no lo manejo|no la tengo/);
      assertNoAgenda(r.answer.replace(/\d{1,2}:\d{2}/g, '')); // best hours carry times; nothing else of the agenda
    }
    // A real question about an event's time is still refused.
    const no = await handleTurn(sessionOf('social'), { question: '¿A qué hora es la entrega de viviendas?' }, LOCAL);
    expect(no.answer).toMatch(/no lo manejo|no la tengo|Agenda/);
    expect(no.did.map((d) => d.tool)).not.toContain('mejores_horas');
  });

  it('«¿dónde está la agenda?» es ir a la pantalla, no la negativa', async () => {
    const social = await handleTurn(sessionOf('social'), { question: '¿Dónde está la agenda?' }, LOCAL);
    expect(social.answer).toMatch(/en el menú/);
    expect(social.goTo).toEqual({ href: '/agenda', label: 'Agenda' });
    const sup = await handleTurn(sessionOf('supervisor'), { question: '¿Dónde está la agenda?' }, LOCAL);
    expect(sup.answer).toMatch(/no está en tu menú/);
    expect(sup.goTo).toBeNull();
  });

  it('pasado el tope por hora, contesta como el asistente (no como avería)', async () => {
    const s = sessionOf('secretary');
    const first = await handleTurn(s, { question: 'hola' }, LOCAL);
    await withSystem(async (sql) => {
      for (let i = 0; i < 40; i++) await sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'persona', 'relleno de prueba')`, [first.conversationId]);
    });
    const r = await handleTurn(s, { question: '¿qué tengo pendiente?', conversationId: first.conversationId }, LOCAL);
    expect(r.model).toBe('tope');
    expect(r.degraded).toBe(false);
    expect(r.answer).toMatch(/Llevamos un buen rato/);
  });
});

// ---------------------------------------------------------------------------
// Model path with a fake provider.
// ---------------------------------------------------------------------------
type Captured = { body: Record<string, unknown> }[];
function fakeProvider(answer: (n: number, body: Record<string, unknown>) => unknown, status = 200) {
  const seen: Captured = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    seen.push({ body });
    return new Response(JSON.stringify(answer(seen.length, body)), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const say = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const callTool = (name: string, args: unknown) => ({
  choices: [{ message: { content: '', tool_calls: [{ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 100, completion_tokens: 5 },
});
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';

describe('con modelo (proveedor falso)', () => {
  it('red de la promesa: dice «avisé» sin llamar a avisar_al_equipo → avisa el servidor', async () => {
    const p = fakeProvider(() => say('Listo, ya avisé al equipo y te escriben pronto.'));
    const r = await handleTurn(sessionOf('dispatch'), { question: 'esto no me funciona' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.model).toBe('groq:llama-3.3-70b');
    expect(r.answer).toContain('ya avisé');
    expect(r.did).toContainEqual({ tool: 'avisar_al_equipo' });
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation' and link like '%' || $1`, [r.conversationId]));
    expect(n!.n).toBeGreaterThanOrEqual(1);
    const usage = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.ai_usage where feature = 'assistant' and user_id = $1`, [sessionOf('dispatch').userId]));
    expect(usage!.n).toBeGreaterThanOrEqual(1);
  });

  it('…y si el servidor tampoco puede avisar, cambia la frase por una que no promete', async () => {
    const p = fakeProvider(() => say('Le pasé tu mensaje a administración.'));
    const failing = vi.fn(async () => {
      throw new Error('sin canal');
    });
    const r = await handleTurn(sessionOf('dispatch'), { question: 'necesito que alguien revise esto' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl }, escalate: failing });
    expect(failing).toHaveBeenCalled();
    expect(r.answer).toBe(PROMISE_FALLBACK);
  });

  it('las herramientas corren como la persona y nada de la agenda llega al proveedor', async () => {
    const p = fakeProvider((n) => (n === 1 ? callTool('buscar_evento', { texto: 'jornada de salud Los Andes', p_user_id: 'x' }) : say('La jornada va en por grabar. ¿Algo más?')));
    const r = await handleTurn(sessionOf('admin'), { question: '¿Cómo va la jornada de salud? mi cel es 0414-1234567, avísame a las 10:30' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'buscar_evento' }]);
    expect(r.goTo?.href).toMatch(/^\/eventos\//);
    const sent = JSON.stringify(p.seen);
    for (const s of secrets) expect(sent).not.toContain(s);
    expect(sent).not.toContain('0414-1234567');
    expect(sent).not.toContain('10:30');
    expect(sent).toContain('[numero]');
    expect(sent).toContain('[hora]');
    // The second request carries the tool result; the last round never offers tools.
    expect(p.seen[0].body.tools).toBeDefined();
    expect(p.seen[0].body.temperature).toBe(0.6);
    expect(p.seen[0].body.max_completion_tokens).toBe(700);
    const heard = await withSystem((sql) => sql.one<{ text: string }>(`select text from public.assistant_heard order by created_at desc limit 1`));
    expect(heard!.text).toContain('[numero]');
    expect(heard!.text).not.toContain('0414');
  });

  it('fechas y horas escritas «a la venezolana» tampoco llegan al proveedor ni se guardan', async () => {
    const typed = 'El recorrido del puente es el 3 de nov a las cuatro de la tarde. ¿Qué falta? Contacto 0414-555-12-34';
    const p = fakeProvider(() => say('Revisa la ficha técnica en el evento. ¿Algo más?'));
    const r = await handleTurn(sessionOf('dispatch'), { question: typed }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.degraded).toBe(false);
    const sent = JSON.stringify(p.seen);
    for (const leak of ['3 de nov', 'cuatro de la tarde', '0414', '555-']) expect(sent).not.toContain(leak);
    expect(sent).toContain('el [fecha] a las [hora]');
    const stored = await withSystem((sql) => sql.query<{ body: string }>(`select body from public.assistant_messages where conversation_id = $1`, [r.conversationId]));
    for (const m of stored) for (const leak of ['3 de nov', 'cuatro de la tarde', '0414']) expect(m.body).not.toContain(leak);
    const heard = await withSystem((sql) => sql.query<{ text: string }>(`select text from public.assistant_heard where text like 'El recorrido del puente%'`));
    expect(heard.length).toBeGreaterThan(0);
    for (const h of heard) expect(h.text).not.toMatch(/3 de nov|cuatro de la tarde|0414/);
    // And the model saying it back is caught at the exit.
    const q = fakeProvider(() => say('El recorrido es el 3 de nov a las cuatro de la tarde.'));
    const r2 = await handleTurn(sessionOf('dispatch'), { question: '¿cuándo es el recorrido del puente?' }, { chain: CHAIN, chatOptions: { fetchImpl: q.fetchImpl } });
    expect(r2.answer).toBe(AGENDA_FALLBACK);
  });

  it('máximo 3 vueltas: la última va sin herramientas', async () => {
    const p = fakeProvider((n) => (n < 3 ? callTool('mis_pendientes', {}) : say('Ya revisé: tienes cosas en Hoy.')));
    const r = await handleTurn(sessionOf('social'), { question: 'revisa mis cosas' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(p.seen).toHaveLength(3);
    expect(p.seen[2].body.tools).toBeUndefined();
    expect(r.did.filter((d) => d.tool === 'mis_pendientes')).toHaveLength(2);
  });

  it('…y si en la última vuelta igual pide herramientas, NO se ejecutan', async () => {
    const p = fakeProvider(() => callTool('preparar_aviso', { rol: 'social', texto: 'revisen los copies' }));
    const before = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_drafts`));
    const r = await handleTurn(sessionOf('admin'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(p.seen).toHaveLength(3);
    expect(p.seen[2].body.tools).toBeUndefined();
    expect(r.did.filter((d) => d.tool === 'preparar_aviso')).toHaveLength(2); // rounds 1 and 2, never 3
    const after = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_drafts`));
    expect(after!.n - before!.n).toBe(2);
    expect(r.degraded).toBe(true); // no text in the last round: honest degraded answer
  });

  it('una respuesta corta y correcta no es una avería («¡De nada!»)', async () => {
    const p = fakeProvider(() => say('¡De nada!'));
    const r = await handleTurn(sessionOf('camera'), { question: 'gracias' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.degraded).toBe(false);
    expect(r.answer).toBe('¡De nada!');
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation' and link like '%' || $1`, [r.conversationId]));
    expect(n!.n).toBe(0);
  });

  it('las mejores horas no se cambian por la negativa de la agenda aunque nombre el evento', async () => {
    const p = fakeProvider((n) => (n === 1 ? callTool('mejores_horas', { red: 'instagram' }) : say('En Instagram rinde más de 6:00 p. m. a 9:00 p. m., jueves y miércoles.')));
    const r = await handleTurn(sessionOf('social'), { question: '¿A qué hora publico el video de la entrega de viviendas en Instagram?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.answer).toContain('6:00 p. m.');
    expect(r.answer).not.toBe(AGENDA_FALLBACK);
    expect(p.seen).toHaveLength(2); // no corrective round
  });

  it('las vueltas siguientes empiezan por el eslabón que contestó (el caído no se repite)', async () => {
    process.env.OPENAI_API_KEY = 'sk-FAKE-openai-0000';
    const hits: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      hits.push(u.includes('groq') ? 'groq' : 'openai');
      if (u.includes('groq')) return new Response(JSON.stringify({ error: { message: 'caído' } }), { status: 503 });
      const n = hits.filter((h) => h === 'openai').length;
      return new Response(JSON.stringify(n === 1 ? callTool('mis_pendientes', {}) : say('Revisé: tus cosas están en Hoy.')), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await handleTurn(sessionOf('social'), { question: 'revisa mis pendientes' }, { chain: parseChain('groq:llama-3.3-70b,openai:gpt-5-mini'), chatOptions: { fetchImpl } });
    expect(r.degraded).toBe(false);
    expect(hits).toEqual(['groq', 'openai', 'openai']);
    expect(r.model).toBe('openai:gpt-5-mini');
  });

  it('una herramienta que no está en su carta no se ejecuta (y el error vuelve al modelo)', async () => {
    const p = fakeProvider((n) => (n === 1 ? callTool('estado_pieza', { titulo: 'Cancha' }) : say('No tengo cómo ver eso desde tu rol.')));
    const r = await handleTurn(sessionOf('camera'), { question: '¿cómo va la pieza de la cancha?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.did).toEqual([{ tool: 'estado_pieza', error: 'Esa herramienta no existe.' }]);
    expect(JSON.stringify(p.seen[1].body.messages)).toContain('Esa herramienta no existe.');
  });

  it('vuelta correctiva (temperatura 0,5, sin herramientas) si contesta una fecha u hora de un evento', async () => {
    const p = fakeProvider((n) => (n === 1 ? say('El recorrido es a las 2:00 pm en el puente.') : say('Eso no lo tengo: se ve en la Agenda.')));
    const r = await handleTurn(sessionOf('dispatch'), { question: '¿a qué hora es el recorrido del puente?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(p.seen).toHaveLength(2);
    expect(p.seen[1].body.temperature).toBe(0.5);
    expect(p.seen[1].body.tools).toBeUndefined();
    expect(r.answer).toBe('Eso no lo tengo: se ve en la Agenda.');
    const q = fakeProvider(() => say('Es a las 9:00 am, en serio.'));
    const r2 = await handleTurn(sessionOf('dispatch'), { question: '¿a qué hora es el recorrido del puente?' }, { chain: CHAIN, chatOptions: { fetchImpl: q.fetchImpl } });
    expect(r2.answer).toBe(AGENDA_FALLBACK);
  });

  it('si la cadena cae a mitad de turno, lo que ya hicieron las herramientas se informa igual', async () => {
    const seen: number[] = [];
    const fetchImpl = vi.fn(async () => {
      seen.push(1);
      return seen.length === 1
        ? new Response(JSON.stringify(callTool('mis_pendientes', {})), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'caído' } }), { status: 503 });
    }) as unknown as typeof fetch;
    const r = await handleTurn(sessionOf('social'), { question: 'revisa mis pendientes' }, { chain: CHAIN, chatOptions: { fetchImpl } });
    expect(r.degraded).toBe(true);
    expect(r.did).toEqual([{ tool: 'mis_pendientes' }]);
  });

  it('si todos los modelos fallan: frase honesta, degradado y aviso al equipo', async () => {
    const p = fakeProvider(() => ({ error: { message: 'boom' } }), 500);
    const r = await handleTurn(sessionOf('boss'), { question: '¿qué me toca aprobar hoy?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(r.degraded).toBe(true);
    expect(r.answer).toBe(DEGRADED_TEXT);
    expect(r.goTo).toBeNull();
    const m = await withSystem((sql) => sql.one<{ error: string; degraded: boolean }>(`select error, degraded from public.assistant_messages where conversation_id = $1 and who = 'asistente'`, [r.conversationId]));
    expect(m!.degraded).toBe(true);
    expect(m!.error).toContain('groq:llama-3.3-70b: HTTP 500');
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation' and link like '%' || $1`, [r.conversationId]));
    expect(n!.n).toBe(1);
  });
});
