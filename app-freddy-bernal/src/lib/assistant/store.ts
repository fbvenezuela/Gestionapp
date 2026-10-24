import 'server-only';
import { withSystem, type Sql } from '../db';
import type { Role } from '../roles';
import type { ChosenScript, Ficha, HistoryMsg } from './brain';
import { mergeProfile, type AssistantProfile } from './config';
import { estimateCost } from './providers';

// The assistant's own tables, through withSystem ("service key"), always checking in code
// that the conversation belongs to the caller. Never called from inside db(session, …).

export const THREAD_MESSAGES = 24; // the whole thread the model sees; not trimmed to save
export const MESSAGES_PER_HOUR = 40;
const HEARD_MIN = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's conversation, or a new one. Someone else's id never opens it (a new one starts). */
async function conversationFor(sql: Sql, userId: string, conversationId: string | null | undefined, title: string): Promise<string> {
  if (conversationId && UUID.test(conversationId)) {
    const own = await sql.one<{ id: string }>(`select id from public.assistant_conversations where id = $1 and user_id = $2`, [conversationId, userId]);
    if (own) return own.id;
  }
  const row = await sql.one<{ id: string }>(
    `insert into public.assistant_conversations (user_id, scope, title) values ($1, 'equipo', $2) returning id`,
    [userId, title.slice(0, 200)],
  );
  return row!.id;
}

export type Brand = { appName?: string; shortName?: string; bossLabel?: string };
/** A model turn's reservation against the month's AI cap: its estimated cost for a thread of so many characters. */
export type Reserve = { provider: string; model: string; capUsd: number; costFor: (threadChars: number) => number };

const MONTH_SPEND = `select coalesce(sum(cost_usd), 0) as s from public.ai_usage where at >= date_trunc('month', now())`;

/**
 * Opens the turn in ONE short transaction, BEFORE any model call: the person's lock, the
 * conversation, the hour's count, the context, and the (redacted) question saved right away, so
 * parallel requests see it and a turn that fails later still counts. With a model chain and room
 * under the month's cap (the turns still in flight count, by their reservation), a reservation
 * (the turn's estimated cost, sized by this thread) goes into ai_usage; saveTurn settles it with
 * the real numbers. The transaction is never held
 * across the model call (the demo database runs one transaction at a time).
 */
export async function openTurn(userId: string, requested: string | null | undefined, question: string, reserve: Reserve | null) {
  return withSystem(async (sql) => {
    await sql.query(`select pg_advisory_xact_lock(hashtext('assistant:' || $1::text))`, [userId]);
    const conversationId = await conversationFor(sql, userId, requested, question);
    const recent = await sql.one<{ n: number }>(
      `select count(*)::int as n from public.assistant_messages m join public.assistant_conversations c on c.id = m.conversation_id
        where c.user_id = $1 and m.who = 'persona' and m.created_at > now() - interval '1 hour'`,
      [userId],
    );
    const settings = await sql.query<{ key: string; value: unknown }>(`select key, value from public.app_settings where key in ('brand', 'assistant')`);
    // The thread is read before this question goes in (it is the last message, not history).
    const history = (
      await sql.query<HistoryMsg>(
        `select who, body from (select who, body, created_at from public.assistant_messages where conversation_id = $1
          order by created_at desc, (who = 'persona') limit $2) t order by created_at, (who = 'asistente')`,
        [conversationId, THREAD_MESSAGES],
      )
    ).map((h) => ({ who: h.who, body: h.body }));
    const sentLastHour = recent?.n ?? 0;
    // clock_timestamp(): the question and the answer of one turn never share a timestamp.
    await sql.query(`insert into public.assistant_messages (conversation_id, who, body, created_at) values ($1, 'persona', $2, clock_timestamp())`, [conversationId, question]);
    let usageId: string | null = null;
    if (reserve && sentLastHour < MESSAGES_PER_HOUR) {
      await sql.query(`select pg_advisory_xact_lock(hashtext('assistant:month'))`);
      const spent = Number((await sql.one<{ s: string }>(MONTH_SPEND))?.s ?? 0);
      if (spent < reserve.capUsd) {
        // Every call of the turn resends the whole thread: the history and this question.
        const threadChars = question.length + history.reduce((n, h) => n + h.body.length, 0);
        const row = await sql.one<{ id: string }>(
          `insert into public.ai_usage (user_id, feature, provider, model, cost_usd) values ($1, 'assistant', $2, $3, $4) returning id`,
          [userId, reserve.provider, reserve.model, reserve.costFor(threadChars).toFixed(4)],
        );
        usageId = row!.id;
      }
    }
    const get = (k: string) => settings.find((s) => s.key === k)?.value;
    return {
      conversationId,
      sentLastHour,
      usageId,
      brand: (get('brand') ?? {}) as Brand,
      profile: mergeProfile(get('assistant')) as AssistantProfile,
      history,
    };
  });
}

/** Fichas offered to these roles. null = could not be read (the prompt declares it). */
export async function loadKnowledge(roles: Role[]): Promise<Ficha[] | null> {
  try {
    return await withSystem((sql) =>
      sql.query<Ficha>(
        `select key, title, body, tags from public.assistant_knowledge
          where active and (roles is null or roles && $1::public.app_role[]) order by origin desc, title`,
        [`{${roles.join(',')}}`],
      ),
    );
  } catch (e) {
    console.error('[asistente] no se pudieron leer las fichas:', (e as Error).message);
    return null;
  }
}

/** The scripts for this question and the person's two previous ones (counts usage). */
export async function loadScripts(text: string, roles: Role[], count = true): Promise<ChosenScript[]> {
  try {
    return await withSystem(async (sql) =>
      (
        await sql.query<{ script_key: string | null; script_topic: string; script_text: string; script_always: boolean }>(
          `select * from public.assistant_scripts_for($1, $2::public.app_role[], 3, $3)`,
          [text, `{${roles.join(',')}}`, count],
        )
      ).map((s) => ({ key: s.script_key, topic: s.script_topic, script: s.script_text, always: s.script_always })),
    );
  } catch (e) {
    console.error('[asistente] no se pudieron elegir los guiones:', (e as Error).message);
    return [];
  }
}

/** «Lo que preguntan»: the redacted question, if it says something (12+ characters). */
export async function noteHeard(text: string, role: Role | null) {
  const t = text.trim().slice(0, 1000);
  if (t.length < HEARD_MIN) return;
  try {
    await withSystem((sql) => sql.query(`insert into public.assistant_heard (role, text) values ($1, $2)`, [role, t]));
  } catch (e) {
    console.error('[asistente] no se pudo anotar la pregunta:', (e as Error).message);
  }
}

export type SavedTurn = {
  conversationId: string;
  userId: string;
  question: string; // redacted; openTurn already wrote it
  usageId: string | null; // openTurn's reservation in ai_usage
  answer: string;
  model: string;
  provider: string | null;
  tokensIn: number;
  tokensOut: number;
  ms: number;
  error: string | null;
  degraded: boolean;
  tools: unknown;
  goTo: unknown;
};

/** The answer, saved AFTER answering (the question went in with openTurn). If it fails the caller
 * logs it and the answer still goes out. */
export async function saveTurn(t: SavedTurn) {
  await withSystem(async (sql) => {
    await sql.query(
      `insert into public.assistant_messages (conversation_id, who, body, model, tokens_in, tokens_out, ms, error, degraded, tools, go_to, created_at)
       values ($1, 'asistente', $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::text::jsonb, clock_timestamp() + interval '1 millisecond')`,
      [t.conversationId, t.answer, t.model, t.tokensIn, t.tokensOut, t.ms, t.error, t.degraded, JSON.stringify(t.tools ?? []), JSON.stringify(t.goTo ?? null)],
    );
    await sql.query(
      `update public.assistant_conversations set last_at = now(), title = case when title = '' then left($2, 200) else title end where id = $1`,
      [t.conversationId, t.question],
    );
    // The reservation becomes what the turn really spent; a turn that spent nothing leaves no row.
    const used = !!t.provider && !!(t.tokensIn || t.tokensOut);
    const cost = used ? estimateCost(t.model, t.tokensIn, t.tokensOut).toFixed(4) : '0';
    if (t.usageId && used) {
      await sql.query(
        `update public.ai_usage set provider = $2, model = $3, input_tokens = $4, output_tokens = $5, cost_usd = $6 where id = $1`,
        [t.usageId, t.provider, t.model, t.tokensIn, t.tokensOut, cost],
      );
    } else if (t.usageId) {
      await sql.query(`delete from public.ai_usage where id = $1`, [t.usageId]);
    } else if (used) {
      await sql.query(
        `insert into public.ai_usage (user_id, feature, provider, model, input_tokens, output_tokens, cost_usd) values ($1, 'assistant', $2, $3, $4, $5, $6)`,
        [t.userId, t.provider, t.model, t.tokensIn, t.tokensOut, cost],
      );
    }
  });
}
