import 'server-only';
import { menuRoles, type Session } from '../auth/session';
import { db, system } from './db';
import { friendlyDbError } from '../db/core';
import { usersWithRole } from '../notify';
import { INVITABLE_ROLES, ROLE_LABEL, TEAM_ROLES, homeFor, type Role } from '../roles';
import { HOME_SCREEN, tourHref, toursForRoles, type Tour } from '../guides';
import { tweetStock } from '../data/tweets';
import { toSchedule } from '../data/events';
import { obraStageCounts, overdueReports } from '../data/fichas';
import { BOSS_DECISION, NETWORK_LABEL, PIECE_STATUS, WORK_STATUS } from '../data/labels';
import { windowHint, type PublishingWindows } from '../domain/publishing-windows';
import { bestTimes } from '../domain/best-times';
import { dt, today } from '../time';
import { NOTICE_MAX, NOTICE_TOO_LONG, noticeIssues, noticeRefusal } from './guard';
import { redact, redactContacts } from './redact';
import { canOpen, screenFor } from './screens';
import { contract, plain } from './text';
import { loadTitles } from './titles';
import type { ToolSpec } from './providers';

// What the assistant can DO (manual §8). «La carta no es la cerradura»: `roles` only says to
// whom a tool is OFFERED. Every `run` reads AS THE PERSON with db(session, …), so the
// database's row rules decide what comes back; someone who isn't allowed gets zero rows.
// Never read the boss's private schedule here (date, time, address, how to get there, contacts):
// no tool selects from it, joins it or uses a view built on it. Assistant tables are written
// with system() (db.ts), never nested inside db(session, …). Both mark the transaction as 360's (app.caller).

export type Level = 'cuenta' | 'prepara' | 'hace';
export type Param = { type: 'string' | 'integer' | 'boolean'; description: string; enum?: string[] };
export type EscalateFn = (conversationId: string, reason: string) => Promise<{ alreadyNotified: boolean; to: string[] }>;
export type ToolCtx = { session: Session; conversationId: string | null; escalate: EscalateFn };
// A tutorial to start from the window: «Ver el tutorial de Publicar». href null when its screen needs an id (the
// window builds it only when the person is already on that screen).
export type TutorialLink = { id: string; label: string; href: string | null };
export type ToolOutput = { result: unknown; goTo?: string | null; tutorial?: TutorialLink | null; entityId?: string | null; detail?: Record<string, unknown>; skipRecord?: boolean };
export type ActionRow = { id: string; user_id: string | null; entity_id: string | null; detail: Record<string, unknown> };

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, Param>;
  required: string[];
  fromServer: string[]; // set by the server, never seen or written by the model
  roles: Role[] | null; // to whom it is OFFERED (null = everyone on the team)
  level: Level;
  entity?: string;
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolOutput>;
  undo?: (a: ActionRow) => Promise<void>;
};

export class ToolError extends Error {}

const CONTENT: Role[] = ['admin', 'social', 'boss'];
// Who sees events with their brief, storyboard and material (can_see_event). The Director de política and the Director
// del IVT read only the events born from their own fichas (events_select), never their brief: the event tools are not
// offered to them.
const SEE_EVENTS: Role[] = ['admin', 'boss', 'dispatch', 'social', 'camera'];
const NETWORKS = Object.keys(NETWORK_LABEL);
const RAW = `('boss','drone','broll','other')`;

const STOP = new Set(
  (
    'el la los las un una unos unas de del al a en y o que como va van esta estan estado pieza piezas video videos evento eventos acto ' +
    'actividad me mi mis tu su por para con sobre cual donde cuando hay ya se lo le dime saber quiero ver revisa busca buscar es son ' +
    'hora fecha direccion lugar contacto llegar dame'
  ).split(' '),
);

function terms(q: string): string[] {
  return plain(q).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Best matches of `q` among rows by word overlap with `text(row)`; ties keep row order. */
function bestMatches<T>(rows: T[], q: string, text: (r: T) => string, max = 5): T[] {
  const ts = terms(q);
  if (!ts.length) return [];
  const scored = rows
    .map((r) => {
      const hay = ` ${plain(text(r))} `;
      return { r, n: ts.filter((t) => hay.includes(` ${t}`)).length };
    })
    .filter((x) => x.n > 0);
  const top = Math.max(0, ...scored.map((x) => x.n));
  return scored.filter((x) => x.n === top).slice(0, max).map((x) => x.r);
}

const has = (s: Session, ...r: Role[]) => r.some((x) => s.roles.includes(x));

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export const TOOLS: Tool[] = [
  {
    name: 'mis_pendientes',
    description:
      'Lo que tiene pendiente quien pregunta según su rol (lo mismo que su pantalla de inicio: Hoy, el Inicio del jefe, Municipios u Obras) y cuántos avisos sin leer tiene. Úsala cuando pregunte qué tiene, qué le toca o qué hay por hacer. No da fechas ni horas de eventos.',
    parameters: {},
    required: [],
    fromServer: [],
    roles: null,
    level: 'cuenta',
    async run(_a, ctx) {
      const s = ctx.session;
      const out = await db(s, async (sql) => {
        const items: { que: string; titulo: string }[] = [];
        const push = (que: string, rows: { title: string }[]) => rows.forEach((r) => items.push({ que, titulo: r.title }));
        // The same as each home (Hoy, /jefe, /municipios, /obras). «Lo vencido sale arriba» in política's home (§4.2):
        // community reports past their follow-up day. The boss gets them after what waits for his approval.
        const overdue = has(s, 'politics', 'boss') ? await overdueReports(sql, today().toISODate()!, 5) : [];
        if (has(s, 'politics') && !has(s, 'boss')) push('Vencida', overdue);
        if (has(s, 'social', 'admin')) {
          push('El jefe pidió cambios', await sql.query(`select title from public.pieces where status = 'changes_requested' and deleted_at is null order by updated_at desc limit 5`));
          push('Falta el storyboard', await sql.query(
            `select e.title from public.events e left join public.storyboards sb on sb.event_id = e.id
              where e.deleted_at is null and e.cancelled_at is null and e.boss_decision = 'accepted' and public.event_done_on(e.id) is null
                and (sb.id is null or not exists (select 1 from public.storyboard_blocks b where b.storyboard_id = sb.id and b.deleted_at is null))
              order by e.urgency, e.created_at limit 5`));
          push('Llegó el material: arma la pieza', await sql.query(
            `select e.title from public.events e
              where e.deleted_at is null and e.cancelled_at is null and exists (select 1 from public.media_assets m where m.event_id = e.id and m.kind in ${RAW} and m.deleted_at is null)
                and not exists (select 1 from public.pieces p where p.event_id = e.id and p.deleted_at is null) limit 5`));
          push('Aprobada: lista para publicar', await sql.query(
            `select p.title from public.pieces p where p.status = 'approved' and p.deleted_at is null
                and not exists (select 1 from public.publications x where x.piece_id = p.id and x.status in ('scheduled','published') and x.deleted_at is null) limit 5`));
          const failed = await sql.query<{ network: string }>(`select network from public.publications where status = 'failed' and deleted_at is null limit 3`);
          failed.forEach((f) => items.push({ que: 'Falló una publicación', titulo: NETWORK_LABEL[f.network] ?? f.network }));
          const stock = await tweetStock(sql);
          if (stock.lowStock) items.push({ que: 'Tweets', titulo: stock.daysLeft ? `Quedan ${stock.daysLeft} días de tweets programados` : 'No quedan tweets programados' });
        }
        if (has(s, 'boss')) {
          // The boss approves every level and the tweets (public.can_approve()).
          const review = await sql.query<{ title: string; review_level: string }>(
            `select title, review_level from public.pieces where status = 'in_review' and deleted_at is null
              order by case review_level when 'rojo' then 0 when 'amarillo' then 1 else 2 end, sent_to_review_at nulls last limit 8`);
          review.forEach((p) => items.push({ que: `Te toca aprobar (${p.review_level})`, titulo: p.title }));
          const tw = await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`);
          if (tw?.n) items.push({ que: 'Tweets por aprobar', titulo: `${tw.n} tweets` });
          push('Espera tu decisión', await sql.query(`select title from public.events where boss_decision = 'pending' and deleted_at is null and cancelled_at is null order by created_at limit 8`));
          push('Vencida', overdue);
        }
        // «Por ponerle fecha» (§4): the obras and reports that wait for a date, first in despacho's Hoy and on the boss's
        // Política tile. The title only (agenda_to_schedule has no date: there is none yet).
        if (has(s, 'boss', 'dispatch')) push('Por ponerle fecha', await toSchedule(sql, 10));
        if (has(s, 'dispatch')) {
          push('Ficha técnica incompleta', await sql.query(
            `select e.title from public.events e left join public.event_brief b on b.event_id = e.id
              where e.deleted_at is null and e.cancelled_at is null and public.event_done_on(e.id) is null and e.boss_decision <> 'rejected'
                and (b.event_id is null or b.work_description = '' or b.led_by = '' or b.achievements = '') limit 8`));
        }
        if (has(s, 'camera')) {
          push('Sube el material', await sql.query(
            `select e.title from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = auth.uid()
              where e.deleted_at is null and e.cancelled_at is null and public.event_done_on(e.id) is not null
                and not exists (select 1 from public.media_assets m where m.event_id = e.id and m.kind in ${RAW} and m.deleted_at is null) limit 8`));
          push('Evento asignado', await sql.query(
            `select e.title from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = auth.uid()
              where e.deleted_at is null and e.cancelled_at is null and public.event_done_on(e.id) is null limit 8`));
        }
        if (has(s, 'ivt')) {
          // His obra fichas (Obras, and the card in Hoy): the drafts to finish and send, and how many wait for a date.
          push('Ficha de obra en borrador', await sql.query(`select name as title from public.obra_fichas where stage = 'draft' and deleted_at is null order by updated_at desc limit 5`));
          const waitingDate = (await obraStageCounts(sql)).to_schedule ?? 0;
          if (waitingDate) items.push({ que: 'Esperan fecha (la ponen el jefe o el despacho)', titulo: `${waitingDate} ${waitingDate === 1 ? 'obra' : 'obras'} por ponerle fecha` });
        }
        const unread = await sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where read_at is null`);
        return { items, unread: unread?.n ?? 0 };
      });
      const seen = new Set<string>();
      const all = out.items.filter((i) => !seen.has(i.que + i.titulo) && seen.add(i.que + i.titulo));
      return {
        result: { total: all.length, pendientes: all.slice(0, 12), avisos_sin_leer: out.unread },
        // Their home: the boss's Inicio, Municipios for política, Obras for the IVT, Hoy for the rest.
        goTo: homeFor(s.roles),
      };
    },
  },
  {
    name: 'eventos_por_decidir',
    description:
      'Los eventos que esperan la decisión del jefe (calificar de 1 a 10, aceptar o rechazar): cuántos y cuáles. Úsala cuando pregunten cuántos o qué eventos faltan por calificar o decidir. Nunca da fecha, hora ni lugar.',
    parameters: {},
    required: [],
    fromServer: [],
    roles: ['boss', 'admin', 'dispatch'],
    level: 'cuenta',
    async run(_a, ctx) {
      const s = ctx.session;
      const rows = await db(s, (sql) => sql.query<{ title: string }>(`select title from public.events where boss_decision = 'pending' and deleted_at is null and cancelled_at is null order by created_at limit 50`));
      return {
        result: { total: rows.length, eventos: rows.slice(0, 8).map((r) => ({ titulo: r.title })) },
        goTo: has(s, 'boss', 'admin') ? '/jefe/politica' : '/hoy',
      };
    },
  },
  {
    name: 'estado_pieza',
    description:
      'Cómo va una pieza (video, portada…) buscándola por palabras de su título: estado, color del semáforo, versión y si ya se publicó. Si devuelve varias, pregunta cuál. No aprueba ni cambia nada.',
    parameters: { titulo: { type: 'string', description: 'Palabras del título de la pieza, tal como las dijo la persona.' } },
    required: ['titulo'],
    fromServer: [],
    roles: CONTENT,
    level: 'cuenta',
    async run(a, ctx) {
      const rows = await db(ctx.session, (sql) =>
        sql.query<{ id: string; title: string; status: string; review_level: string; current_version: number; approved_version: number | null; published: number }>(
          `select p.id, p.title, p.status, p.review_level, p.current_version, p.approved_version,
                  (select count(*)::int from public.publications x where x.piece_id = p.id and x.status = 'published' and x.deleted_at is null) as published
             from public.pieces p where p.deleted_at is null order by p.updated_at desc limit 300`,
        ),
      );
      if (!terms(String(a.titulo ?? '')).length) return { result: { encontradas: 0, piezas: [], falta: 'Pregunta qué pieza: una palabra de su título.' } };
      const found = bestMatches(rows, String(a.titulo ?? ''), (r) => r.title);
      const editor = has(ctx.session, 'admin', 'social');
      return {
        result: {
          encontradas: found.length,
          piezas: found.map((p) => ({
            titulo: p.title,
            estado: PIECE_STATUS[p.status]?.label ?? p.status,
            semaforo: p.review_level,
            version: p.current_version,
            version_aprobada: p.approved_version,
            publicada_en_redes: p.published,
          })),
        },
        goTo: found.length === 1 ? (editor ? `/piezas/${found[0].id}` : `/aprobar/${found[0].id}`) : found.length ? (editor ? '/redes' : '/aprobar') : null,
      };
    },
  },
  {
    name: 'dias_de_tweets',
    description: 'Cuántos días de tweets quedan programados, cuántos hay y cuántos esperan aprobación. Habla de días, no de horas.',
    parameters: {},
    required: [],
    fromServer: [],
    roles: ['admin', 'social', 'boss'],
    level: 'cuenta',
    async run(_a, ctx) {
      const r = await db(ctx.session, async (sql) => {
        const st = await tweetStock(sql);
        const draft = await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`);
        return { ...st, draft: draft?.n ?? 0 };
      });
      return { result: { dias: r.daysLeft, programados: r.count, aviso_cuando_quedan: r.threshold, quedan_pocos: r.lowStock, por_aprobar: r.draft }, goTo: '/tweets' };
    },
  },
  {
    name: 'mejores_horas',
    description:
      'Las mejores horas y días para publicar en cada red (lo medido por el equipo) y, si hay datos, la franja que mejor nos ha ido. Es un consejo: nunca bloquea una publicación.',
    parameters: { red: { type: 'string', description: 'La red. Si no la dijo, déjalo vacío y salen todas.', enum: NETWORKS } },
    required: [],
    fromServer: [],
    roles: null,
    level: 'cuenta',
    async run(a, ctx) {
      const red = typeof a.red === 'string' ? a.red : null;
      const r = await db(ctx.session, async (sql) => {
        const windows = ((await sql.one<{ value: PublishingWindows }>(`select value from public.app_settings where key = 'publishing.windows'`))?.value ?? {}) as PublishingWindows;
        const pubs = await sql.query<{ network: string; published_at: Date; views: number | null; inter: number | null }>(
          `select x.network, x.published_at, m.views,
                  coalesce(m.likes, 0) + coalesce(m.comments, 0) + coalesce(m.shares, 0) + coalesce(m.saves, 0) as inter
             from public.publications x
             left join lateral (select * from public.publication_metrics pm where pm.publication_id = x.id order by pm.captured_at desc limit 1) m on true
            where x.status = 'published' and x.deleted_at is null and x.published_at is not null
            limit 2000`,
        );
        return { windows, pubs };
      });
      const measured = bestTimes(
        r.pubs.map((p) => ({ network: p.network, publishedAt: new Date(p.published_at), views: p.views, interactions: p.inter })),
        (d) => dt(d)?.hour ?? 0,
      );
      const nets = red ? [red] : Object.keys(r.windows);
      return {
        result: {
          redes: nets.map((n) => {
            const m = measured.find((x) => x.network === n);
            return {
              red: NETWORK_LABEL[n] ?? n,
              consejo: windowHint(r.windows[n]) || 'No hay mejores horas guardadas para esta red.',
              nota: r.windows[n]?.note ?? '',
              medido: m?.best ? { mejor_franja: m.best.label, publicaciones: m.total, pocos_datos: !m.enoughData } : null,
            };
          }),
        },
        goTo: '/publicar',
      };
    },
  },
  {
    name: 'reglas_de_video',
    description: 'Las reglas de video de cada red guardadas en la plataforma: duración, formato, medidas, peso y largo del copy.',
    parameters: { red: { type: 'string', description: 'La red. Si no la dijo, déjalo vacío y salen todas.', enum: NETWORKS } },
    required: [],
    fromServer: [],
    roles: null,
    level: 'cuenta',
    async run(a, ctx) {
      const red = typeof a.red === 'string' ? a.red : null;
      const rows = await db(ctx.session, (sql) =>
        sql.query<{ network: string; label: string; formats: Record<string, Record<string, unknown>>; copy_max_chars: number; notes: string }>(
          `select network, label, formats, copy_max_chars, notes from public.network_specs where ($1::text is null or network = $1) order by network`,
          [red],
        ),
      );
      return {
        result: {
          redes: rows.map((s) => ({
            red: s.label,
            copy_hasta_caracteres: s.copy_max_chars,
            formatos: Object.entries(s.formats ?? {}).map(([fmt, f]) => ({
              formato: fmt,
              duracion_segundos: f.min_duration_s != null || f.max_duration_s != null ? `${f.min_duration_s ?? 0} a ${f.max_duration_s ?? 'sin máximo'}` : null,
              proporcion: Array.isArray(f.aspects) ? (f.aspects as string[]).join(' o ') : null,
              peso_maximo_mb: f.max_size_mb ?? null,
              ancho_minimo_px: f.min_width ?? null,
            })),
            nota: s.notes,
          })),
        },
        goTo: '/ajustes/redes',
      };
    },
  },
  {
    name: 'buscar_evento',
    description:
      'Busca un evento por palabras de su título y dice en qué va el trabajo (ficha, storyboard, grabación, material, edición, publicado), si el jefe lo aceptó y cuánto material y piezas tiene. NUNCA da fecha, hora, lugar ni contactos: eso no lo tiene.',
    parameters: { texto: { type: 'string', description: 'Palabras del título del evento.' } },
    required: ['texto'],
    fromServer: [],
    roles: SEE_EVENTS,
    level: 'cuenta',
    async run(a, ctx) {
      const rows = await db(ctx.session, (sql) =>
        sql.query<{ id: string; code: string; title: string; work_status: string; boss_decision: string; done: boolean; cancelled: boolean; category: string | null; blocks: number; material: number; pieces: number }>(
          `select e.id, e.code, e.title, e.work_status, e.boss_decision, public.event_done_on(e.id) is not null as done, e.cancelled_at is not null as cancelled, c.name as category,
                  (select count(*)::int from public.storyboard_blocks b join public.storyboards sb on sb.id = b.storyboard_id
                    where sb.event_id = e.id and b.deleted_at is null) as blocks,
                  (select count(*)::int from public.media_assets m where m.event_id = e.id and m.kind in ${RAW} and m.deleted_at is null) as material,
                  (select count(*)::int from public.pieces p where p.event_id = e.id and p.deleted_at is null) as pieces
             from public.events e left join public.categories c on c.id = e.category_id
            where e.deleted_at is null order by e.created_at desc limit 300`,
        ),
      );
      if (!terms(String(a.texto ?? '')).length) return { result: { encontrados: 0, eventos: [], falta: 'Pregunta qué evento: una palabra de su título.' } };
      const found = bestMatches(rows, String(a.texto ?? ''), (r) => `${r.code} ${r.title}`);
      return {
        result: {
          encontrados: found.length,
          eventos: found.map((e) => ({
            codigo: e.code,
            titulo: e.title,
            trabajo: WORK_STATUS[e.work_status]?.label ?? e.work_status,
            decision_del_jefe: BOSS_DECISION[e.boss_decision]?.label ?? e.boss_decision,
            ya_se_hizo: e.done,
            cancelado: e.cancelled,
            categoria: e.category,
            bloques_de_storyboard: e.blocks,
            archivos_de_material: e.material,
            piezas: e.pieces,
          })),
          nota: 'La fecha, la hora y el lugar no están aquí: solo se ven en la Agenda, para quien tiene permiso.',
        },
        goTo: found.length === 1 ? `/eventos/${found[0].id}` : found.length ? '/agenda' : null,
      };
    },
  },
  {
    name: 'preparar_aviso',
    description:
      'Deja PREPARADO un aviso para todo un rol (o para todo el equipo). No lo manda: queda pendiente hasta que administración lo confirme en el panel. Di a cuántas personas iría y que falta la confirmación. Sin fechas, horas, días, lugares ni contactos de ningún evento: si los trae, no se prepara.',
    parameters: {
      rol: { type: 'string', description: 'A quién va: un rol del equipo, o «todos».', enum: [...INVITABLE_ROLES, 'todos'] },
      texto: { type: 'string', description: 'El aviso, corto y claro, como lo leerá la gente.' },
    },
    required: ['rol', 'texto'],
    fromServer: [],
    roles: ['admin', 'boss'],
    level: 'prepara',
    entity: 'assistant_drafts',
    async run(a, ctx) {
      const rol = String(a.rol);
      const texto = String(a.texto ?? '');
      if (texto.length > NOTICE_MAX) throw new ToolError(NOTICE_TOO_LONG);
      // Rule 4, in code for both brains (the prompt is only a preference): no contacts or address; a
      // notice that names an event (the shared detector, with the titles this person can see) only asks
      // the team for something, saying nothing of the event but a deadline for the work. What goes is
      // stored as it was said (a deadline keeps its time), without contacts or addresses.
      const issues = noticeIssues(texto, await loadTitles(ctx.session));
      if (issues.length) throw new ToolError(noticeRefusal(issues));
      const body = redactContacts(texto).trim().slice(0, NOTICE_MAX);
      if (body.length < 3) throw new ToolError('Falta el texto del aviso.');
      const people = new Set<string>();
      for (const r of rol === 'todos' ? INVITABLE_ROLES : [rol]) for (const id of await usersWithRole(r)) people.add(id);
      const label = rol === 'todos' ? 'todo el equipo' : ROLE_LABEL[rol as Role];
      const row = await system((sql) =>
        sql.one<{ id: string }>(
          `insert into public.assistant_drafts (kind, created_by, conversation_id, summary, body, target)
           values ('aviso', $1, $2, $3, $4, $5::text::jsonb) returning id`,
          [ctx.session.userId, ctx.conversationId, `Aviso para ${label} (${people.size} ${people.size === 1 ? 'persona' : 'personas'})`, body, JSON.stringify({ role: rol })],
        ),
      );
      return {
        result: { preparado: true, para: label, personas: people.size, falta: 'Lo confirma administración en Ajustes → Asistente → Por confirmar. Hasta entonces no sale.' },
        entityId: row!.id,
      };
    },
  },
  {
    name: 'marcar_avisos_leidos',
    description: 'Marca como leídos TODOS los avisos sin leer de quien pregunta (solo los suyos). Queda anotado y administración lo puede deshacer.',
    parameters: {},
    required: [],
    fromServer: [],
    roles: null,
    level: 'hace',
    entity: 'notifications',
    async run(_a, ctx) {
      const ids = await db(ctx.session, async (sql) =>
        (await sql.query<{ id: string }>(`update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null returning id`)).map((r) => r.id),
      );
      return { result: { marcados: ids.length }, detail: { ids }, skipRecord: ids.length === 0, goTo: '/avisos' };
    },
    async undo(a) {
      const ids = Array.isArray(a.detail?.ids) ? (a.detail.ids as string[]) : [];
      if (!ids.length || !a.user_id) return;
      await system((sql) => sql.query(`update public.notifications set read_at = null where id = any ($1::uuid[]) and user_id = $2`, [ids, a.user_id]));
    },
  },
  {
    name: 'ver_tutorial',
    description:
      'Los tutoriales de las pantallas de quien pregunta: un recorrido «mira aquí», paso a paso, en la misma pantalla. Con pantalla (como /publicar, /hoy o /eventos/[id]) da el de esa pantalla y el botón para empezarlo; sin pantalla, la lista. Úsala cuando pida un tutorial, que le enseñes o le muestres cómo se usa una pantalla, o ayuda para usar la plataforma. No lee datos de nadie.',
    parameters: {
      pantalla: { type: 'string', description: 'La pantalla, como /publicar, /hoy o /eventos/[id]. Sin ella, la lista de sus tutoriales.' },
      tutorial: { type: 'string', description: 'El id de uno de sus tutoriales (de la lista), si ya sabe cuál quiere.' },
    },
    required: [],
    fromServer: [],
    roles: null,
    level: 'cuenta',
    async run(a, ctx) {
      // The tutorials follow «Ver como» (they are the menu's), and their screen must open for the person.
      const s = ctx.session;
      const menu = menuRoles(s);
      const home = homeFor(menu);
      const mine = toursForRoles(menu, { admin: s.roles.includes('admin') }).filter((t) => canOpen(screenOfTour(t, home), s.roles));
      const asked = typeof a.tutorial === 'string' ? mine.find((t) => t.id === a.tutorial) : undefined;
      const screen = typeof a.pantalla === 'string' ? screenFor(a.pantalla)?.href ?? null : null;
      const here = asked ? [asked] : screen ? toursOn(mine, screen, home) : [];
      const pick = here[0] ?? null;
      const href = pick ? tourHref(pick, home) : null;
      // The whole list: the welcome one first, then the ones of fewer roles (the person's own screens before the shared).
      const list = asked || screen ? here : [...mine].sort((x, y) => (x.id === 'bienvenida' ? 0 : x.roles.length) - (y.id === 'bienvenida' ? 0 : y.roles.length));
      return {
        result: {
          tutoriales: list.slice(0, 12).map((t) => ({ id: t.id, titulo: t.title, pantalla: screenFor(screenOfTour(t, home))?.label ?? null, pasos: stepsFor(t, menu) })),
          ...(screen && !pick ? { pantalla: screenFor(screen)?.label ?? screen, sin_tutorial: true } : {}),
        },
        goTo: href,
        tutorial: pick ? { id: pick.id, label: tutorialLabel(pick.title), href } : null,
      };
    },
  },
  {
    name: 'avisar_al_equipo',
    description:
      'Avisa de verdad a administración de que esta conversación necesita una persona. Úsala cuando pidan hablar con alguien, cuando algo falla y no lo puedes resolver, o cuando dudan de que seas útil. Nunca digas que avisaste sin llamarla.',
    parameters: { motivo: { type: 'string', description: 'En una frase, qué necesita la persona.' } },
    required: [],
    fromServer: ['conversacion'],
    roles: null,
    level: 'hace',
    entity: 'assistant_conversations',
    async run(a, ctx) {
      const conv = typeof a.conversacion === 'string' ? a.conversacion : null;
      if (!conv) throw new ToolError('No hay una conversación abierta para avisar.');
      const motivo = String(a.motivo ?? '').trim() || 'Pidió hablar con alguien del equipo.';
      const r = await ctx.escalate(conv, motivo);
      return { result: { avisado: true, ya_estaba_avisado: r.alreadyNotified, a_quien: r.to.join(' y ') }, entityId: conv, detail: { motivo: redact(motivo) } };
    },
  },
];

// ---------------------------------------------------------------------------
// Tutorials (ver_tutorial): the catalogue is data (src/lib/guides); nothing is read from the database.
// ---------------------------------------------------------------------------
const screenOfTour = (t: Tour, home: string) => (t.screen === HOME_SCREEN ? home : t.screen.split('?')[0]);

/** The tutorials of one screen (a SCREENS pattern): its own first, then the ones of one of its tabs, then the welcome
 * one when it is the person's home. */
export function toursOn(tours: readonly Tour[], screen: string, home: string): Tour[] {
  const rank = (t: Tour) => (t.screen === HOME_SCREEN ? 2 : t.screen.includes('?') ? 1 : 0);
  return tours.filter((t) => screenOfTour(t, home) === screen).sort((x, y) => rank(x) - rank(y) || x.roles.length - y.roles.length);
}

/** How many steps have a text for these roles (some are only for one role). */
function stepsFor(t: Tour, roles: readonly Role[]): number {
  return t.steps.filter((st) => {
    const b = st.body;
    return typeof b === 'string' || TEAM_ROLES.some((r) => roles.includes(r) && !!b[r]);
  }).length;
}

/** «Ver el tutorial de Publicar» («Cómo se usa Publicar»); otherwise «Ver el tutorial: Cómo se crea un evento». */
export function tutorialLabel(title: string): string {
  const m = /^Cómo se usa (.+)$/.exec(title);
  return contract(m ? `Ver el tutorial de ${m[1]}` : `Ver el tutorial: ${title}`);
}

/** The tools offered to these roles. avisar_al_equipo only with an open conversation. */
export function toolsFor(roles: Role[], hasConversation = true): Tool[] {
  return TOOLS.filter((t) => (t.roles === null || t.roles.some((r) => roles.includes(r))) && (hasConversation || t.name !== 'avisar_al_equipo'));
}

/** OpenAI-style function specs. Server-set parameters are not shown to the model. */
export function toSpecs(tools: Tool[]): ToolSpec[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(t.parameters).filter(([k]) => !t.fromServer.includes(k))),
        required: t.required.filter((k) => !t.fromServer.includes(k)),
      },
    },
  }));
}

export type ToolRun = { tool: string; ok: boolean; result?: unknown; error?: string; goTo?: string | null; tutorial?: TutorialLink | null };

/** Only declared parameters pass, with their declared type; identity comes from the server. */
export function cleanArgs(t: Tool, raw: Record<string, unknown>, server: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(t.parameters)) {
    if (t.fromServer.includes(k)) continue;
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    if (p.type === 'string') {
      const s = String(v).trim().slice(0, 500);
      if (!s) continue;
      if (p.enum) {
        const e = plain(s).replace(/ /g, '_');
        const hit = p.enum.find((x) => x === s || x === e || plain(x) === plain(s));
        if (!hit) throw new ToolError(`«${s}» no vale para ${k}. Usa: ${p.enum.join(', ')}.`);
        out[k] = hit;
      } else out[k] = s;
    } else if (p.type === 'integer') {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.trunc(n);
    } else out[k] = v === true || v === 'true';
  }
  for (const k of t.required) if (!t.fromServer.includes(k) && out[k] === undefined) throw new ToolError(`Falta ${k}.`);
  for (const k of t.fromServer) if (server[k] !== undefined) out[k] = server[k];
  return out;
}

/**
 * Runs one call from the model (or the demo brain). A name that is not in THIS person's
 * menu is not run. Errors go back as they are (an «ese pedido no existe» must reach the
 * model so it says so). What writes ('hace') is recorded here, in one single place.
 */
export async function runTool(name: string, rawArgs: unknown, offered: Tool[], ctx: ToolCtx): Promise<ToolRun> {
  const t = offered.find((x) => x.name === name);
  if (!t) return { tool: name || '(sin nombre)', ok: false, error: 'Esa herramienta no existe.' };
  let parsed: Record<string, unknown>;
  try {
    const v = typeof rawArgs === 'string' ? (rawArgs.trim() ? JSON.parse(rawArgs) : {}) : rawArgs ?? {};
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    parsed = v as Record<string, unknown>;
  } catch {
    return { tool: t.name, ok: false, error: 'No entendí los argumentos.' };
  }
  try {
    const args = cleanArgs(t, parsed, { conversacion: ctx.conversationId });
    const out = await t.run(args, ctx);
    if (t.level === 'hace' && !out.skipRecord) await recordAction(t, args, out, ctx);
    return { tool: t.name, ok: true, result: out.result, goTo: out.goTo ?? null, ...(out.tutorial ? { tutorial: out.tutorial } : {}) };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : friendlyDbError(e);
    if (!(e instanceof ToolError)) console.error(`[asistente] herramienta ${t.name}:`, (e as Error)?.message);
    return { tool: t.name, ok: false, error: msg };
  }
}

async function recordAction(t: Tool, args: Record<string, unknown>, out: ToolOutput, ctx: ToolCtx) {
  try {
    const shown = Object.fromEntries(Object.entries(args).filter(([k]) => !t.fromServer.includes(k)).map(([k, v]) => [k, typeof v === 'string' ? redact(v) : v]));
    await system((sql) =>
      sql.query(
        `insert into public.assistant_actions (conversation_id, user_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5, $6::text::jsonb)`,
        [ctx.conversationId, ctx.session.userId, t.name, t.entity ?? null, out.entityId ?? null, JSON.stringify({ args: shown, result: out.result, ...(out.detail ?? {}) })],
      ),
    );
  } catch (e) {
    console.error('[asistente] no se pudo anotar la acción:', (e as Error)?.message);
  }
}

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
