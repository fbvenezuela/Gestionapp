import 'server-only';
import type { Session } from '../auth/session';
import { withSystem } from '../db';
import { env } from '../env';
import { notify, usersWithRole } from '../notify';
import { INVITABLE_ROLES, type Role } from '../roles';
import {
  AGENDA_FALLBACK,
  DEGRADED_TEXT,
  DEGRADED_UNNOTIFIED,
  LIMIT_TEXT,
  PROMISE_FALLBACK,
  breaksAgendaRule,
  filterOutput,
  looksLikeText,
  modelTurn,
  promisesNotice,
  type BrainOutput,
  type TurnContext,
} from './brain';
import { defaultProfile } from './config';
import { escalate as realEscalate } from './escalate';
import { localTurn } from './local';
import { parseChain, type ChatOptions, type Link } from './providers';
import { redact } from './redact';
import { pickGoTo, type GoTo } from './screens';
import { MESSAGES_PER_HOUR, ensureConversation, loadBasics, loadKnowledge, loadScripts, monthSpend, noteHeard, saveTurn } from './store';
import { firstName } from './text';
import { toolsFor, type EscalateFn, type ToolRun } from './tools';

export { escalate } from './escalate';

// One turn of the team assistant (manual §2, adapted): who asks → limits → context →
// thread → scripts → brain (model chain or the demo brain) → filter → server nets → save
// AFTER answering → answer. People's data is only read by the tools, as the person.

export const MAX_QUESTION = 1500;
export const TEAM_ROLES: Role[] = INVITABLE_ROLES;

export type TurnInput = { question: string; conversationId?: string | null };
export type TurnResult = {
  answer: string;
  scope: 'equipo';
  model: string;
  ms: number;
  degraded: boolean;
  did: { tool: string; error?: string }[];
  goTo: GoTo | null;
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
  conversacion: string | null;
};

export function toApi(r: TurnResult): ApiAnswer {
  return { respuesta: r.answer, ambito: r.scope, modelo: r.model, ms: r.ms, degradado: r.degraded, hizo: r.did, ir: r.goTo, conversacion: r.conversationId };
}

export function isTeamMember(s: Pick<Session, 'roles'>): boolean {
  return s.roles.some((r) => TEAM_ROLES.includes(r));
}

export async function handleTurn(session: Session, input: TurnInput, deps: TurnDeps = {}): Promise<TurnResult> {
  const t0 = Date.now();
  const escalateFn: EscalateFn = deps.escalate ?? realEscalate;
  const roles = session.roles.filter((r) => TEAM_ROLES.includes(r));
  const raw = String(input.question ?? '').trim().slice(0, MAX_QUESTION);
  const question = redact(raw);
  const finish = (r: Omit<TurnResult, 'ms' | 'scope'>): TurnResult => ({ ...r, scope: 'equipo', ms: Date.now() - t0 });
  if (!question) return finish({ answer: '¿Qué necesitas? Escríbeme tu pregunta.', model: 'local', degraded: false, did: [], goTo: null, conversationId: input.conversationId ?? null });

  // The conversation is opened first (escalating needs it); messages are saved at the end.
  let conversationId: string | null = null;
  try {
    conversationId = await ensureConversation(session.userId, input.conversationId, question);
  } catch (e) {
    console.error('[asistente] no se pudo abrir la conversación:', (e as Error).message);
  }

  const basics = await loadBasics(session.userId, conversationId).catch((e) => {
    console.error('[asistente] no se pudo leer el contexto:', (e as Error).message);
    return null;
  });
  const profile = basics?.profile;
  const history = basics?.history ?? [];
  const save = async (t: { answer: string; model: string; provider: string | null; tokensIn: number; tokensOut: number; error: string | null; degraded: boolean; calls: ToolRun[]; goTo: GoTo | null }) => {
    const ms = Date.now() - t0;
    if (!conversationId) return ms;
    try {
      await saveTurn({
        conversationId,
        userId: session.userId,
        question,
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
    knowledge: await loadKnowledge(roles),
    scripts: await loadScripts([question, ...history.filter((h) => h.who === 'persona').slice(-2).map((h) => h.body)].join(' '), roles),
    history,
  };
  await noteHeard(question, roles[0] ?? null);

  const chain = deps.chain ?? parseChain(env.assistant.models);
  let useModel = chain.length > 0;
  if (useModel) {
    // Over the monthly AI cap the demo brain answers (it costs nothing): never a breakdown.
    const spent = await monthSpend().catch(() => 0);
    if (spent >= env.ai.monthlyCapUsd) useModel = false;
  }
  const tools = toolsFor(roles, !!conversationId);
  const toolCtx = { session, conversationId, escalate: escalateFn };

  let out: BrainOutput = { text: '', model: useModel ? '' : 'local', provider: null, tokensIn: 0, tokensOut: 0, calls: [] };
  let error: string | null = null;
  try {
    out = useModel
      ? await modelTurn({ ctx, question, tools, toolCtx, chain, chatOptions: deps.chatOptions })
      : await localTurn({ ctx, question, tools, toolCtx });
  } catch (e) {
    error = String((e as Error)?.message ?? e).slice(0, 1000);
    const partial = (e as { partial?: BrainOutput }).partial;
    if (partial) out = partial;
    console.error('[asistente] sin respuesta:', error);
  }

  let answer = out.text ? filterOutput(out.text, name) : '';
  let degraded = false;
  if (!answer || !looksLikeText(answer)) {
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
    // The agenda rule, once more in code: an answer about events never carries a date or time.
    if (breaksAgendaRule(answer, question, out.calls)) answer = AGENDA_FALLBACK;
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

  const goTo = degraded
    ? null
    : pickGoTo(session.roles, { toolHrefs: out.calls.filter((c) => c.ok).map((c) => c.goTo).reverse(), answer, question });
  const model = degraded && !out.model ? 'ninguno' : out.model || 'local';
  await save({ answer, model, provider: out.provider, tokensIn: out.tokensIn, tokensOut: out.tokensOut, error, degraded, calls: out.calls, goTo });
  return finish({
    answer,
    model,
    degraded,
    did: out.calls.map((c) => (c.ok ? { tool: c.tool } : { tool: c.tool, error: c.error })),
    goTo,
    conversationId,
  });
}

// ---------------------------------------------------------------------------
// Health (for /api/cron/tick): if in the last hour more than 20 % of the answers came out
// degraded, tell administration — at most once every 6 hours. Small samples (< 3) don't count.
// ---------------------------------------------------------------------------
export const HEALTH_KIND = 'assistant_health';

export async function assistantHealthCheck(): Promise<{ answers: number; degraded: number; ratio: number; notified: boolean }> {
  const s = await withSystem(async (sql) => {
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
