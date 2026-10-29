// 360 and R3 (design §8): it knows the screen the person is on, starts tutorials, answers «¿qué hago aquí?» with the
// role guide's section, and NEVER reads or sends the team's messages. Through the demo brain (no AI, as the real demo)
// on the demo database, and on the model path with a fake provider. Its own file: each file has its own demo database,
// and every turn counts against the person's hourly limit. Invented data.
import { describe, it, expect, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn, screenOf } from '@/lib/assistant';
import { heardGrouped } from '@/lib/assistant/admin';
import { sectionFichas, sectionKey, systemPrompt, type TurnContext } from '@/lib/assistant/brain';
import { defaultProfile } from '@/lib/assistant/config';
import { MESSAGES_MARK, asksHowToWrite, messagesAsk } from '@/lib/assistant/messages-ask';
import { parseChain } from '@/lib/assistant/providers';
import { TOOLS, runTool, toursOn, tutorialLabel } from '@/lib/assistant/tools';
import { roleTasks, taskAnswer, taskFor } from '@/lib/assistant/guide-help';
import { NOT_SURE } from '@/lib/assistant/local';
import { TOURS } from '@/lib/guides';

function sessionOf(key: DemoUserKey, viewAs: Role | null = null): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs };
}

// tool: a tool it must use; notTool: one it must not use; go: the «Ir a» screen; has: words the answer must carry;
// screen: the pattern the window sends; tutorial: the tutorial its button starts (null: no tutorial button).
type Expect = { has?: RegExp; tool?: string; notTool?: string; go?: string; screen?: string; tutorial?: string | null };
const READ_MSG: Expect = { has: /^No leo los mensajes del equipo/, go: '/mensajes', notTool: 'avisar_al_equipo', tutorial: null };
const TELL_MSG: Expect = { has: /^Eso se lo escribes tú en Mensajes/, go: '/mensajes/nueva', notTool: 'avisar_al_equipo', tutorial: null };
const HOW_MSG: Expect = { has: /«Escribirle a alguien»/, go: '/mensajes/nueva' };
const SHOW = (tutorial: string, screen?: string): Expect => ({ tool: 'ver_tutorial', tutorial, has: /paso a paso/, ...(screen ? { screen } : {}) });

const TABLE: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  admin: [
    // An account with Administración is out of Mensajes (D-49); it has no tutorials (its guide is in Ayuda y guías).
    ['¿Qué me escribió Daniela?', { has: /una cuenta con administración no entra/, notTool: 'avisar_al_equipo' }],
    ['dile a Kevin que ya subí la pieza', { has: /una cuenta con administración no entra/, notTool: 'avisar_al_equipo' }],
    ['necesito ayuda', { has: /Ayuda y guías/, go: '/ayuda', tutorial: null }],
  ],
  boss: [
    ['¿Qué se hace en la pantalla de Política?', { tutorial: 'jefe-politica', has: /despacho/ }],
    ['muéstrame cómo se usa Publicar', SHOW('publicar')],
    ['¿qué hago aquí?', { screen: '/aprobar', tutorial: 'aprobar', has: /aprobación/ }],
    ['necesito ayuda', SHOW('jefe-inicio', '/jefe')],
    ['tutorial de la agenda', SHOW('agenda-calendario')],
    ['¿qué me escribió Daniela?', READ_MSG],
    ['dile a Kevin que ya subí la pieza', TELL_MSG],
    ['¿cómo le escribo a Redes?', HOW_MSG],
    ['hazme la tarea', { has: /se me escapa|no opino/ }],
    ['¿cómo decido quién habla con quién?', { go: '/ayuda/jefe?ver=pasos', has: /^Decidir quién habla con quién, paso a paso/ }],
    // Still the notice the boss prepares (step 4), not a message; still support for administración.
    ['avísale a Redes que suban el material de la feria', { tool: 'preparar_aviso', notTool: 'ver_tutorial' }],
  ],
  dispatch: [
    ['tutorial de la agenda', SHOW('agenda-calendario')],
    ['¿qué hago aquí?', { screen: '/agenda/por-fecha', tutorial: 'por-fecha', has: /esperan fecha/ }],
    ['¿Me muestras cómo se usa esta pantalla?', SHOW('evento-despacho', '/eventos/[id]')],
    ['pregúntale a Rubén si ya tiene la ficha', TELL_MSG],
    // Not a screen nor a tutorial word: today's answers stay.
    ['¿Cómo asigno a quien graba?', { has: /Quién graba/, tutorial: null }],
  ],
  politics: [
    // «¿Cómo hago X?» with the role guide's «Paso a paso» (guide-help.ts), with its tutorial or the guide.
    ['¿Cómo cargo una ficha comunitaria?', { tutorial: 'nueva-comunitaria', has: /^Cargar una ficha comunitaria, paso a paso: 1\) «Nueva ficha comunitaria»/ }],
    ['¿cómo le doy seguimiento a una ficha?', { tutorial: null, go: '/ayuda/politica?ver=pasos', has: /^Darle seguimiento a una ficha, paso a paso: 1\)/ }],
    ['¿qué hago aquí?', { screen: '/municipios', tutorial: 'municipios', has: /municipio/ }],
    ['muéstrame cómo se usa Publicar', { has: /no es de tu rol/, tutorial: null }],
    ['necesito ayuda', SHOW('municipios', '/municipios')],
    ['léeme los mensajes del grupo', READ_MSG],
  ],
  ivt: [
    ['necesito ayuda', SHOW('obras', '/obras')],
    // A screen with an id: the button is drawn by the window, on that screen (href null).
    ['¿qué hago aquí?', { screen: '/obras/[id]', tutorial: 'ficha-obra', has: /obra/ }],
    ['¿cómo armo un grupo?', HOW_MSG],
  ],
  social: [
    ['muéstrame cómo se usa Publicar', SHOW('publicar')],
    ['enséñame a usar Publicar', SHOW('publicar')],
    // «Piezas» became Redes by format (R4): a section has its tutorial; «Piezas» names the board.
    ['¿Cómo funciona esta pantalla?', { screen: '/redes/[formato]', tutorial: 'redes-seccion', has: /Nuevo mes/ }],
    ['¿Qué hago en Piezas?', { tutorial: 'redes', has: /Tablero/ }],
    ['necesito ayuda', SHOW('hoy-redes', '/hoy')],
    ['tutorial de la agenda', SHOW('agenda-redes')],
    ['¿Hay tutoriales?', { tool: 'ver_tutorial', has: /Puedo mostrarte, paso a paso: «Bienvenida»/, tutorial: null }],
    // The window sends the pattern only (never the tab): the event's own tutorial, from its first tab.
    ['¿Me muestras cómo se usa esta pantalla?', SHOW('evento-redes', '/eventos/[id]')],
    ['¿qué me quiso decir Kevin con eso?', READ_MSG],
    ['mándale un mensaje a Rubén', TELL_MSG],
    ['¿quién puede leer mis mensajes?', { has: /El jefe puede leer todas las conversaciones/ }],
    // A how-to of a thing, not of a screen: the ficha, as before.
    ['¿cómo funciona el semáforo?', { has: /Todo lo aprueba el jefe/, tutorial: null }],
  ],
  camera: [
    ['muéstrame cómo se usa esta pantalla', SHOW('evento-grabacion', '/eventos/[id]')],
    ['¿qué hago aquí?', { screen: '/hoy', tutorial: 'hoy-grabacion', has: /subir/ }],
    ['¿qué dice el mensaje de Daniela?', READ_MSG],
    // About an event: the agenda's answer, never a tutorial (a recorrido is an event too).
    ['¿A qué hora es el recorrido del puente?', { has: /no lo manejo|no la tengo/, tutorial: null }],
  ],
};

describe('360 sabe la pantalla, arranca tutoriales y contesta con la guía (cerebro de demostración)', () => {
  for (const [role, rows] of Object.entries(TABLE) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: cada pregunta tiene su tutorial, su pantalla o su respuesta`, async () => {
      for (const [q, e] of rows) {
        const r = await handleTurn(sessionOf(role), { question: q, screen: e.screen ?? null }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer}`;
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        expect(r.answer, who).not.toBe(NOT_SURE);
        const tools = r.did.map((d) => d.tool);
        if (e.tool) expect(tools, who).toContain(e.tool);
        if (e.notTool) expect(tools, who).not.toContain(e.notTool);
        if (e.go) expect(r.goTo?.href, who).toBe(e.go);
        if (e.has) expect(r.answer, who).toMatch(e.has);
        if (e.tutorial !== undefined) expect(r.tutorial?.id ?? null, who).toBe(e.tutorial);
        // A tutorial button replaces «Ir a…»; its address is its screen's, with ?tutorial=<id> (null for a screen with
        // an id: the window builds it only there).
        if (r.tutorial) {
          expect(r.goTo, who).toBeNull();
          if (r.tutorial.href) expect(r.tutorial.href, who).toMatch(new RegExp(`^/[a-z/-]*\\?(?:tab=[a-z]+&)?tutorial=${r.tutorial.id}$`));
          else expect(TOURS.find((t) => t.id === r.tutorial!.id)?.screen, who).toContain('[');
          expect(r.tutorial.label, who).toMatch(/^Ver el tutorial/);
        }
      }
    });
  }
});

describe('360 nunca lee ni manda mensajes (D-50, S8)', () => {
  it('reconoce lo que pide leer o mandar un mensaje, y no confunde el aviso de un rol ni el soporte', () => {
    for (const q of ['¿Qué me escribió Daniela?', 'léeme los mensajes', 'resúmeme la conversación con Rubén', '¿qué me quiso decir Daniela con "ya está"?', '¿Qué dice el mensaje de Kevin?', '¿puedes leer mis mensajes?']) {
      expect(messagesAsk(q), q).toBe('read');
    }
    for (const q of ['dile a Kevin que ya subí la pieza', 'mándale un mensaje a Daniela', 'pregúntale a Rubén si ya tiene la ficha', 'avísale a Kevin por mensaje', 'escríbele al jefe que ya está']) {
      expect(messagesAsk(q), q).toBe('tell');
    }
    for (const q of ['¿el jefe lee los mensajes?', '¿quién puede leer mis mensajes?', '¿dónde leo los mensajes?', '¿qué significa Mensaje oculto?', 'avisa a Redes que suban el material', 'mándales un aviso a todos', 'dile a administración que no puedo entrar', '¿qué dice el semáforo?', '¿qué me mandaron a grabar?', '¿Cómo hago los copies?']) {
      expect(messagesAsk(q), q).toBeNull();
    }
    for (const q of ['¿Cómo le escribo a Redes?', '¿Cómo mando un mensaje?', '¿cómo armo un grupo?', '¿cómo hablo por la red interna?']) expect(asksHowToWrite(q), q).toBe(true);
    for (const q of ['¿Cómo escribo con la voz?', '¿cómo le mando la pieza al jefe?', '¿Cómo hago los copies?', 'dile a Kevin que ya está']) expect(asksHowToWrite(q), q).toBe(false);
  });

  it('la pregunta se guarda como «[pregunta sobre Mensajes]», sin su texto, fuera de «Lo que preguntan», y nunca escala', async () => {
    const s = sessionOf('social2');
    const before = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation'`));
    const asked = ['¿qué me escribió la persona de Grabación sobre la cancha de El Mirador?', 'dile a la persona de Despacho que la ficha del asfaltado ya está'];
    for (const q of asked) {
      const r = await handleTurn(s, { question: q }, { chain: [] });
      expect(r.answer).toMatch(/Mensajes/);
      expect(r.answer).not.toMatch(/cancha|asfaltado|Mirador/);
      const rows = await withSystem((sql) =>
        sql.query<{ who: string; body: string; title: string }>(
          `select m.who, m.body, c.title from public.assistant_messages m join public.assistant_conversations c on c.id = m.conversation_id where c.id = $1 order by m.created_at`,
          [r.conversationId],
        ),
      );
      expect(rows.find((x) => x.who === 'persona')?.body).toBe(MESSAGES_MARK);
      expect(rows[0].title).toBe(MESSAGES_MARK);
      for (const x of rows) expect(`${x.body} ${x.title}`).not.toMatch(/cancha|asfaltado|Mirador|Grabación|Despacho/);
    }
    const heard = await withSystem((sql) => sql.query<{ text: string }>(`select text from public.assistant_heard`));
    for (const h of heard) expect(h.text).not.toMatch(/cancha de El Mirador|asfaltado ya está|Mensajes\]/);
    const grouped = await heardGrouped(sessionOf('admin'), { days: 1 });
    for (const g of grouped) expect(g.sample).not.toBe(MESSAGES_MARK);
    const after = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_escalation'`));
    expect(after?.n).toBe(before?.n);
  });

  it('con modelo: esas preguntas no le llegan al proveedor (contesta 360 sin IA)', async () => {
    process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const r = await handleTurn(sessionOf('camera2'), { question: '¿qué me escribió Daniela del parque?' }, { chain: parseChain('groq:llama-3.3-70b'), chatOptions: { fetchImpl } });
    expect(r.model).toBe('local');
    expect(r.answer).toMatch(/^No leo los mensajes del equipo/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('la pantalla y la herramienta ver_tutorial', () => {
  it('solo un patrón de SCREENS tal cual: nunca un id ni una dirección', () => {
    expect(screenOf('/eventos/[id]')).toBe('/eventos/[id]');
    expect(screenOf('/publicar')).toBe('/publicar');
    expect(screenOf('/ayuda/[id]')).toBe('/ayuda/[id]');
    for (const bad of ['/eventos/123e4567-e89b-42d3-a456-426614174000', '/no-existe', '/publicar?tab=x', '', null, undefined]) expect(screenOf(bad), String(bad)).toBeNull();
  });

  it('la ofrece a todos y no lee la base; los tutoriales siguen «Ver como» y su pantalla tiene que abrir', async () => {
    const tool = TOOLS.find((t) => t.name === 'ver_tutorial')!;
    expect(tool.roles).toBeNull();
    expect(tool.level).toBe('cuenta');
    const ctx = (s: Session) => ({ session: s, conversationId: null, escalate: async () => ({ alreadyNotified: false, to: [] }) });
    const ids = async (s: Session, args: Record<string, unknown> = {}) => ((await runTool('ver_tutorial', args, TOOLS, ctx(s))).result as { tutoriales: { id: string }[] }).tutoriales.map((t) => t.id);
    // Administración alone: no tutorials. Viewing as Redes: Redes' (Mensajes' never for an account with admin).
    expect(await ids(sessionOf('admin'))).toEqual([]);
    const asSocial = await ids(sessionOf('admin', 'social'));
    expect(asSocial.slice(0, 2)).toEqual(['bienvenida', 'hoy-redes']); // the welcome one, then the role's own first
    const chat = (s: Session) => runTool('ver_tutorial', { pantalla: '/mensajes' }, TOOLS, ctx(s));
    expect((await chat(sessionOf('admin', 'social'))).tutorial ?? null).toBeNull();
    expect((await chat(sessionOf('social'))).tutorial?.id).toBe('mensajes');
    // A screen with an id: no address (the window builds it on that screen).
    const ev = await runTool('ver_tutorial', { pantalla: '/eventos/[id]' }, TOOLS, ctx(sessionOf('camera')));
    expect(ev.tutorial).toEqual({ id: 'evento-grabacion', label: 'Ver el tutorial de un evento', href: null });
    expect(ev.goTo).toBeNull();
    const pub = await runTool('ver_tutorial', { pantalla: '/publicar' }, TOOLS, ctx(sessionOf('social')));
    expect(pub.tutorial).toEqual({ id: 'publicar', label: 'Ver el tutorial de Publicar', href: '/publicar?tutorial=publicar' });
    // Not of this role: nothing.
    expect((await runTool('ver_tutorial', { pantalla: '/publicar' }, TOOLS, ctx(sessionOf('politics')))).tutorial ?? null).toBeNull();
    // By id, only one of the person's.
    expect((await runTool('ver_tutorial', { tutorial: 'bienvenida' }, TOOLS, ctx(sessionOf('ivt')))).tutorial?.href).toBe('/obras?tutorial=bienvenida');
    expect((await runTool('ver_tutorial', { tutorial: 'publicar' }, TOOLS, ctx(sessionOf('ivt')))).tutorial ?? null).toBeNull();
  });

  it('en una pantalla: el suyo primero, luego el de una pestaña, luego la bienvenida en el inicio', () => {
    const mine = TOURS.filter((t) => t.roles.includes('social'));
    expect(toursOn(mine, '/hoy', '/hoy').map((t) => t.id)).toEqual(['hoy-redes', 'bienvenida']);
    expect(toursOn(mine, '/eventos/[id]', '/hoy').map((t) => t.id)[0]).toBe('evento-redes');
    expect(tutorialLabel('Cómo se usa el modo lectura')).toBe('Ver el tutorial del modo lectura');
    expect(tutorialLabel('Bienvenida')).toBe('Ver el tutorial: Bienvenida');
  });

  it('con modelo: el prompt dice la pantalla y lleva solo la ficha de esa pantalla, y que no lee mensajes', () => {
    const roles: Role[] = ['social'];
    const knowledge = sectionFichas(roles);
    expect(knowledge.length).toBeGreaterThan(5);
    expect(knowledge.every((f) => f.key?.endsWith(':social'))).toBe(true);
    const ctx: TurnContext = {
      profile: defaultProfile(),
      huecos: { name: 'Asistente', app: 'la plataforma', boss: 'el jefe', person: 'Ana' },
      roles,
      personName: 'Ana Prueba',
      knowledge,
      scripts: [],
      history: [],
      screen: '/redes',
    };
    const p = systemPrompt(ctx, [], '¿qué hago aquí?');
    expect(p).toContain('Está en la pantalla «Redes» (/redes)');
    expect(systemPrompt({ ...ctx, screen: '/eventos/[id]' }, [], 'x')).toContain('Está en la pantalla de una sola cosa, /eventos/[id].');
    expect(p).toContain('No lees ni mandas los mensajes del equipo');
    const piezas = knowledge.find((f) => f.key === sectionKey('/redes', 'social'))!;
    expect(p).toContain(piezas.title);
    const other = knowledge.find((f) => f.key === sectionKey('/publicar', 'social'))!;
    expect(p).not.toContain(other.title);
    expect(systemPrompt({ ...ctx, screen: null }, [], '¿qué hago aquí?')).not.toContain(piezas.title);
  });
});

describe('«¿cómo hago X?» con la guía del rol', () => {
  it('la tarea cuyo título dice todo lo preguntado (dos palabras o más), de las guías de la persona', () => {
    expect(taskFor('¿Cómo cargo una ficha comunitaria?', ['politics'])?.id).toBe('nueva-ficha');
    expect(taskFor('¿Cómo cargo una ficha comunitaria?', ['social'])).toBeNull();
    expect(taskFor('¿cómo cargo?', ['politics'])).toBeNull();
    expect(roleTasks(['politics', 'ivt']).map((t) => t.role)).toEqual(expect.arrayContaining(['politics', 'ivt']));
    for (const t of roleTasks(['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'])) {
      const a = taskAnswer(t);
      expect(a.length, t.id).toBeLessThanOrEqual(t.title.length + 480);
      expect(a, t.id).toMatch(/paso a paso: 1\) /);
    }
  });
});

describe('con modelo: el botón del tutorial que trae ver_tutorial', () => {
  it('el modelo pide el tutorial de la pantalla y la respuesta trae su botón, sin «Ir a…»', async () => {
    process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      const message = n === 1
        ? { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ver_tutorial', arguments: JSON.stringify({ pantalla: '/publicar' }) } }] }
        : { content: 'Te lo muestro paso a paso: toca el botón.' };
      return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 10 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const r = await handleTurn(sessionOf('social2'), { question: 'quiero aprender a usar la pantalla de publicar', screen: '/publicar' }, { chain: parseChain('groq:llama-3.3-70b'), chatOptions: { fetchImpl } });
    expect(r.model).not.toBe('local');
    expect(r.did.map((d) => d.tool)).toContain('ver_tutorial');
    expect(r.tutorial).toEqual({ id: 'publicar', label: 'Ver el tutorial de Publicar', href: '/publicar?tutorial=publicar' });
    expect(r.goTo).toBeNull();
  });
});
