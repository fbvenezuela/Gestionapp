// Pure logic of Ajustes → Asistente (docs/ASISTENTE.md «El panel», manual §13): the tabs, the
// input schemas the server actions validate with, and how a real answer becomes a script.
// No I/O here: the panel pages, its client editors and src/lib/actions/assistant.ts share it.
import { z } from 'zod';
import { INVITABLE_ROLES, ROLES, ROLE_LABEL, isInvitableRole, type Role } from '@/lib/roles';

export const PANEL_PATH = '/ajustes/asistente';

export const TABS = [
  { key: 'sabe', label: 'Lo que sabe' },
  { key: 'contesta', label: 'Cómo contesta' },
  { key: 'conversaciones', label: 'Conversaciones' },
  { key: 'va', label: 'Cómo va' },
  { key: 'preguntan', label: 'Lo que preguntan' },
  { key: 'confirmar', label: 'Por confirmar' },
  { key: 'hizo', label: 'Lo que hizo' },
  { key: 'ajustes', label: 'Ajustes' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

/** ?tab= → a known tab. A link to one conversation (escalation notices) opens Conversaciones. */
export function parseTab(tab: unknown, conversation?: unknown): TabKey {
  const t = Array.isArray(tab) ? tab[0] : tab;
  if (typeof t === 'string' && TABS.some((x) => x.key === t)) return t as TabKey;
  const c = Array.isArray(conversation) ? conversation[0] : conversation;
  return typeof c === 'string' && c ? 'conversaciones' : 'sabe';
}

export function tabHref(tab: TabKey, extra: Record<string, string | number | null | undefined> = {}) {
  const p = new URLSearchParams({ tab });
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  return `${PANEL_PATH}?${p.toString()}`;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First value of a search param, only if it is an id. */
export function idParam(v: unknown): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && UUID.test(x) ? x : null;
}

export function pageParam(v: unknown): number {
  const x = Number.parseInt(String(Array.isArray(v) ? v[0] : (v ?? '1')), 10);
  return Number.isFinite(x) && x > 0 ? Math.min(x, 1000) : 1;
}

// ---------------------------------------------------------------------------
// Roles (who a ficha or script is for). Empty = every role. Only the six team roles and
// Administración: the retired and phase-3 roles don't use the assistant.
// ---------------------------------------------------------------------------
export const TEAM_ROLE_CHOICES = INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export function rolesText(roles: readonly string[] | null | undefined): string {
  if (!roles?.length) return 'Todos los roles';
  return roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(', ');
}

/** «a, b» or one per line → clean list (triggers, tags). */
export function splitList(text: string, max = 40): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const v = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, max);
}

// ---------------------------------------------------------------------------
// Input schemas (the server actions validate with these; messages in plain Spanish).
// ---------------------------------------------------------------------------
const id = z.string().regex(UUID, 'Falta un id válido.');
const teamRoles = z
  .array(z.enum(ROLES))
  .max(ROLES.length)
  .refine((rs) => rs.every((r) => isInvitableRole(r)), 'Algún rol no es del equipo.')
  .default([]);
const heardIds = z.array(id).max(500).default([]);
const text = (what: string, max: number) =>
  z.string().trim().min(1, `Falta ${what}.`).max(max, `${what[0].toUpperCase()}${what.slice(1)} es muy largo (máximo ${max} caracteres).`);

export const knowledgeSchema = z.object({
  id: id.nullish(),
  title: text('el título', 200),
  body: text('el texto', 6000),
  roles: teamRoles,
  tags: z.array(z.string().trim().max(60, 'Una etiqueta es muy larga.')).max(30, 'Son muchas etiquetas.').default([]),
  active: z.boolean().optional(),
  /** «Enseñarle el dato»: the questions this ficha answers leave «Lo que preguntan». */
  heardIds,
});
export type KnowledgeInput = z.input<typeof knowledgeSchema>;

export const scriptSchema = z.object({
  id: id.nullish(),
  topic: text('el tema', 200),
  triggers: z.array(z.string().trim().max(120, 'Un disparador es muy largo.')).max(40, 'Son muchos disparadores.').default([]),
  script: text('el guion', 6000).refine(hasAssistantLine, 'El guion necesita al menos una línea que empiece por «[ASISTENTE]:».'),
  notes: z.string().trim().max(1000, 'Las notas son muy largas.').default(''),
  always: z.boolean().default(false),
  roles: teamRoles,
  active: z.boolean().optional(),
  fromConversation: z.boolean().default(false),
  /** «Enseñarle cómo contestar»: the questions leave «Lo que preguntan». */
  heardIds,
});
export type ScriptInput = z.input<typeof scriptSchema>;

export const toggleSchema = z.object({ id, active: z.boolean() });
export const idSchema = z.object({ id });
export const idsSchema = z.object({ ids: z.array(id).min(1, 'No hay nada marcado.').max(500) });
export const testSchema = z.object({ question: text('la pregunta', 1500), role: z.enum(ROLES).nullish() });
export const exampleSchema = z.object({ conversationId: id, messageId: id });
export const profileSchema = z.object({
  name: text('el nombre', 40),
  emoji: z.string().trim().max(16, 'La cara es muy larga: usa un solo emoji.').default(''),
  intro: z.string().trim().max(300, 'La presentación es muy larga (máximo 300 caracteres).').default(''),
});

// ---------------------------------------------------------------------------
// Scripts from real conversations (manual §6): «Así se contesta» keeps the answer as an
// example; «Corregir» opens the editor with the question in place.
// ---------------------------------------------------------------------------
export function hasAssistantLine(script: string): boolean {
  return script.split('\n').some((l) => /^\s*\[ASISTENTE\]:\s*\S/.test(l));
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The assistant's own name becomes [ASISTENTE], so renaming it never teaches two names. */
export function withNameHole(text: string, name: string): string {
  const n = name.trim();
  if (n.length < 2) return text;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'gu'), '[ASISTENTE]');
}

export function topicFrom(question: string): string {
  const q = oneLine(question);
  return q.length > 80 ? `${q.slice(0, 79).replace(/\s+\S*$/, '')}…` : q;
}

export type ScriptDraft = { topic: string; triggers: string[]; script: string };

export function scriptFromAnswer(question: string, answer: string, assistantName: string): ScriptDraft {
  const q = oneLine(question);
  return { topic: topicFrom(q), triggers: q ? [q.slice(0, 120)] : [], script: `Persona: ${q}\n[ASISTENTE]: ${withNameHole(oneLine(answer), assistantName)}` };
}

export function correctionDraft(question: string): ScriptDraft {
  const q = oneLine(question);
  return { topic: topicFrom(q), triggers: q ? [q.slice(0, 120)] : [], script: `Persona: ${q}\n[ASISTENTE]: ` };
}

/** Each answer with the question it answered (the person's message right before it). */
export function pairAnswers<M extends { id: string; who: 'persona' | 'asistente'; body: string }>(messages: M[]): { answer: M; question: string }[] {
  const out: { answer: M; question: string }[] = [];
  let last = '';
  for (const m of messages) {
    if (m.who === 'persona') last = m.body;
    else out.push({ answer: m, question: last });
  }
  return out;
}

// ---------------------------------------------------------------------------
// How things read in the panel.
// ---------------------------------------------------------------------------
const ACTION_LABEL: Record<string, string> = {
  marcar_avisos_leidos: 'Marcó avisos como leídos',
  avisar_al_equipo: 'Avisó al equipo',
  preparar_aviso: 'Preparó un aviso',
};

// What the assistant looked up to answer (src/lib/assistant/tools.ts), in plain words: the
// panel never shows the internal names.
const LOOKUP_LABEL: Record<string, string> = {
  mis_pendientes: 'Buscó los pendientes',
  eventos_por_decidir: 'Buscó los eventos por decidir',
  estado_pieza: 'Buscó cómo va una pieza',
  dias_de_tweets: 'Contó los días de tweets',
  mejores_horas: 'Buscó las mejores horas',
  reglas_de_video: 'Buscó las reglas de video',
  buscar_evento: 'Buscó un evento',
};

const plainName = (name: string) => {
  const t = name.replaceAll('_', ' ').trim();
  return t ? `${t[0].toUpperCase()}${t.slice(1)}` : 'Otra consulta';
};

/** A tool the assistant used, as the panel shows it. */
export function toolLabel(tool: string | null | undefined): string {
  const t = tool ?? '';
  return LOOKUP_LABEL[t] ?? ACTION_LABEL[t] ?? plainName(t);
}

export function actionLabel(action: string, detail?: Record<string, unknown> | null): string {
  const base = ACTION_LABEL[action] ?? action.replaceAll('_', ' ');
  const result = (detail?.result ?? {}) as Record<string, unknown>;
  if (action === 'marcar_avisos_leidos' && typeof result.marcados === 'number') return `${base} (${result.marcados})`;
  if (action === 'avisar_al_equipo' && typeof detail?.motivo === 'string' && detail.motivo) return `${base}: ${detail.motivo}`;
  return base;
}

export function draftTarget(target: { role?: unknown } | null | undefined): string {
  const r = String(target?.role ?? '');
  if (r === 'todos') return 'Todo el equipo';
  return ROLE_LABEL[r as Role] ?? (r || 'Sin destino');
}

export const DRAFT_STATUS: Record<string, string> = { pendiente: 'Pendiente', confirmado: 'Confirmado', descartado: 'Descartado' };
/** What administración is reminded of before a prepared notice goes out (the check is the server's; this is the person's). */
export const NOTICE_REMINDER = 'Revisa que no diga el día, la hora ni el lugar de un evento.';

export const ORIGIN_LABEL: Record<string, string> = {
  plataforma: 'Automática',
  equipo: 'Del equipo',
  fabrica: 'De fábrica',
  conversacion: 'De una conversación real',
};

export type KeyInfo = { provider: string; keyEnv: string; present: boolean; prefixOk: boolean | null; spaces: boolean; similar: string[]; known: boolean };

const PROVIDER_NAME: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', openai: 'OpenAI', openrouter: 'OpenRouter', mistral: 'Mistral' };

/** What the panel says about a provider key, in plain words: never a value, nor the name of
 *  the server setting (docs/ASISTENTE.md has those for whoever sets the keys up). */
export function keyStatus(k: KeyInfo): { tone: 'ok' | 'warn' | 'danger'; text: string } {
  if (!k.known) return { tone: 'danger', text: `«${k.provider}» no es un proveedor conocido.` };
  const key = `La clave de ${PROVIDER_NAME[k.provider] ?? k.provider}`;
  if (!k.present) {
    const similar = k.similar.length === 1 ? ' Hay una con un nombre parecido: revisa cómo se escribió.' : k.similar.length ? ` Hay ${k.similar.length} con nombres parecidos: revisa cómo se escribieron.` : '';
    return { tone: 'danger', text: `${key} no está puesta.${similar}` };
  }
  if (k.spaces) return { tone: 'warn', text: `${key} tiene espacios al principio o al final.` };
  if (k.prefixOk === false) return { tone: 'warn', text: `${key} no empieza como debería: ¿se pegó a medias?` };
  return { tone: 'ok', text: `${key} está puesta.` };
}

/** Who answered, as the panel shows it: never an internal name («local», «tope»). */
export function modelLabel(model: string | null | undefined): string {
  if (model === 'local') return 'Demostración (sin IA)';
  if (model === 'tope') return 'Límite por hora';
  if (model === 'ninguno') return 'Sin respuesta';
  return model || 'Sin modelo';
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null) return '—';
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1).replace('.', ',')} s`;
}

export function fmtUsd(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} US$`;
}
