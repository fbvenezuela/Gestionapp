import 'server-only';
import type { Session } from '../auth/session';
import { system } from './db';
import { env } from '../env';
import { notify, usersWithRole } from '../notify';
import { INVITABLE_ROLES, type Role } from '../roles';
import {
  AGENDA_FALLBACK,
  DEGRADED_TEXT,
  DEGRADED_UNNOTIFIED,
  LIMIT_TEXT,
  MAX_TOKENS,
  PROMISE_FALLBACK,
  asksRedesSection,
  breaksAgendaRule,
  filterOutput,
  guardQuestion,
  looksLikeText,
  modelTurn,
  promisesNotice,
  sectionFichas,
  type BrainOutput,
  type Ficha,
  type TurnContext,
} from './brain';
import { defaultProfile } from './config';
import { escalate as realEscalate } from './escalate';
import { aboutEvent, eventThread } from './events';
import { localTurn } from './local';
import { estimateCost, parseChain, type ChatOptions, type Link } from './providers';
import { hasPlaceOrContact, redact } from './redact';
import { concreteDateTime, hasPhone } from '../guides/check';
import { MESSAGES_MARK, messagesAsk } from './messages-ask';
import { pickGoTo, screenFor, type GoTo } from './screens';
import { MESSAGES_PER_HOUR, loadKnowledge, loadScripts, noteHeard, openTurn, saveTurn, type Reserve } from './store';
import { firstName } from './text';
import { NO_TITLES, Placeholders, loadTitles, titlesIn, type TitleSet } from './titles';
import { toolsFor, type EscalateFn, type ToolRun, type TutorialLink } from './tools';

export { escalate } from './escalate';

// One turn of the team assistant (manual §2, adapted): who asks → limits → context →
// thread → scripts → brain (model chain or the demo brain) → filter → server nets → save
// AFTER answering → answer. People's data is only read by the tools, as the person. The
// question itself is counted BEFORE the brain (openTurn), so parallel requests can't slip past
// the limits.

export const MAX_QUESTION = 1500;
// Who the assistant serves: the six team roles and Administración (the technical role).
export const TEAM_ROLES: Role[] = [...INVITABLE_ROLES];
// What a model turn may spend, reserved against the month's cap before asking and settled with the
// real numbers after. Each of its calls (3 rounds and the corrective one) resends the system prompt
// with the tool specs, the whole thread and the tool results so far. The thread is measured when the
// turn opens; the prompt (about 14.000 characters, fichas capped at 5.000) and the tool results (up
// to 4 per round, resent in the later calls) get a generous allowance. Still an estimate, on the safe
// side: 3 characters per token.
const MODEL_CALLS = 4;
const PROMPT_CHARS = 18_000;
const TOOL_RESULT_CHARS = 30_000;
const RESERVE_TOKENS_OUT = MODEL_CALLS * MAX_TOKENS;
export function reserveTokensIn(threadChars: number): number {
  return Math.ceil((MODEL_CALLS * (PROMPT_CHARS + threadChars) + TOOL_RESULT_CHARS) / 3);
}

// screen: the pattern of the screen the person is on (/eventos/[id]: never an id or the address), sent by the window.
export type TurnInput = { question: string; conversationId?: string | null; screen?: string | null };
export type TurnResult = {
  answer: string;
  scope: 'equipo';
  model: string;
  ms: number;
  degraded: boolean;
  did: { tool: string; error?: string }[];
  goTo: GoTo | null;
  // A tutorial of the person's to start («Ver el tutorial de Publicar»): href null when its screen needs an id (the
  // window builds it only when the person is already there).
  tutorial: TutorialLink | null;
  conversationId: string | null;
};
export type TurnDeps = { chain?: Link[]; chatOptions?: Partial<ChatOptions>; escalate?: EscalateFn };

/** The window's contract (Spanish keys, as the manual's window expects). */
export type ApiAnswer = {
  respuesta: string;
  ambito: 'equipo';
  modelo: string;
  ms: number;
  degradado: boolean;
  hizo: { tool: string; error?: string }[];
  ir: GoTo | null;
  tutorial: { id: string; etiqueta: string; href: string | null } | null;
  conversacion: string | null;
};

export function toApi(r: TurnResult): ApiAnswer {
  const tutorial = r.tutorial ? { id: r.tutorial.id, etiqueta: r.tutorial.label, href: r.tutorial.href } : null;
  return { respuesta: r.answer, ambito: r.scope, modelo: r.model, ms: r.ms, degradado: r.degraded, hizo: r.did, ir: r.goTo, tutorial, conversacion: r.conversationId };
}

/** The screen the window says the person is on, only when it is a pattern of SCREENS as it is (never an id). */
export function screenOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return screenFor(raw)?.href === raw ? raw : null;
}

// The fichas of the turn: the database's (null when they could not be read: the prompt says so), and the section
// cards of the role guides, which come from the code (brain.ts sectionFichas).
function withSections(knowledge: Ficha[] | null, roles: Role[]): Ficha[] | null {
  return knowledge === null ? null : [...knowledge, ...sectionFichas(roles)];
}

export function isTeamMember(s: Pick<Session, 'roles'>): boolean {
  return s.roles.some((r) => TEAM_ROLES.includes(r));
}

export async function handleTurn(session: Session, input: TurnInput, deps: TurnDeps = {}): Promise<TurnResult> {
  const t0 = Date.now();
  const escalateFn: EscalateFn = deps.escalate ?? realEscalate;
  const roles = session.roles.filter((r) => TEAM_ROLES.includes(r));
  const raw = String(input.question ?? '').trim().slice(0, MAX_QUESTION);
  // `routing` is only for the demo brain's own choices (never stored, never sent).
  const routing = redact(raw);
  const finish = (r: Omit<TurnResult, 'ms' | 'scope' | 'tutorial'> & { tutorial?: TutorialLink | null }): TurnResult => ({ tutorial: null, ...r, scope: 'equipo', ms: Date.now() - t0 });
  if (!routing) return finish({ answer: '¿Qué necesitas? Escríbeme tu pregunta.', model: 'local', degraded: false, did: [], goTo: null, conversationId: input.conversationId ?? null });
  const screen = screenOf(input.screen);
  // A question about what the team's messages say, or «dile a Kevin que…» (D-50, S8): 360 never reads or sends
  // messages. Neither its text nor a word of it is kept: it is stored as a mark, it stays out of «Lo que preguntan»,
  // and no provider gets it (the demo brain answers with the button to Mensajes).
  const aboutMessages = messagesAsk(routing);

  // With a model chain, the titles this person can see are read first, once, AS THE PERSON: a
  // question that names an event by its title is guarded like one with an event word, and on the
  // model path every title goes to the provider only as a placeholder. If they can't be read, no
  // model turn (the demo brain answers).
  const chain = deps.chain ?? parseChain(env.assistant.models);
  const titles: TitleSet | null = chain.length
    ? await loadTitles(session).catch((e) => {
        console.error('[asistente] no se pudieron leer los títulos:', (e as Error).message);
        return null;
      })
    : null;
  // `question` is what is stored, goes to «Lo que preguntan» and to a provider: about an event, its
  // places and days go too.
  const seen = titles ?? NO_TITLES;
  const question = aboutMessages ? MESSAGES_MARK : guardQuestion(routing, seen);
  // Lo que habla de un evento lo contesta 360 sin IA: a turn about an event (the shared detector,
  // events.ts, on what was typed) never goes to a provider, even with a model chain. The demo brain has
  // the event tools and the agenda refusal. Nothing is reserved for it.
  const eventTurn = aboutEvent(raw, seen) || aboutEvent(routing, seen);

  // The conversation, the hour's count and the question, in one short transaction BEFORE the
  // brain (escalating needs the conversation; parallel requests see the question). With a model
  // chain, the turn's estimated cost (at the dearest link, for this thread) is reserved against the
  // month's cap in that same step.
  const reserve: Reserve | null = chain.length && !eventTurn && !aboutMessages
    ? {
        provider: chain[0].provider,
        model: chain[0].raw,
        capUsd: env.ai.monthlyCapUsd,
        costFor: (threadChars) => Math.max(...chain.map((l) => estimateCost(l.raw, reserveTokensIn(threadChars), RESERVE_TOKENS_OUT))),
      }
    : null;
  const basics = await openTurn(session.userId, input.conversationId, question, reserve).catch((e) => {
    console.error('[asistente] no se pudo abrir el turno:', (e as Error).message);
    return null;
  });
  const conversationId = basics?.conversationId ?? null;
  const profile = basics?.profile;
  const history = basics?.history ?? [];
  const save = async (t: { answer: string; model: string; provider: string | null; tokensIn: number; tokensOut: number; error: string | null; degraded: boolean; calls: ToolRun[]; goTo: unknown }) => {
    const ms = Date.now() - t0;
    if (!conversationId) return ms;
    try {
      await saveTurn({
        conversationId,
        userId: session.userId,
        question,
        usageId: basics?.usageId ?? null,
        answer: t.answer,
        model: t.model,
        provider: t.provider,
        tokensIn: t.tokensIn,
        tokensOut: t.tokensOut,
        ms,
        error: t.error,
        degraded: t.degraded,
        tools: t.calls.map((c) => ({ tool: c.tool, ok: c.ok, ...(c.error ? { error: c.error } : {}) })),
        goTo: t.goTo,
      });
    } catch (e) {
      // The answer still goes out; the failure is written down, never swallowed.
      console.error('[asistente] no se pudo guardar el turno:', (e as Error).message);
    }
    return ms;
  };

  // Limit per person and hour: answered as the assistant, not as a breakdown.
  if (basics && basics.sentLastHour >= MESSAGES_PER_HOUR) {
    await save({ answer: LIMIT_TEXT, model: 'tope', provider: null, tokensIn: 0, tokensOut: 0, error: null, degraded: false, calls: [], goTo: null });
    return finish({ answer: LIMIT_TEXT, model: 'tope', degraded: false, did: [], goTo: null, conversationId });
  }

  const brand = basics?.brand ?? {};
  const prof = profile ?? defaultProfile();
  const name = prof.name;
  const ctx: TurnContext = {
    profile: prof,
    huecos: { name, app: brand.shortName || brand.appName || 'la plataforma', boss: brand.bossLabel || 'el jefe', person: firstName(session.name) },
    roles,
    personName: session.name,
    knowledge: withSections(await loadKnowledge(roles), roles),
    // Chosen by what was asked (the words the masking took count too; nothing of it is stored or sent).
    scripts: await loadScripts([routing, ...history.filter((h) => h.who === 'persona').slice(-2).map((h) => h.body)].join(' '), roles),
    history,
    screen,
  };
  if (!aboutMessages) await noteHeard(question, roles[0] ?? null);

  // Only a turn with its reservation and the titles asks the model, and never one about an event: this
  // question, or one that goes on with a thread about one («¿y a qué hora?», «¿y quién la cubre?» after
  // «¿cómo va la feria?»; events.ts eventThread). Over
  // the monthly AI cap (or if the turn could not be counted, or the titles not read) the demo brain
  // answers (it costs nothing): never a breakdown (the reservation is released when saving).
  const thread = eventThread([...history.filter((h) => h.who === 'persona').map((h) => h.body), question], seen);
  const useModel = !!basics?.usageId && !!titles && !eventTurn && !thread.at(-1) && !aboutMessages;
  const tools = toolsFor(roles, !!conversationId);
  const toolCtx = { session, conversationId, escalate: escalateFn };

  let out: BrainOutput = { text: '', model: useModel ? '' : 'local', provider: null, tokensIn: 0, tokensOut: 0, calls: [] };
  let error: string | null = null;
  try {
    out = useModel
      ? await modelTurn({ ctx, question, typed: raw, tools, toolCtx, chain, chatOptions: deps.chatOptions, titles: titles ?? undefined })
      : await localTurn({ ctx, question: routing, typed: raw, tools, toolCtx });
  } catch (e) {
    error = String((e as Error)?.message ?? e).slice(0, 1000);
    const partial = (e as { partial?: BrainOutput }).partial;
    if (partial) out = partial;
    console.error('[asistente] sin respuesta:', error);
  }

  // On the model path the answer still carries the titles' placeholders: the filter and the nets look
  // at it like that (a title the person can see is not a when), and the names come back at the end.
  const shown = (t: string) => (out.restore ? out.restore(t) : t);
  let answer = out.text ? filterOutput(out.text, name) : '';
  let degraded = false;
  if (!answer || !looksLikeText(shown(answer))) {
    // Honest degraded answer, marked, and the team is told (if telling fails, we don't say we did).
    degraded = true;
    error = error ?? (answer ? `respuesta que no parece texto: ${answer.slice(0, 80)}` : 'respuesta vacía');
    answer = DEGRADED_UNNOTIFIED;
    if (conversationId) {
      try {
        await escalateFn(conversationId, 'El asistente no pudo contestar bien.');
        answer = DEGRADED_TEXT;
      } catch (e) {
        console.error('[asistente] no se pudo avisar del fallo:', (e as Error).message);
      }
    }
  } else {
    // The agenda rule, once more in code: an answer about events never carries a date, time, day,
    // place or contact. The demo brain quotes the titles it looked up as they are (the person can see
    // them): those are masked for this check, like the model's placeholders.
    const checked = out.restore ? answer : new Placeholders({ events: titlesIn(out.calls), pieces: [], places: [] }).mask(answer);
    // One of 360's answers (static help text: «Hoy en la agenda», «de noche» in «Horas de silencio», «de 2 a 3 por día»)
    // breaks the rule only with a concrete date, time, map, phone, place or contact in it, by the same check its content
    // test uses (guides/check); anything else, by the whole net.
    const breaks = out.fixed ? concreteDateTime(checked) || hasPhone(checked) || hasPlaceOrContact(checked) : breaksAgendaRule(checked, question, out.calls, seen, { answerToo: !!out.restore, sectionAsk: asksRedesSection(routing, seen) });
    if (breaks) answer = AGENDA_FALLBACK;
    // The promise net: says it told the team but avisar_al_equipo did not succeed → the server
    // tells them; if that fails too, the sentence changes (promising and not keeping is worse).
    const told = out.calls.some((c) => c.tool === 'avisar_al_equipo' && c.ok);
    if (!told && promisesNotice(answer)) {
      let ok = false;
      if (conversationId) {
        try {
          await escalateFn(conversationId, 'Lo prometió el asistente en la conversación.');
          ok = true;
          out.calls.push({ tool: 'avisar_al_equipo', ok: true, result: { por: 'servidor' } });
        } catch (e) {
          console.error('[asistente] no se pudo cumplir el aviso prometido:', (e as Error).message);
        }
      }
      if (!ok) answer = PROMISE_FALLBACK;
    }
  }

  if (!degraded) answer = shown(answer);
  // A tutorial to start: the one the demo brain chose, or (the model) the last one ver_tutorial gave for one screen.
  // Its button replaces «Ir a…» (both would lead to the same screen).
  const fromTool = out.model === 'local' ? null : out.calls.filter((c) => c.ok && c.tutorial).at(-1)?.tutorial;
  const tutorial = degraded ? null : (out.tutorial ?? fromTool ?? null);
  const goTo = degraded || tutorial
    ? null
    : pickGoTo(session.roles, { toolHrefs: [out.goTo, ...out.calls.filter((c) => c.ok).map((c) => c.goTo).reverse()], answer, question });
  const model = degraded && !out.model ? 'ninguno' : out.model || 'local';
  await save({ answer, model, provider: out.provider, tokensIn: out.tokensIn, tokensOut: out.tokensOut, error, degraded, calls: out.calls, goTo: tutorial ? { href: tutorial.href, label: tutorial.label, tutorial: tutorial.id } : goTo });
  return finish({
    answer,
    model,
    degraded,
    did: out.calls.map((c) => (c.ok ? { tool: c.tool } : { tool: c.tool, error: c.error })),
    goTo,
    tutorial,
    conversationId,
  });
}

// ---------------------------------------------------------------------------
// Health (for /api/cron/tick): if in the last hour more than 20 % of the answers came out
// degraded, tell administration — at most once every 6 hours. Small samples (< 3) don't count.
// ---------------------------------------------------------------------------
export const HEALTH_KIND = 'assistant_health';

export async function assistantHealthCheck(): Promise<{ answers: number; degraded: number; ratio: number; notified: boolean }> {
  const s = await system(async (sql) => {
    const r = await sql.one<{ total: number; bad: number }>(
      `select count(*)::int as total, count(*) filter (where degraded)::int as bad
         from public.assistant_messages where who = 'asistente' and created_at > now() - interval '1 hour'`,
    );
    const last = await sql.one<{ n: number }>(
      `select count(*)::int as n from public.notifications where kind = $1 and created_at > now() - interval '6 hours'`,
      [HEALTH_KIND],
    );
    return { total: r?.total ?? 0, bad: r?.bad ?? 0, recent: (last?.n ?? 0) > 0 };
  });
  const ratio = s.total ? s.bad / s.total : 0;
  let notified = false;
  if (s.total >= 3 && ratio > 0.2 && !s.recent) {
    const admins = await usersWithRole('admin');
    if (admins.length) {
      await notify({
        userIds: admins,
        kind: HEALTH_KIND,
        title: 'El asistente está fallando',
        body: `En la última hora, ${s.bad} de ${s.total} respuestas salieron degradadas. Revisa Ajustes → Asistente → Cómo va.`,
        link: '/ajustes/asistente',
        key: `assistant-health:${Math.floor(Date.now() / 3_600_000)}`,
        email: true,
      });
      notified = true;
    }
  }
  return { answers: s.total, degraded: s.bad, ratio, notified };
}
