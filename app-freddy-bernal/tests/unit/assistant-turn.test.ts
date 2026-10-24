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

  it('cuándo, dónde, cómo llegar, con quién hablo o a qué hora graba: la negativa de la agenda y nada más', async () => {
    const questions = [
      '¿a qué hora es la feria de emprendedores?',
      '¿dónde queda la feria de emprendedores?',
      '¿cómo llego al urbanismo Nuevo Amanecer?',
      '¿con quién hablo en la entrega de viviendas?',
      '¿a qué hora graba Kevin?',
      '¿qué día es la entrega de viviendas?',
      '¿qué eventos hay mañana?',
      '¿qué eventos tiene el jefe el martes?',
      // No event word: the title says it (or, for whom can't see that event, the way it is asked).
      '¿dónde queda la cancha techada de El Mirador?',
      '¿cuándo es lo de los productores de café?',
    ];
    for (const key of ['social2', 'supervisor', 'secretary'] as DemoUserKey[]) {
      for (const q of questions) {
        const r = await handleTurn(sessionOf(key), { question: q }, LOCAL);
        const who = `${key}: ${q}`;
        expect(r.answer, who).toMatch(/no lo manejo|no la tengo/);
        expect(r.answer, who).not.toMatch(/\d{1,2}:\d{2}|\d\s*[ap]\.?\s?m\b|–/); // no hours of any kind next to it
        expect(r.answer, who).not.toMatch(/Me llamo|Gestión y obras|Categorías/);
        expect(r.did.map((d) => d.tool), who).not.toContain('mejores_horas');
        assertNoAgenda(r.answer);
      }
    }
    // Alone, «¿con quién hablo?» asks for its name; a step, a deadline or approvals keep their answers.
    const name = await handleTurn(sessionOf('social2'), { question: '¿Con quién hablo?' }, LOCAL);
    expect(name.answer).toContain(defaultProfile().name);
    for (const q of ['¿Dónde subo el material de la feria?', '¿Cuándo es el plazo de aprobación?', '¿Qué me toca aprobar hoy?']) {
      const r = await handleTurn(sessionOf('social2'), { question: q }, LOCAL);
      expect(r.answer, q).not.toMatch(/no lo manejo|no la tengo/);
    }
  });

  it('preguntada como agenda, sin palabra de evento o por un evento que no ve: la negativa, nunca una ficha suelta', async () => {
    const cases: [DemoUserKey[], string][] = [
      [['social2', 'boss'], '¿a qué hora sale Kevin?'],
      [['supervisor', 'admin'], '¿a qué hora llega Mariela?'],
      [['social2', 'boss'], '¿qué hay el domingo?'],
      [['supervisor'], '¿hay algo el sábado?'],
      // Secretaría and Grabación don't see these events: the way it is asked is enough.
      [['secretary', 'camera'], '¿cuándo entregan las viviendas?'],
      [['secretary'], '¿lo de los emprendedores es en la mañana o en la tarde?'],
      [['secretary'], '¿cuándo va Mariela a la escuela?'],
      [['secretary', 'camera'], '¿en qué sitio se hace lo de los productores?'],
      [['secretary', 'camera'], 'pásame la dirección de lo de la plaza central'],
      [['secretary'], '¿cuándo toca lo de la cancha?'],
      [['camera'], '¿qué día toca lo del puente?'],
      [['camera'], '¿a quién llamo para lo de los productores?'],
    ];
    for (const [keys, q] of cases) {
      for (const key of keys) {
        const r = await handleTurn(sessionOf(key), { question: q }, LOCAL);
        const who = `${key}: ${q}`;
        expect(r.model, who).toBe('local');
        expect(r.answer, who).toMatch(/no lo manejo|no la tengo/);
        expect(r.answer, who).not.toMatch(/\d{1,2}:\d{2}|–|Mejores días|peor rinden|Gestión y obras|plazo|Tocar un aviso|Despacho:/);
        expect(r.did.map((d) => d.tool), who).not.toContain('mejores_horas');
        assertNoAgenda(r.answer);
      }
    }
  });

  it('lo que no es la agenda sigue con su respuesta: la pieza, cómo se hace, lo suyo, los avisos y el evento por su lugar', async () => {
    const ask = async (key: DemoUserKey, question: string) => {
      const r = await handleTurn(sessionOf(key), { question }, LOCAL);
      expect(r.model, `${key}: ${question}`).toBe('local');
      return r;
    };
    // A piece is named after its event: asking when it is approved or goes out is about the piece.
    for (const key of ['social', 'supervisor'] as DemoUserKey[]) {
      expect((await ask(key, '¿Cuándo aprueban la pieza del puente?')).answer).toMatch(/^La pieza «Avance del puente La Quebrada» está por aprobar/);
    }
    expect((await ask('social', '¿Hoy sale la pieza de la cancha?')).answer).toMatch(/^La pieza «Cancha techada de El Mirador» está/);
    // How-tos and screens.
    expect((await ask('supervisor', '¿Dónde queda el copy?')).answer).toMatch(/pestaña Copies/);
    expect((await ask('secretary', '¿Dónde es que se cambia la contraseña?')).answer).toMatch(/En «Entrar»/);
    expect((await ask('admin', '¿Dónde está el material de la feria?')).answer).toMatch(/pestaña Material/);
    for (const [key, q] of [
      ['supervisor', '¿Dónde queda Ajustes?'],
      ['camera', '¿Cuándo hay que grabar con dron?'],
      ['camera', '¿Dónde se guarda la grabación?'],
      ['social', '¿Cuándo grabo en vertical y cuándo en horizontal?'],
      ['social', '¿Cuándo llega el material de la cancha?'],
      ['supervisor', '¿Cuándo se publica lo de la cancha?'],
    ] as [DemoUserKey, string][]) {
      const r = await ask(key, q);
      expect(r.answer, q).not.toMatch(/no lo manejo|no la tengo/);
      expect(r.answer, q).not.toMatch(/\d{1,2}:\d{2}/); // no hours next to a «¿cuándo…?»
    }
    // Their own list, with a day named.
    const rec = await ask('camera', '¿Qué me toca grabar el viernes?');
    expect(rec.did).toEqual([{ tool: 'mis_pendientes' }]);
    expect(rec.answer).toMatch(/^Tienes 1 pendiente/);
    expect((await ask('secretary', '¿Ya me aceptaron la propuesta del evento del viernes?')).did).toEqual([{ tool: 'mis_pendientes' }]);
    // A notice to a group is prepared (or sent to whom prepares them), unless it carries a date or a time.
    const notice = await ask('admin', 'Mándales un aviso a redes de que hoy suben el material de la entrega');
    expect(notice.did).toEqual([{ tool: 'preparar_aviso' }]);
    expect((await ask('dispatch', 'Mándale un aviso a grabación de que mañana suban el material del puente')).answer).toMatch(/los preparan administración o supervisión/);
    const dated = await ask('admin', 'Mándales un aviso a redes de que la feria es el martes 27 a las 4 pm');
    expect(dated.did).toEqual([]);
    expect(dated.answer).toMatch(/no puede llevar la fecha, la hora/);
    // A place in an event's title: masked before it is stored, still found by the demo brain.
    const ev = await withSystem((sql) => sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ('Entrega de bombonas en el barrio San Carlos', 'accepted', $1) returning id`, [ADMIN_ID]));
    try {
      const r = await ask('social', '¿cómo va el evento del barrio San Carlos?');
      expect(r.answer).toMatch(/^El evento «Entrega de bombonas en el barrio San Carlos» está en/);
      const q = await withSystem((sql) => sql.one<{ body: string }>(`select body from public.assistant_messages where conversation_id = $1 and who = 'persona'`, [r.conversationId]));
      expect(q!.body).toBe('¿cómo va el evento del [direccion]?');
    } finally {
      await withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [ev!.id]));
    }
  });

  it('«¿qué tengo pendiente?» nombra la pantalla de inicio de cada rol (la del jefe es «Inicio»)', async () => {
    const boss = await handleTurn(sessionOf('boss'), { question: '¿Qué tengo pendiente?' }, LOCAL);
    expect(boss.answer).toMatch(/Todo eso está en Inicio\.$/);
    expect(boss.answer).not.toMatch(/\bHoy\b/);
    expect(boss.goTo).toEqual({ href: '/jefe', label: 'Inicio' });
    const social = await handleTurn(sessionOf('social'), { question: '¿Qué tengo pendiente?' }, LOCAL);
    expect(social.answer).toMatch(/Todo eso está en Hoy\.$/);
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

  it('un título con fecha, hora o dirección no llega al proveedor (ni por la herramienta ni por el hilo)', async () => {
    const title = 'Visita escuela Zamorano jueves 30 a las 9:00 am, calle 3';
    const ev = await withSystem((sql) => sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ($1, 'accepted', $2) returning id`, [title, ADMIN_ID]));
    try {
      // An earlier answer of the demo brain quoted the title as it is (it is in the thread).
      const first = await handleTurn(sessionOf('social'), { question: 'hola' }, LOCAL);
      await withSystem((sql) => sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'asistente', $2)`, [first.conversationId, `Lo primero: falta el storyboard: «${title}».`]));
      const p = fakeProvider((n) => (n === 1 ? callTool('buscar_evento', { texto: 'escuela Zamorano' }) : say('La visita a la escuela Zamorano va en ficha. ¿Algo más?')));
      const r = await handleTurn(sessionOf('social'), { question: '¿Cómo va lo de la escuela Zamorano?', conversationId: first.conversationId }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(r.did).toEqual([{ tool: 'buscar_evento' }]);
      const sent = JSON.stringify(p.seen);
      expect(JSON.stringify(p.seen[1].body.messages)).toContain('Visita escuela Zamorano [fecha] a las [hora], [direccion]');
      for (const leak of ['jueves 30', '9:00', 'calle 3']) expect(sent).not.toContain(leak);
    } finally {
      await withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [ev!.id]));
    }
  });

  it('el tope por hora no se salta con pedidos en paralelo: la pregunta cuenta antes del modelo, aunque el turno falle', async () => {
    const s = sessionOf('camera2');
    // 38 questions in the last hour: room for 2 more.
    await withSystem(async (sql) => {
      const c = await sql.one<{ id: string }>(`insert into public.assistant_conversations (user_id, title) values ($1, 'relleno') returning id`, [s.userId]);
      for (let i = 0; i < 38; i++) await sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'persona', 'relleno de prueba')`, [c!.id]);
    });
    // The provider fails: those turns end degraded, and still count.
    const p = fakeProvider(() => ({ error: { message: 'boom' } }), 500);
    const quiet = async () => ({ alreadyNotified: false, to: [] });
    const rs = await Promise.all(Array.from({ length: 5 }, () => handleTurn(s, { question: 'revisa mis cosas' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl }, escalate: quiet })));
    expect(p.seen).toHaveLength(2);
    expect(rs.filter((r) => r.model === 'tope')).toHaveLength(3);
    expect(rs.filter((r) => r.degraded)).toHaveLength(2);
    const next = await handleTurn(s, { question: 'revisa mis cosas' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl }, escalate: quiet });
    expect(next.model).toBe('tope');
    expect(p.seen).toHaveLength(2);
  });

  it('el tope de gasto del mes tampoco: cada turno con modelo reserva su gasto antes de preguntar', async () => {
    const { env } = await import('@/lib/env');
    const cap = env.ai.monthlyCapUsd;
    const spent = await withSystem((sql) => sql.one<{ s: string }>(`select coalesce(sum(cost_usd), 0) as s from public.ai_usage where at >= date_trunc('month', now())`));
    env.ai.monthlyCapUsd = Number(spent!.s) + 0.00005; // room for one turn only
    try {
      const p = fakeProvider(() => say('Revisa tu pantalla de inicio, ahí está todo.'));
      const rs = await Promise.all((['admin', 'dispatch', 'supervisor', 'camera'] as DemoUserKey[]).map((k) => handleTurn(sessionOf(k), { question: 'revisa mis cosas' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } })));
      expect(p.seen).toHaveLength(1);
      expect(rs.filter((r) => r.model === 'groq:llama-3.3-70b')).toHaveLength(1);
      expect(rs.filter((r) => r.model === 'local')).toHaveLength(3); // over the cap: the demo brain, never a breakdown
      expect(rs.every((r) => !r.degraded)).toBe(true);
    } finally {
      env.ai.monthlyCapUsd = cap;
    }
    // The reservation became the real spend; none is left behind.
    const left = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.ai_usage where feature = 'assistant' and input_tokens = 0 and output_tokens = 0`));
    expect(left!.n).toBe(0);
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
