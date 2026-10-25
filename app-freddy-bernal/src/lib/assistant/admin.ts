import 'server-only';
import { db, type Session } from '../auth/session';
import { withSystem } from '../db';
import { env } from '../env';
import { notify, usersWithRole } from '../notify';
import { INVITABLE_ROLES, ROLES, ROLE_LABEL, type Role } from '../roles';
import { mergeProfile, type AssistantProfile } from './config';
import { chat, estimateCost, keyDiagnostics, parseChain, type KeyDiagnosis } from './providers';
import { DATES_MESSAGE, listOf, noticeIssues, teachingProblem } from './guard';
import { hasDate, redact } from './redact';
import { variantsOf } from './local';
import { loadTitles } from './titles';
import { toolByName } from './tools';

// Server functions for Ajustes → Asistente (the panel). Plain functions, not server
// actions: the panel wraps them. EVERY one checks that the caller is administration (with
// 2FA when required) using the session it receives. Assistant tables go through withSystem
// (never inside db(session, …)); app_settings goes through db(session) with RLS.

export class AssistantAdminError extends Error {}

function assertAdmin(s: Session) {
  if (!s.roles.includes('admin') || !s.mfaOk) throw new AssistantAdminError('Solo administración puede ver y cambiar el asistente.');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, what = 'id'): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new AssistantAdminError(`Falta un ${what} válido.`);
  return v;
}
function text(v: unknown, what: string, min: number, max: number): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) throw new AssistantAdminError(`Falta ${what}.`);
  if (s.length > max) throw new AssistantAdminError(`${what[0].toUpperCase()}${what.slice(1)} es muy largo (máximo ${max} caracteres).`);
  return s;
}
function rolesOrNull(v: unknown): Role[] | null {
  if (v == null || (Array.isArray(v) && v.length === 0)) return null;
  if (!Array.isArray(v) || !v.every((r) => (ROLES as readonly string[]).includes(r))) throw new AssistantAdminError('Algún rol no es válido.');
  return [...new Set(v as Role[])];
}
function strings(v: unknown, max = 30): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new AssistantAdminError('La lista no es válida.');
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, 120)))].slice(0, max);
}
const pgArray = (xs: string[]) => `{${xs.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
// What the assistant knows goes to the AI provider: never a date (the boss's agenda).
function noDates(...parts: string[]) {
  if (parts.some((p) => hasDate(p))) throw new AssistantAdminError(DATES_MESSAGE);
}
// Fichas and scripts: no date, phone, email or address, and next to an event no time or day of any
// kind. An event is also one named by a title the admin can see (read as the admin, RLS).
async function teachable(s: Session, o: { said: string[]; asked?: string[]; whole?: boolean }) {
  const problem = teachingProblem({ ...o, titles: (await loadTitles(s)).events });
  if (problem) throw new AssistantAdminError(problem);
}

// ---------------------------------------------------------------------------
// Lo que sabe (fichas)
// ---------------------------------------------------------------------------
export type KnowledgeRow = {
  id: string; roles: Role[] | null; title: string; body: string; tags: string[]; origin: 'plataforma' | 'equipo';
  key: string | null; active: boolean; created_at: Date; updated_at: Date; automatic: boolean;
};

export async function listKnowledge(s: Session, f: { q?: string; origin?: 'plataforma' | 'equipo'; active?: boolean } = {}): Promise<KnowledgeRow[]> {
  assertAdmin(s);
  return withSystem((sql) =>
    sql.query<KnowledgeRow>(
      `select id, roles::text[] as roles, title, body, tags, origin, key, active, created_at, updated_at, origin = 'plataforma' as automatic
         from public.assistant_knowledge
        where ($1::text is null or public.assistant_plain(title || ' ' || body) like '%' || public.assistant_plain($1) || '%')
          and ($2::text is null or origin = $2) and ($3::boolean is null or active = $3)
        order by active desc, origin, title limit 500`,
      [f.q?.trim() || null, f.origin ?? null, f.active ?? null],
    ),
  );
}

/** Create or edit a ficha. Editing an automatic one makes it the team's: refresh no longer touches it. */
export async function saveKnowledge(s: Session, input: { id?: string | null; title: unknown; body: unknown; roles?: unknown; tags?: unknown; active?: boolean }) {
  assertAdmin(s);
  const title = text(input.title, 'el título', 1, 200);
  const body = text(input.body, 'el texto', 1, 6000);
  // A ficha is judged whole: its title can name the event its body gives the day or the hour of.
  await teachable(s, { said: [title, body], whole: true });
  const roles = rolesOrNull(input.roles);
  const tags = strings(input.tags);
  return withSystem(async (sql) => {
    if (input.id) {
      const row = await sql.one<{ id: string; origin: string }>(
        `update public.assistant_knowledge set title = $2, body = $3, roles = $4::public.app_role[], tags = $5::text[],
                active = coalesce($6, active), origin = 'equipo'
          where id = $1 returning id, origin`,
        [uuid(input.id), title, body, roles ? `{${roles.join(',')}}` : null, pgArray(tags), input.active ?? null],
      );
      if (!row) throw new AssistantAdminError('Esa ficha no existe.');
      return row;
    }
    return (await sql.one<{ id: string; origin: string }>(
      `insert into public.assistant_knowledge (title, body, roles, tags, active, origin, created_by)
       values ($1, $2, $3::public.app_role[], $4::text[], coalesce($5, true), 'equipo', $6) returning id, origin`,
      [title, body, roles ? `{${roles.join(',')}}` : null, pgArray(tags), input.active ?? null, s.userId],
    ))!;
  });
}

/** On/off. Switching an automatic one is a team decision too: it becomes the team's. */
export async function toggleKnowledge(s: Session, id: string, active: boolean) {
  assertAdmin(s);
  const r = await withSystem((sql) =>
    sql.one<{ id: string }>(`update public.assistant_knowledge set active = $2, origin = case when active = $2 then origin else 'equipo' end where id = $1 returning id`, [uuid(id), !!active]),
  );
  if (!r) throw new AssistantAdminError('Esa ficha no existe.');
}

/** «Actualizar lo que sabe»: regenerates the automatic fichas now. */
export async function refreshKnowledge(s: Session): Promise<number> {
  assertAdmin(s);
  return withSystem(async (sql) => (await sql.one<{ n: number }>(`select public.assistant_refresh() as n`))!.n);
}

// ---------------------------------------------------------------------------
// Cómo contesta (guiones)
// ---------------------------------------------------------------------------
export type ScriptRow = {
  id: string; roles: Role[] | null; topic: string; triggers: string[]; script: string; notes: string | null; always: boolean; active: boolean;
  origin: 'fabrica' | 'equipo' | 'conversacion'; key: string | null; times_used: number; last_used_at: Date | null; updated_at: Date;
};

export async function listScripts(s: Session, f: { q?: string; active?: boolean } = {}): Promise<ScriptRow[]> {
  assertAdmin(s);
  return withSystem((sql) =>
    sql.query<ScriptRow>(
      `select id, roles::text[] as roles, topic, triggers, script, notes, always, active, origin, key, times_used, last_used_at, updated_at
         from public.assistant_scripts
        where ($1::text is null or public.assistant_plain(topic || ' ' || array_to_string(triggers, ' ') || ' ' || script) like '%' || public.assistant_plain($1) || '%')
          and ($2::boolean is null or active = $2)
        order by active desc, always desc, times_used desc, topic limit 500`,
      [f.q?.trim() || null, f.active ?? null],
    ),
  );
}

/** Create or edit a script. A factory one that is edited becomes the team's (the seed won't touch it). */
export async function saveScript(
  s: Session,
  input: { id?: string | null; topic: unknown; triggers?: unknown; script: unknown; notes?: unknown; always?: boolean; roles?: unknown; active?: boolean; fromConversation?: boolean },
) {
  assertAdmin(s);
  const topic = text(input.topic, 'el tema', 1, 200);
  const script = text(input.script, 'el guion', 1, 6000);
  if (!variantsOf(script).length) throw new AssistantAdminError('El guion necesita al menos una línea que empiece por «[ASISTENTE]:».');
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : null;
  await teachable(s, { said: [script, notes ?? ''], asked: [topic] });
  const triggers = strings(input.triggers, 40);
  const roles = rolesOrNull(input.roles);
  return withSystem(async (sql) => {
    if (input.id) {
      const row = await sql.one<{ id: string; origin: string }>(
        `update public.assistant_scripts set topic = $2, triggers = $3::text[], script = $4, notes = $5, always = coalesce($6, always),
                roles = $7::public.app_role[], active = coalesce($8, active), origin = case when origin = 'fabrica' then 'equipo' else origin end
          where id = $1 returning id, origin`,
        [uuid(input.id), topic, pgArray(triggers), script, notes, input.always ?? null, roles ? `{${roles.join(',')}}` : null, input.active ?? null],
      );
      if (!row) throw new AssistantAdminError('Ese guion no existe.');
      return row;
    }
    return (await sql.one<{ id: string; origin: string }>(
      `insert into public.assistant_scripts (topic, triggers, script, notes, always, roles, active, origin, created_by)
       values ($1, $2::text[], $3, $4, coalesce($5, false), $6::public.app_role[], coalesce($7, true), $8, $9) returning id, origin`,
      [topic, pgArray(triggers), script, notes, input.always ?? null, roles ? `{${roles.join(',')}}` : null, input.active ?? null, input.fromConversation ? 'conversacion' : 'equipo', s.userId],
    ))!;
  });
}

export async function toggleScript(s: Session, id: string, active: boolean) {
  assertAdmin(s);
  const r = await withSystem((sql) => sql.one<{ id: string }>(`update public.assistant_scripts set active = $2 where id = $1 returning id`, [uuid(id), !!active]));
  if (!r) throw new AssistantAdminError('Ese guion no existe.');
}

/** The tester: which scripts this question would bring, WITHOUT counting usage or calling a model. */
export async function testScripts(s: Session, question: string, roles?: Role[]) {
  assertAdmin(s);
  const q = redact(text(question, 'la pregunta', 1, 1500));
  const rs = roles?.length ? rolesOrNull(roles)! : INVITABLE_ROLES;
  return withSystem((sql) =>
    sql.query<{ id: string; key: string | null; topic: string; points: number; always: boolean }>(
      `select script_id as id, script_key as key, script_topic as topic, script_points as points, script_always as always
         from public.assistant_scripts_for($1, $2::public.app_role[], 3, false)`,
      [q, `{${rs.join(',')}}`],
    ),
  );
}

// ---------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------
export type ConversationRow = {
  id: string; user_id: string | null; person: string; title: string; created_at: Date; last_at: Date; escalated_at: Date | null;
  escalated_reason: string | null; messages: number; degraded: number; errors: number; models: string[];
};

export async function listConversations(s: Session, f: { limit?: number; offset?: number; onlyEscalated?: boolean; onlyProblems?: boolean; userId?: string } = {}): Promise<ConversationRow[]> {
  assertAdmin(s);
  return withSystem((sql) =>
    sql.query<ConversationRow>(
      `select c.id, c.user_id, coalesce(nullif(p.full_name, ''), p.email, '—') as person, c.title, c.created_at, c.last_at,
              c.escalated_at, c.escalated_reason,
              count(m.id)::int as messages, count(m.id) filter (where m.degraded)::int as degraded,
              count(m.id) filter (where m.error is not null)::int as errors,
              coalesce(array_agg(distinct m.model) filter (where m.model is not null), '{}') as models
         from public.assistant_conversations c
         left join public.profiles p on p.id = c.user_id
         left join public.assistant_messages m on m.conversation_id = c.id
        where ($3::boolean is not true or c.escalated_at is not null) and ($4::uuid is null or c.user_id = $4)
        group by c.id, p.full_name, p.email
       having ($5::boolean is not true or count(m.id) filter (where m.degraded or m.error is not null) > 0)
        order by c.last_at desc limit $1 offset $2`,
      [Math.min(Math.max(f.limit ?? 50, 1), 200), Math.max(f.offset ?? 0, 0), f.onlyEscalated ?? null, f.userId ? uuid(f.userId) : null, f.onlyProblems ?? null],
    ),
  );
}

export type MessageRow = {
  id: string; who: 'persona' | 'asistente'; body: string; model: string | null; tokens_in: number | null; tokens_out: number | null;
  ms: number | null; error: string | null; degraded: boolean; tools: unknown; go_to: unknown; created_at: Date;
};

export async function getConversation(s: Session, id: string) {
  assertAdmin(s);
  return withSystem(async (sql) => {
    const conv = await sql.one<Omit<ConversationRow, 'messages' | 'degraded' | 'errors' | 'models'>>(
      `select c.id, c.user_id, coalesce(nullif(p.full_name, ''), p.email, '—') as person, c.title, c.created_at, c.last_at, c.escalated_at, c.escalated_reason
         from public.assistant_conversations c left join public.profiles p on p.id = c.user_id where c.id = $1`,
      [uuid(id)],
    );
    if (!conv) return null;
    const messages = await sql.query<MessageRow>(
      `select id, who, body, model, tokens_in, tokens_out, ms, error, degraded, tools, go_to, created_at
         from public.assistant_messages where conversation_id = $1 order by created_at, (who = 'asistente')`,
      [id],
    );
    return { ...conv, messages };
  });
}

// ---------------------------------------------------------------------------
// Lo que preguntan (agrupado por pregunta parecida, ordenado por cuántas veces salió)
// ---------------------------------------------------------------------------
export async function heardGrouped(s: Session, f: { days?: number; limit?: number } = {}) {
  assertAdmin(s);
  return withSystem((sql) =>
    sql.query<{ plain: string; sample: string; times: number; roles: Role[]; last_at: Date; ids: string[] }>(
      `select public.assistant_plain(text) as plain, (array_agg(text order by created_at desc))[1] as sample, count(*)::int as times,
              coalesce(array_agg(distinct role::text) filter (where role is not null), '{}') as roles, max(created_at) as last_at,
              array_agg(id) as ids
         from public.assistant_heard
        where not discarded and knowledge_id is null and created_at > now() - make_interval(days => $1)
        group by 1 order by times desc, last_at desc limit $2`,
      [Math.min(Math.max(f.days ?? 30, 1), 365), Math.min(Math.max(f.limit ?? 100, 1), 500)],
    ),
  );
}

export async function discardHeard(s: Session, ids: string[]) {
  assertAdmin(s);
  const list = ids.map((x) => uuid(x));
  await withSystem((sql) => sql.query(`update public.assistant_heard set discarded = true where id = any ($1::uuid[])`, [`{${list.join(',')}}`]));
}

/** After «Enseñarle el dato»: the questions that ficha answers leave the list. */
export async function linkHeard(s: Session, ids: string[], knowledgeId: string) {
  assertAdmin(s);
  const list = ids.map((x) => uuid(x));
  await withSystem((sql) =>
    sql.query(`update public.assistant_heard set knowledge_id = $2 where id = any ($1::uuid[])`, [`{${list.join(',')}}`, uuid(knowledgeId, 'id de ficha')]),
  );
}

// ---------------------------------------------------------------------------
// Por confirmar (nivel Prepara)
// ---------------------------------------------------------------------------
export async function listDrafts(s: Session, status: 'pendiente' | 'confirmado' | 'descartado' | 'todos' = 'pendiente') {
  assertAdmin(s);
  return withSystem((sql) =>
    sql.query<{ id: string; kind: string; summary: string; body: string; target: { role?: string }; status: string; created_at: Date; created_by_name: string | null; conversation_id: string | null; resolved_at: Date | null; result: unknown }>(
      `select d.id, d.kind, d.summary, d.body, d.target, d.status, d.created_at, coalesce(nullif(p.full_name, ''), p.email) as created_by_name,
              d.conversation_id, d.resolved_at, d.result
         from public.assistant_drafts d left join public.profiles p on p.id = d.created_by
        where ($1 = 'todos' or d.status = $1) order by d.created_at desc limit 200`,
      [status],
    ),
  );
}

/** Confirm: claims the draft first (no double send), checks it again, then sends. If the check or the
 * sending fails, it goes back to pending and administración is told why, in plain words. */
export async function confirmDraft(s: Session, id: string) {
  assertAdmin(s);
  const d = await withSystem((sql) =>
    sql.one<{ id: string; kind: string; body: string; target: { role?: string } }>(
      `update public.assistant_drafts set status = 'confirmado', resolved_by = $2, resolved_at = now()
        where id = $1 and status = 'pendiente' returning id, kind, body, target`,
      [uuid(id), s.userId],
    ),
  );
  if (!d) throw new AssistantAdminError('Ese borrador ya no está pendiente.');
  try {
    if (d.kind !== 'aviso') throw new AssistantAdminError('No sé confirmar ese tipo de borrador.');
    const role = String(d.target?.role ?? '');
    const people = new Set<string>();
    for (const r of role === 'todos' ? INVITABLE_ROLES : [role]) {
      if (!(INVITABLE_ROLES as string[]).includes(r)) throw new AssistantAdminError('El rol del aviso no es válido.');
      for (const u of await usersWithRole(r)) people.add(u);
    }
    // Rule 4, checked again with the same check both brains use (a draft may come from before it, or
    // name an event by a title the admin sees): no day, hour, place or contact beyond a team deadline.
    // The text is redacted again before sending.
    const issues = noticeIssues(d.body, (await loadTitles(s)).events);
    if (issues.length) {
      throw new AssistantAdminError(`No se mandó: el aviso trae ${listOf(issues)}, y eso solo va en la Agenda. Descártalo y pide otro sin eso.`);
    }
    await notify({ userIds: [...people], kind: 'assistant_notice', title: 'Aviso del equipo', body: redact(d.body), key: `assistant-draft:${d.id}` });
    await withSystem((sql) =>
      sql.query(`update public.assistant_drafts set result = $2::text::jsonb where id = $1`, [d.id, JSON.stringify({ enviados: people.size, a: role === 'todos' ? 'todo el equipo' : ROLE_LABEL[role as Role] })]),
    );
    return { sent: people.size };
  } catch (e) {
    await withSystem((sql) => sql.query(`update public.assistant_drafts set status = 'pendiente', resolved_by = null, resolved_at = null where id = $1`, [d.id]));
    throw e;
  }
}

export async function discardDraft(s: Session, id: string) {
  assertAdmin(s);
  const r = await withSystem((sql) =>
    sql.one<{ id: string }>(
      `update public.assistant_drafts set status = 'descartado', resolved_by = $2, resolved_at = now() where id = $1 and status = 'pendiente' returning id`,
      [uuid(id), s.userId],
    ),
  );
  if (!r) throw new AssistantAdminError('Ese borrador ya no está pendiente.');
}

// ---------------------------------------------------------------------------
// Lo que hizo (nivel Hace, con deshacer)
// ---------------------------------------------------------------------------
export async function listActions(s: Session, f: { limit?: number } = {}) {
  assertAdmin(s);
  const rows = await withSystem((sql) =>
    sql.query<{ id: string; action: string; entity: string | null; entity_id: string | null; detail: Record<string, unknown>; created_at: Date; undone_at: Date | null; person: string | null; conversation_id: string | null }>(
      `select a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, a.undone_at, coalesce(nullif(p.full_name, ''), p.email) as person, a.conversation_id
         from public.assistant_actions a left join public.profiles p on p.id = a.user_id
        order by a.created_at desc limit $1`,
      [Math.min(Math.max(f.limit ?? 100, 1), 500)],
    ),
  );
  return rows.map((r) => ({ ...r, undoable: !r.undone_at && !!toolByName(r.action)?.undo }));
}

export async function undoAction(s: Session, id: string) {
  assertAdmin(s);
  const a = await withSystem((sql) =>
    sql.one<{ id: string; action: string; user_id: string | null; entity_id: string | null; detail: Record<string, unknown>; undone_at: Date | null }>(
      `select id, action, user_id, entity_id, detail, undone_at from public.assistant_actions where id = $1`,
      [uuid(id)],
    ),
  );
  if (!a) throw new AssistantAdminError('Esa acción no existe.');
  if (a.undone_at) throw new AssistantAdminError('Eso ya se deshizo.');
  const tool = toolByName(a.action);
  if (!tool?.undo) throw new AssistantAdminError('Esto no se puede deshacer: el aviso ya salió.');
  await tool.undo(a);
  await withSystem((sql) => sql.query(`update public.assistant_actions set undone_at = now(), undone_by = $2 where id = $1`, [a.id, s.userId]));
}

// ---------------------------------------------------------------------------
// Cómo va (salud): per day, degraded, errors per model, time, tokens; keys without values.
// ---------------------------------------------------------------------------
export type HealthStats = {
  enabled: boolean;
  demo: boolean;
  chain: string[];
  keys: KeyDiagnosis[];
  days: { day: string; conversations: number; questions: number; answers: number; degraded: number; errors: number; avg_ms: number | null; tokens_in: number; tokens_out: number }[];
  byModel: { model: string; answers: number; errors: number; degraded: number; avg_ms: number | null }[];
  lastHour: { answers: number; degraded: number };
  spendMonthUsd: number;
  capUsd: number;
};

export async function healthStats(s: Session, f: { days?: number } = {}): Promise<HealthStats> {
  assertAdmin(s);
  const chain = parseChain(env.assistant.models);
  const days = Math.min(Math.max(f.days ?? 14, 1), 90);
  const data = await withSystem(async (sql) => {
    const perDay = await sql.query<HealthStats['days'][number]>(
      `select to_char((m.created_at at time zone $2)::date, 'YYYY-MM-DD') as day,
              count(distinct m.conversation_id)::int as conversations,
              count(*) filter (where m.who = 'persona')::int as questions,
              count(*) filter (where m.who = 'asistente')::int as answers,
              count(*) filter (where m.degraded)::int as degraded,
              count(*) filter (where m.error is not null)::int as errors,
              round(avg(m.ms) filter (where m.who = 'asistente'))::int as avg_ms,
              coalesce(sum(m.tokens_in), 0)::int as tokens_in, coalesce(sum(m.tokens_out), 0)::int as tokens_out
         from public.assistant_messages m where m.created_at > now() - make_interval(days => $1)
        group by 1 order by 1 desc`,
      [days, env.appTz],
    );
    // Answers cut by the hourly limit are saved as model 'tope': their own row, last (the panel calls it «Límite por hora»).
    const byModel = await sql.query<HealthStats['byModel'][number]>(
      `select coalesce(model, 'ninguno') as model, count(*)::int as answers, count(*) filter (where error is not null)::int as errors,
              count(*) filter (where degraded)::int as degraded, round(avg(ms))::int as avg_ms
         from public.assistant_messages where who = 'asistente' and created_at > now() - make_interval(days => $1)
        group by 1 order by (coalesce(model, 'ninguno') = 'tope'), answers desc`,
      [days],
    );
    const hour = await sql.one<{ answers: number; degraded: number }>(
      `select count(*)::int as answers, count(*) filter (where degraded)::int as degraded
         from public.assistant_messages where who = 'asistente' and created_at > now() - interval '1 hour'`,
    );
    const spend = await sql.one<{ s: string }>(`select coalesce(sum(cost_usd), 0) as s from public.ai_usage where at >= date_trunc('month', now())`);
    return { perDay, byModel, hour, spend: Number(spend?.s ?? 0) };
  });
  return {
    enabled: env.assistant.enabled,
    demo: chain.length === 0,
    chain: chain.map((l) => l.raw),
    keys: keyDiagnostics(chain),
    days: data.perDay,
    byModel: data.byModel,
    lastHour: data.hour ?? { answers: 0, degraded: 0 },
    spendMonthUsd: data.spend,
    capUsd: env.ai.monthlyCapUsd,
  };
}

/** «Probar la cadena»: asks each link «di hola» and says which answer and the exact error of the rest. */
export async function probeChain(s: Session): Promise<{ link: string; ok: boolean; text?: string; error?: string; ms: number }[]> {
  assertAdmin(s);
  const chain = parseChain(env.assistant.models);
  if (!chain.length) return [{ link: 'local', ok: true, text: 'Sin cadena de modelos: contesta el cerebro de demostración (sin IA).', ms: 0 }];
  const out: { link: string; ok: boolean; text?: string; error?: string; ms: number }[] = [];
  for (const link of chain) {
    const t0 = Date.now();
    try {
      const r = await chat([{ role: 'system', content: 'Contesta con una sola palabra.' }, { role: 'user', content: 'di hola' }], { chain: [link], maxTokens: 20, temperature: 0 });
      out.push({ link: link.raw, ok: true, text: r.text.slice(0, 80), ms: Date.now() - t0 });
      if (r.usage.prompt_tokens || r.usage.completion_tokens) {
        await withSystem((sql) =>
          sql.query(`insert into public.ai_usage (user_id, feature, provider, model, input_tokens, output_tokens, cost_usd) values ($1, 'assistant', $2, $3, $4, $5, $6)`, [
            s.userId, r.provider, r.link, r.usage.prompt_tokens, r.usage.completion_tokens, estimateCost(r.link, r.usage.prompt_tokens, r.usage.completion_tokens).toFixed(4),
          ]),
        );
      }
    } catch (e) {
      out.push({ link: link.raw, ok: false, error: String((e as Error).message ?? e).replace(/^Ningún modelo respondió\.\s*/, '').slice(0, 300), ms: Date.now() - t0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ajustes: name, face (emoji) and intro. Defaults in config/clients/<brand>.json → assistant.
// ---------------------------------------------------------------------------
export async function getProfile(s: Session): Promise<AssistantProfile> {
  assertAdmin(s);
  return db(s, async (sql) => mergeProfile((await sql.one<{ value: unknown }>(`select value from public.app_settings where key = 'assistant'`))?.value));
}

export async function saveProfile(s: Session, input: { name: unknown; emoji?: unknown; intro?: unknown }): Promise<AssistantProfile> {
  assertAdmin(s);
  const name = text(input.name, 'el nombre', 1, 40);
  const emoji = typeof input.emoji === 'string' ? input.emoji.trim().slice(0, 16) : '';
  const intro = typeof input.intro === 'string' ? input.intro.trim().slice(0, 300) : '';
  noDates(name, intro);
  const value = { name, emoji, intro };
  await db(s, (sql) =>
    sql.query(
      `insert into public.app_settings (key, value, updated_by) values ('assistant', $1::text::jsonb, auth.uid())
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid()`,
      [JSON.stringify(value)],
    ),
  );
  return mergeProfile(value);
}
