'use server';

import { z } from 'zod';
import { DateTime } from 'luxon';
import { act, UserError } from './run';
import { TZ, dt } from '../time';
import type { Sql } from '../db';
import { notify, usersWithRole } from '../notify';
import {
  correctedEventNotice,
  decisionNotice,
  newEventNotice,
  noticeEventTitle,
  noticeRecipients,
  noticeTitleChanged,
  type AgendaNotice,
} from '@/lib/domain/agenda-notices';

const text = (max: number) => z.string().trim().max(max).default('');

// Event titles reach every role (Redes and Supervisión too), the notices and the phones: they never
// carry the event's when, which has its own fields (rule 4). Two kinds of check:
// - always refused, because they can only be a when: a clock time (9:30, 3 pm, 21 hrs, nueve de la
//   noche, mediodía), «la una», «las N» and «de N a M» unless something counted follows («a las 3
//   escuelas», «de 8 a 12 años»), a weekday, hoy, pasado mañana, esta noche, and a date with its year
//   or after «el» (el 28/10);
// - refused when it is the event's own date: «23 de enero», «23/1», «el 23», «mañana», and «Domingo»
//   followed by a name (Escuela Domingo Savio) on a Sunday. A place named after a date («Barrio 23 de
//   Enero») passes on any other day. Whoever cannot see the event's date cannot add a new one either:
//   checking it against the date would tell them the date.
const DATED = 'El título no lleva fecha ni hora: eso va en sus campos.';
const HOUR = String.raw`(?:0?[1-9]|1\d|2[0-3]|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)`;
const MIN = String.raw`(?:[:.][0-5]\d)?`;
const NUM_END = String.raw`(?:h|hs|hrs)?(?![\p{L}\d]|[.,]\d)`;
const ALWAYS: RegExp[] = [
  /(?<![\d.,:/])(?:[01]?\d|2[0-3])\s?[:h]\s?[0-5]\d(?![\d.,:])/iu,
  /(?<![\d.,])(?:(?:[01]?\d|2[0-3])\.[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\s?(?:h|hs|hrs?|horas)(?!\p{L})/iu,
  /(?<!(?:^|\P{L})(?:de|por|durante|cada|en|unas|unos)\s+)(?<![\p{L}\d.,])(?:1[3-9]|2[0-3])\s?(?:h|hs|hrs?|horas)(?!\p{L})/iu,
  /(?<![\p{L}\d.,])(?:[01]?\d|2[0-3])(?:[:.h][0-5]\d)?\s?[ap]\.?\s?m\.?(?!\p{L})/iu,
  new RegExp(String.raw`(?<![\p{L}\d.,])${HOUR}${MIN}\s+(?:y\s+(?:media|cuarto)|en\s+punto|(?:de|en|por)\s+la\s+(?:mañana|tarde|noche|madrugada))(?!\p{L})`, 'iu'),
  /(?<!\p{L})(?:mediod[ií]a|medianoche|hoy|pasado\s+mañana|est[ae]\s+(?:noche|tarde|mañana))(?!\p{L})/iu,
  /(?<!\p{L})(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\.?\s?(?:0?[1-9]|[12]\d|3[01])(?!\d)/iu,
  /(?<![\d.,/-])(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s?([/.-])\s?\d{1,2}\s?\1\s?(?:\d{4}|\d{2}))(?!\d)/u,
];
// «las 3» is an hour unless what follows is counted. What can follow an hour without being counted
// are the language's function words ending in -s (a closed class), verbs in -mos and the hour's own words.
const NOT_COUNTED = new Set(
  ('antes después despues tras pues mientras entonces además ademas apenas jamás jamas quizás quizas detrás detras atrás atras ' +
    'más mas menos todos todas ambos ambas unos unas los las les nos sus mis tus estos estas esos esas aquellos aquellas ' +
    'otros otras varios varias algunos algunas muchos muchas pocos pocas demás demas nosotros nosotras ustedes ellos ellas ' +
    'mismos mismas nuestros nuestras juntos juntas horas hrs hs exactas pasadas puntuales').split(' '),
);
const counted = (rest: string) => {
  const w = /^\s+(\p{L}+)/u.exec(rest)?.[1]?.toLowerCase();
  return !!w && w.endsWith('s') && !w.endsWith('mos') && !NOT_COUNTED.has(w);
};
const HOUR_SAID = new RegExp(String.raw`(?<!\p{L})(?:la\s+(?:0?1|una)|(las)\s+${HOUR}|(de)\s+(?:las\s+)?${HOUR}${MIN}\s+a\s+(?:las\s+)?${HOUR})${MIN}${NUM_END}`, 'giu');
const WEEKDAY = /(?<!\p{L})(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)(?!\p{L})/giu;
// «Domingo» is also a name: Santo Domingo always, Domingo Savio unless the event is on a Sunday.
const SANTO_BEFORE = /(?<!\p{L})(?:santo|sto\.)\s+$/iu;
const NAME_AFTER = /^\s+(?!(?:De|Del|La|Las|El|Los|Y|En|A|Al)(?!\p{L}))\p{Lu}\p{Ll}/u;

function alwaysWhen(t: string): boolean {
  if (ALWAYS.some((re) => re.test(t))) return true;
  for (const m of t.matchAll(HOUR_SAID)) if (!((m[1] || m[2]) && counted(t.slice(m.index + m[0].length)))) return true;
  for (const m of t.matchAll(WEEKDAY)) {
    const sunday = /^domingo$/i.test(m[0]);
    if (sunday && SANTO_BEFORE.test(t.slice(0, m.index))) continue;
    if (m[0] === 'Domingo' && NAME_AFTER.test(t.slice(m.index + m[0].length))) continue;
    return true;
  }
  return dateMentions(t).some((d) => d.always);
}

// A date a title names: `on` says whether it is a given day, `key` compares it with another title's.
type DateMention = { text: string; key: string; on: (d: DateTime) => boolean; always: boolean; name: boolean };
const MONTH = 'ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?';
const MONTH_NO: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const DAY = '(0?[1-9]|[12]\\d|3[01])';
const DAY_MONTH = new RegExp(String.raw`(?<![\p{L}\d.,])${DAY}(?:ro|ero|°|º)?\s+(?:de\s+)?(${MONTH})\.?(?!\p{L})`, 'giu');
const NUMERIC = new RegExp(String.raw`(?<![\d.,/-])${DAY}\s?([/-])\s?(0?[1-9]|1[0-2])(?![\d]|[.,/-]\d)`, 'gu');
const DAY_ONLY = new RegExp(String.raw`(?<!\p{L})(?:(?:el|del|al)\s+(?:d[ií]a\s+)?|d[ií]a\s+)${DAY}(?![\p{L}\d%°º]|\s?[/.-]\s?\d|\s+(?:de\s+)?(?:${MONTH})\.?(?!\p{L}))`, 'giu');
const TOMORROW = /(?<!\p{L})mañana(?!\p{L})/giu;
const NOUN_BEFORE = /(?<!\p{L})(?:la|una|un|el|cada|toda|esa|aquella|de|en|por|buena|media|esta|pasado)\s+$/iu;
const DATE_ARTICLE = /(?<!\p{L})(?:el|del|al|d[ií]a)\s+$/iu;
const SUNDAY_NAME = /(?<!\p{L})Domingo(?!\p{L})/gu;

const dayMonth = (text: string, day: number, month: number, always = false, name = false): DateMention => ({
  text, key: `${day}/${month}`, on: (d) => d.day === day && d.month === month, always, name,
});

// «mañana» counts only as the day after today: not as a noun (la mañana, Mañana Deportiva) nor in
// «pasado mañana» / «esta mañana» (always refused).
function dateMentions(t: string): DateMention[] {
  const out: DateMention[] = [];
  for (const m of t.matchAll(DAY_MONTH)) out.push(dayMonth(m[0].trim(), +m[1], MONTH_NO[m[2].slice(0, 3).toLowerCase()], false, true));
  for (const m of t.matchAll(NUMERIC)) out.push(dayMonth(m[0], +m[1], +m[3], DATE_ARTICLE.test(t.slice(0, m.index))));
  for (const m of t.matchAll(DAY_ONLY)) out.push({ text: m[0], key: m[1].replace(/^0/, ''), on: (d) => d.day === +m[1], always: false, name: false });
  for (const m of t.matchAll(TOMORROW)) {
    if (NOUN_BEFORE.test(t.slice(0, m.index)) || /^\s+(?:de\s|\p{Lu})/u.test(t.slice(m.index + m[0].length))) continue;
    const d = DateTime.now().setZone(TZ).plus({ days: 1 });
    out.push(dayMonth(m[0], d.day, d.month));
  }
  for (const m of t.matchAll(SUNDAY_NAME)) {
    if (SANTO_BEFORE.test(t.slice(0, m.index)) || !NAME_AFTER.test(t.slice(m.index + m[0].length))) continue;
    const name = /^Domingo\s+\p{L}+/u.exec(t.slice(m.index))?.[0] ?? m[0];
    out.push({ text: name, key: 'domingo', on: (d) => d.weekday === 7, always: false, name: true });
  }
  return out;
}

// A title naming the event's own date, or (when that date is hidden from the person) a date its
// stored title did not already name.
function datedTitle(title: string, own: DateTime | null, before = ''): DateMention | undefined {
  const named = dateMentions(title);
  if (own) return named.find((d) => d.on(own));
  const had = new Set(dateMentions(before).map((d) => d.key));
  return named.find((d) => !had.has(d.key));
}

const datedMessage = (d: DateMention) => (d.name ? `${DATED} Si «${d.text}» es el nombre del sitio, ponlo en «A dónde se va».` : DATED);

async function refuseDatedTitle(sql: Sql, id: string, title: string) {
  const ev = await sql.one<{ title: string; starts_at: string | Date | null }>(
    `select e.title, sc.starts_at from public.events e left join public.event_schedule sc on sc.event_id = e.id where e.id = $1`,
    [id],
  );
  // The schedule row comes back only to whoever may see the date (RLS).
  const hit = datedTitle(title, dt(ev?.starts_at), ev?.title ?? '');
  if (hit) throw new UserError(datedMessage(hit));
}

const titleField = z
  .string()
  .trim()
  .min(3, 'Escribe un título.')
  .max(140, 'Máximo 140 caracteres.')
  .refine((t) => !alwaysWhen(t), DATED);

const scheduleShape = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Elige la hora.'),
  durationMin: z.coerce.number().int().min(15, 'Mínimo 15 minutos.').max(24 * 60),
  exactAddress: text(500),
  directions: text(2000),
  siteContacts: text(1000),
};

const briefShape = {
  workDescription: text(2000),
  ledBy: text(300),
  inCharge: text(300),
  achievements: text(2000),
  keyFacts: text(3000),
  protocol: text(2000),
  notes: text(3000),
};

const eventSchema = z.object({
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  urgency: z.coerce.number().int().min(1).max(3).default(2),
  cameraUserId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  allowOverlap: z.boolean().default(false),
  ...scheduleShape,
  ...briefShape,
});

// Agenda notices go out AFTER the transaction (notify() opens its own system connection).
async function sendAgendaNotice(n: AgendaNotice, recipients: () => Promise<string[]>) {
  try {
    const userIds = await recipients();
    if (userIds.length) await notify({ userIds, kind: n.kind, title: n.title, body: n.body, link: n.link, key: n.key });
  } catch (e) {
    // The change is already saved: a failed notice must not turn it into an error.
    console.warn('[notify] agenda:', (e as Error).message);
  }
}

function toRange(date: string, time: string, durationMin: number) {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
  if (!start.isValid) throw new UserError('La fecha u hora no es válida.');
  return { starts: start.toUTC().toISO()!, ends: start.plus({ minutes: durationMin }).toUTC().toISO()! };
}

export async function createEvent(raw: unknown) {
  return act(eventSchema, raw, async (sql, i, s) => {
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    const dated = datedTitle(i.title, DateTime.fromISO(i.date, { zone: TZ }));
    if (dated) throw new UserError(datedMessage(dated));
    if (!i.allowOverlap) {
      const clash = await sql.one<{ title: string }>(
        `select e.title from public.event_schedule sc join public.events e on e.id = sc.event_id
          where e.deleted_at is null and e.boss_decision <> 'rejected' and sc.starts_at < $2 and sc.ends_at > $1 limit 1`,
        [starts, ends],
      );
      if (clash) throw new UserError(`Choca con «${clash.title}». Si igual quieres guardarlo, marca «Guardar aunque choque».`);
    }
    const ev = await sql.one<{ id: string }>(
      `insert into public.events (title, place_name, municipality, summary, category_id, urgency, created_by)
       values ($1, $2, $3, $4, $5, $6, auth.uid()) returning id`,
      [i.title, i.placeName, i.municipality, i.summary, i.categoryId, i.urgency],
    );
    await sql.query(
      `insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, directions, site_contacts) values ($1, $2, $3, $4, $5, $6)`,
      [ev!.id, starts, ends, i.exactAddress, i.directions, i.siteContacts],
    );
    await sql.query(
      `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ev!.id, i.workDescription, i.ledBy, i.inCharge, i.achievements, i.keyFacts, i.protocol, i.notes],
    );
    const assignCam = !!i.cameraUserId && !s.roles.includes('secretary');
    if (assignCam) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera')`, [ev!.id, i.cameraUserId]);
    }
    return { id: ev!.id, cameraUserId: assignCam ? i.cameraUserId : null, title: i.title, actorId: s.userId };
  }, { revalidate: ['/agenda', '/hoy'] }).then(async (r) => {
    if (r.ok && r.data?.cameraUserId) {
      // This one is also emailed: only the title, scrubbed of anything like a date (rule 4).
      await notify({ userIds: [r.data.cameraUserId], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(r.data.title), link: `/eventos/${r.data.id}`, key: `assigned:${r.data.id}`, email: true });
    }
    if (r.ok && r.data) {
      // Proposed by secretaría or created by despacho/admin: the boss decides, despacho follows.
      const { actorId } = r.data;
      await sendAgendaNotice(newEventNotice(r.data), async () =>
        noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return r;
  });
}

// Secretaría fixes her own proposal while the boss has not decided. Only the columns the
// database lets her touch (guard_event_update): no date, place details, brief or urgency.
const proposalSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
});

export async function updateProposal(raw: unknown) {
  return act(proposalSchema, raw, async (sql, i, s) => {
    const before = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.id]);
    await refuseDatedTitle(sql, i.id, i.title);
    const r = await sql.query(
      `update public.events set title = $2, place_name = $3, municipality = $4, summary = $5, category_id = $6
        where id = $1 and created_by = auth.uid() and boss_decision = 'pending' and deleted_at is null returning id`,
      [i.id, i.title, i.placeName, i.municipality, i.summary, i.categoryId],
    );
    if (!r.length || !before) throw new UserError('Ya no se puede cambiar: el jefe ya decidió.');
    return { id: i.id, title: i.title, retitled: noticeTitleChanged(before.title, i.title), actorId: s.userId };
  }, { revalidate: ['/agenda', '/eventos', '/hoy'] }).then(async (r) => {
    if (r.ok && r.data?.retitled) {
      // The boss decides by the notice: he must see the corrected title, not the old one.
      const { actorId } = r.data;
      await sendAgendaNotice(correctedEventNotice(r.data, new Date().toISOString().slice(0, 19)), async () =>
        noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return r;
  });
}

const updateEventSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  urgency: z.coerce.number().int().min(1).max(3),
});

export async function updateEvent(raw: unknown) {
  return act(updateEventSchema, raw, async (sql, i) => {
    await refuseDatedTitle(sql, i.id, i.title);
    const r = await sql.query(
      `update public.events set title = $2, place_name = $3, municipality = $4, summary = $5, category_id = $6, urgency = $7 where id = $1 returning id`,
      [i.id, i.title, i.placeName, i.municipality, i.summary, i.categoryId, i.urgency],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar este evento.');
  }, { revalidate: ['/agenda', '/eventos'] });
}

export async function updateSchedule(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), ...scheduleShape }), raw, async (sql, i) => {
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    // Moving the event onto a date its title names would put that date in the title.
    const ev = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.id]);
    if (ev && datedTitle(ev.title, DateTime.fromISO(i.date, { zone: TZ }))) throw new UserError('El título dice esa fecha: cámbialo primero.');
    const r = await sql.query(
      `update public.event_schedule set starts_at = $2, ends_at = $3, exact_address = $4, directions = $5, site_contacts = $6 where event_id = $1 returning event_id`,
      [i.id, starts, ends, i.exactAddress, i.directions, i.siteContacts],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar la fecha.');
  }, { revalidate: ['/agenda', '/eventos'] });
}

export async function updateBrief(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), ...briefShape }), raw, async (sql, i) => {
    const r = await sql.query(
      `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, auth.uid())
       on conflict (event_id) do update set work_description = excluded.work_description, led_by = excluded.led_by, in_charge = excluded.in_charge,
         achievements = excluded.achievements, key_facts = excluded.key_facts, protocol = excluded.protocol, notes = excluded.notes, updated_by = auth.uid()
       returning event_id`,
      [i.id, i.workDescription, i.ledBy, i.inCharge, i.achievements, i.keyFacts, i.protocol, i.notes],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar la ficha.');
  }, { revalidate: ['/eventos'] });
}

export async function bossDecide(raw: unknown) {
  return act(
    z.object({ id: z.string().uuid(), priority: z.coerce.number().int().min(1).max(10).nullable(), decision: z.enum(['pending', 'accepted', 'rejected']) }),
    raw,
    async (sql, i, s) => {
      // The database lets admin and despacho change any column; deciding is the boss's alone.
      if (!s.roles.includes('boss')) throw new UserError('Solo el jefe decide.');
      const before = await sql.one<{ boss_decision: string; title: string; created_by: string | null }>(
        `select boss_decision, title, created_by from public.events where id = $1`,
        [i.id],
      );
      const r = await sql.query(`update public.events set priority = $2, boss_decision = $3 where id = $1 returning id`, [i.id, i.priority, i.decision]);
      if (!r.length || !before) throw new UserError('No autorizado.');
      return { changed: before.boss_decision !== i.decision, title: before.title, createdBy: before.created_by, actorId: s.userId };
    },
    { revalidate: ['/agenda', '/eventos', '/jefe'] },
  ).then(async (r) => {
    const i = raw as { id: string; decision: string };
    if (r.ok && r.data?.changed && (i.decision === 'accepted' || i.decision === 'rejected')) {
      // Whoever proposed it and despacho learn the decision (never the date or place).
      const { createdBy, actorId, title } = r.data;
      await sendAgendaNotice(decisionNotice({ id: i.id, title }, i.decision, new Date().toISOString().slice(0, 16)), async () =>
        noticeRecipients([createdBy, ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return r;
  });
}

export async function setWorkStatus(raw: unknown) {
  return act(
    z.object({ id: z.string().uuid(), status: z.enum(['brief', 'storyboard', 'recording', 'material', 'editing', 'published']) }),
    raw,
    async (sql, i) => {
      await sql.query(`update public.events set work_status = $2 where id = $1`, [i.id, i.status]);
    },
    { revalidate: ['/agenda', '/eventos'] },
  );
}

export async function markDone(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i) => {
    await sql.query(`select public.mark_event_done($1)`, [i.id]);
  }, { revalidate: ['/agenda', '/eventos', '/biblioteca'] });
}

export async function assignCamera(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), userId: z.string().uuid(), on: z.boolean() }), raw, async (sql, i) => {
    if (i.on) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera') on conflict do nothing`, [i.id, i.userId]);
      const t = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.id]);
      return { notifyUser: i.userId, title: t?.title ?? '' };
    }
    await sql.query(`delete from public.event_assignments where event_id = $1 and user_id = $2 and duty = 'camera'`, [i.id, i.userId]);
    return null;
  }, { revalidate: ['/eventos'] }).then(async (r) => {
    if (r.ok && r.data) {
      const i = raw as { id: string };
      await notify({ userIds: [r.data.notifyUser], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(r.data.title), link: `/eventos/${i.id}`, key: `assigned:${i.id}`, email: true });
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------
const blockSchema = z.object({
  id: z.string().uuid().optional(),
  shot: text(200),
  angle: text(200),
  bossLine: text(2000),
  broll: text(1000),
  fact: text(500),
  factSource: text(300),
});

export async function saveStoryboard(raw: unknown) {
  return act(z.object({ eventId: z.string().uuid(), speech: text(10000), blocks: z.array(blockSchema).max(60) }), raw, async (sql, i) => {
    for (const b of i.blocks) {
      if (b.fact && !b.factSource) throw new UserError('Cada dato que dice el jefe necesita su fuente.');
    }
    const sb = await sql.one<{ id: string }>(
      `insert into public.storyboards (event_id, speech, updated_by) values ($1, $2, auth.uid())
       on conflict (event_id) do update set speech = excluded.speech, updated_by = auth.uid() returning id`,
      [i.eventId, i.speech],
    );
    if (!sb) throw new UserError('No tienes permiso para el storyboard.');
    const keep = i.blocks.filter((b) => b.id).map((b) => b.id!);
    await sql.query(
      `update public.storyboard_blocks set deleted_at = now() where storyboard_id = $1 and deleted_at is null and not (id = any($2::uuid[]))`,
      [sb.id, keep],
    );
    for (const [pos, b] of i.blocks.entries()) {
      if (b.id) {
        await sql.query(
          `update public.storyboard_blocks set position = $2, shot = $3, angle = $4, boss_line = $5, broll = $6, fact = $7, fact_source = $8 where id = $1`,
          [b.id, pos, b.shot, b.angle, b.bossLine, b.broll, b.fact, b.factSource],
        );
      } else {
        await sql.query(
          `insert into public.storyboard_blocks (storyboard_id, position, shot, angle, boss_line, broll, fact, fact_source) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sb.id, pos, b.shot, b.angle, b.bossLine, b.broll, b.fact, b.factSource],
        );
      }
    }
    await sql.query(`update public.events set work_status = 'recording' where id = $1 and work_status in ('brief', 'storyboard')`, [i.eventId]);
  }, { revalidate: ['/eventos', '/hoy'] });
}
