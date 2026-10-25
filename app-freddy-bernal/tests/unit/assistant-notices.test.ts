// A notice to a whole role (round 3 of the review): whatever it says, it carries no day, relative
// day, hour, part of the day, date, place or contact beyond a deadline for the team's own work; about
// an event (an event word, a title this person can see, the boss or who records), no place said by its
// name either. Every notice that got through is refused by the demo brain, by the model's tool and when
// administración confirms. Its own file: each path runs one turn per notice, and the demo database of
// a test file counts every turn against the hourly limit of the person who asks.
// Demo database (PGlite, invented data); only the session, Next's cache and the provider are faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const { handleTurn } = await import('@/lib/assistant');
const { withSystem } = await import('@/lib/db');
const { parseChain } = await import('@/lib/assistant/providers');
const { noticeIssues } = await import('@/lib/assistant/guard');

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: true, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const A = sessionOf('admin');
const LOCAL = { chain: [] };
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';

beforeEach(() => {
  state.session = A;
});

function toolCallingProvider(texto: string) {
  const seen: { messages: { role: string; content: string | null }[] }[] = [];
  const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)));
    const message = seen.length === 1
      ? { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'preparar_aviso', arguments: JSON.stringify({ rol: 'social', texto }) } }] }
      : { content: 'No lo pude preparar: el aviso no puede llevar eso.' };
    return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const draftsOf = (conversationId: string | null) => withSystem((sql) => sql.query<{ body: string }>(`select body from public.assistant_drafts where conversation_id = $1`, [conversationId]));
const makeDraft = (body: string) =>
  withSystem((sql) => sql.one<{ id: string }>(`insert into public.assistant_drafts (kind, created_by, summary, body, target) values ('aviso', $1, 'Aviso para Redes', $2, '{"role":"social"}'::jsonb) returning id`, [A.userId, body]));
const statusOf = async (id: string) => (await withSystem((sql) => sql.one<{ status: string }>(`select status from public.assistant_drafts where id = $1`, [id])))!.status;
const noticesSent = async () => (await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_notice'`)))!.n;

// What got through: relative days, loose hours, a landmark after any word or with no article, a place
// by its name, an ordinal date, the boss or who records, no event word at all.
const LEAKY_NOTICES: [string, string[]][] = [
  ['el acto de Rubio es en dos días', ['la fecha']],
  ['la caravana sale de la plaza Bolívar', ['el lugar']],
  ['Tariba es mañana 9 am frente a la plaza Bolívar', ['el día', 'la hora', 'el lugar']],
  ['la feria arranca 8 y pico', ['la hora']],
  ['el recorrido sale tempranito', ['la hora']],
  ['concentración de la caravana en plaza Bolívar', ['el lugar']],
  ['la feria es en plaza Bolívar', ['el lugar']],
  ['punto de encuentro de la caravana: plaza Bolívar', ['el lugar']],
  ['la entrega es en el urbanismo Nuevo Amanecer', ['el lugar']],
  ['Equipo: la feria es el 1ro nov.', ['la fecha']],
  ['Equipo: el acto es el 1ro nov, suban todo.', ['la fecha']],
  ['Equipo: el jefe estará el sábado en Pueblo Nuevo.', ['el día', 'el lugar']],
  ['Equipo: el acto es en la Hacienda El Trapiche.', ['el lugar']],
  ['Equipo: la caravana sale desde la plaza Bolívar, suban fotos.', ['el lugar']],
  ['Equipo: salimos a grabar pasado mañana temprano desde la plaza Bolívar, lleven baterías.', ['el día', 'la hora', 'el lugar']],
  ['la jornada se hace el sábado', ['el día']],
  ['la jornada se mudó al sábado', ['el día']],
  ['la feria arranca 9 menos cuarto', ['la hora']],
  ['la feria es en 3 días', ['la fecha']],
  ['la feria es dentro de dos días', ['la fecha']],
  ['la feria es el día primero', ['la fecha']],
  ['la feria es de noche', ['la hora']],
  ['la feria es el 1° nov', ['la fecha']],
  ['la feria arranca 8', ['la hora']],
];

describe('avisos a todo un rol: lo que se colaba (ronda 3)', () => {
  it('la revisión compartida ve cada uno, con o sin palabra de evento', () => {
    for (const [text, issues] of LEAKY_NOTICES) expect(noticeIssues(text), text).toEqual(issues);
  });

  it('cerebro de demostración: no prepara ninguno', async () => {
    for (const [text] of LEAKY_NOTICES) {
      const r = await handleTurn(A, { question: `prepara un aviso a redes que ${text}` }, LOCAL);
      expect(r.did, text).toEqual([]);
      expect(r.answer, text).toMatch(/^Un aviso no puede llevar la fecha, la hora, el día, el lugar ni los contactos de un evento/);
      expect(await draftsOf(r.conversationId), text).toEqual([]);
    }
    // A day for the team's work still goes.
    expect((await handleTurn(A, { question: 'prepara un aviso a redes que suban hoy las fotos de la jornada' }, LOCAL)).did).toEqual([{ tool: 'preparar_aviso' }]);
  });

  it('con modelo: preparar_aviso se niega y el modelo lee por qué; nada queda por confirmar', async () => {
    for (const [text] of LEAKY_NOTICES) {
      const p = toolCallingProvider(text);
      const r = await handleTurn(sessionOf('supervisor'), { question: 'prepara un aviso a redes' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(r.did, text).toEqual([{ tool: 'preparar_aviso', error: expect.stringMatching(/^Ese aviso trae .*solo va en la Agenda/) }]);
      expect(p.seen[1].messages.find((m) => m.role === 'tool')!.content, text).toMatch(/^\{"error":"Ese aviso trae /);
      expect(await draftsOf(r.conversationId), text).toEqual([]);
    }
  });

  it('al confirmar: un borrador de antes con cualquiera de ellos no sale y queda pendiente', async () => {
    const before = await noticesSent();
    for (const [text] of LEAKY_NOTICES) {
      const d = (await makeDraft(text))!;
      const r = await actions.confirmAssistantDraft({ id: d.id });
      expect(r, text).toMatchObject({ ok: false, error: expect.stringMatching(/^No se mandó: el aviso trae .*solo va en la Agenda/) });
      expect(await statusOf(d.id), text).toBe('pendiente');
    }
    expect(await noticesSent()).toBe(before);
    // A team deadline still goes.
    const ok = (await makeDraft('Suban el material de la feria antes de las [hora]'))!;
    expect(await actions.confirmAssistantDraft({ id: ok.id })).toMatchObject({ ok: true, data: { sent: 2 } });
  });
});
