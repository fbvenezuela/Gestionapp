import { createHash } from 'node:crypto';
import type { DateTime } from 'luxon';
import { sealContact } from '../../participation/contact-crypto';
import { secretDigest } from '../../participation/keys';
import { textPdf } from '../../participation/pdf';
import { generateSecret, newReference } from '../../participation/receipt-code';
import { localBucket } from '../../storage/buckets';
import { parseSnapshot, type WebKind } from '../../web/schema';
import { asPerson, type SeedCtx } from './context';
import { demoThumbBytes } from './thumbs';
import { DEMO_DOCUMENTS, DEMO_EPISODES, DEMO_FAQS, DEMO_INDICATORS, DEMO_NEWS, DEMO_NOTICES, DEMO_PROJECTS, DEMO_SOURCE, p } from './web-content';
import { AREA_OF, WEB_DEMO_USERS } from './web-people';
import { DEMO_REQUESTS, type DemoRequest } from './web-requests';

// The public website and the attention desk in the demo (design §8, D-95). Two parts, both at the END of the demo
// seed so every earlier row keeps its demo id:
//   seedWebPeople   the people of the new roles (always: the RLS tests use them too), and the two responsibles' areas.
//   seedWebContent  only for the demo server (seedDemo(…, { webContent: true })): the published content (news,
//                   projects, episodes, documents with small generated PDFs, notices, FAQs, indicators, the skeleton
//                   pages), a news item scheduled, two unpublished and a live project with a change waiting for
//                   approval; and the 60 citizen requests with their history, notes, replies, supports, files, contacts
//                   (encrypted with the demo key) and «lo atendido».
// Everything INVENTED and marked «(demo)». Ids are fixed (stableId), the rest comes from fixed lists and fixed bytes:
// the same database on every demo server. Content is written as the people who would write it (the editor, the
// publisher: asPerson), so the history says who; the requests as the system (a citizen has no account), with the
// times a real case would have (the staff functions would stamp everything «now»), always following the state machine.

/** A valid v4 uuid from a name: the same on every server (like stable-ids.ts and seed-parts/chat.ts). */
export function stableId(name: string): string {
  const x = createHash('md5').update(`fb-demo-web:${name}`).digest('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
const bytesOf = (name: string) => new Uint8Array(createHash('sha256').update(`fb-demo-web:${name}`).digest());

export async function seedWebPeople(ctx: SeedCtx): Promise<void> {
  const { sql, ids } = ctx;
  for (const u of WEB_DEMO_USERS) {
    await sql.query(`insert into public.invitations (id, email, full_name, roles, invited_by) values ($1, $2, $3, $4::public.app_role[], $5)`, [
      stableId(`invitation:${u.key}`), u.email, u.name, `{${u.roles.join(',')}}`, ids.admin,
    ]);
    await sql.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, u.email]);
    ids[u.key] = u.id;
  }
  for (const [key, area] of Object.entries(AREA_OF) as [keyof typeof AREA_OF, string][]) {
    await sql.query(`insert into public.area_members (id, area_id, user_id) select $1, a.id, $2 from public.areas a where a.slug = $3`, [
      stableId(`member:${key}`), ids[key], area,
    ]);
  }
}

/** `inventedWebItems: false` leaves out the invented web content (the official site's real one comes after:
 * seed-parts/web-real.ts) and `publicAttended: false` the public «lo atendido» of the invented cases; both default to
 * true. The citizen requests are always seeded. */
export async function seedWebContent(ctx: SeedCtx, opts: { inventedWebItems?: boolean; publicAttended?: boolean } = {}): Promise<void> {
  const munis = new Map((await ctx.sql.query<{ name: string; id: string }>(`select name, id from public.territories where kind = 'municipality'`)).map((m) => [m.name, m.id]));
  const muni = (name: string) => munis.get(name) ?? (() => { throw new Error(`demo web: municipio ${name}`); })();
  const projects = opts.inventedWebItems === false ? new Map<string, string>() : await seedItems(ctx, muni);
  await seedRequests(ctx, muni, projects, { attended: opts.publicAttended !== false });
}

// --- Content ---------------------------------------------------------------------------------------------------------
type Item = { id: string; kind: WebKind; slug: string; draft: Record<string, unknown>; go: 'publish' | 'schedule' | 'draft' | 'in_review'; at?: DateTime };

async function seedItems(ctx: SeedCtx, muni: (name: string) => string): Promise<Map<string, string>> {
  const { sql, ids, today } = ctx;
  const iso = (day: number) => today.plus({ days: day }).toISODate()!;
  const items: Item[] = [];
  const add = (kind: WebKind, slug: string, draft: Record<string, unknown>, go: Item['go'] = 'publish', at?: DateTime) => {
    const ok = parseSnapshot(kind, draft);
    if (!ok.ok) throw new Error(`demo web: ${kind}/${slug}: ${ok.error}`);
    const id = stableId(`item:${kind}:${slug}`);
    items.push({ id, kind, slug, draft, go, at });
    return id;
  };

  for (const n of DEMO_NEWS) {
    add('news', n.slug, {
      title: n.title, excerpt: n.excerpt, date: iso(n.day), category: n.category, author: 'Prensa (demo)', municipalityId: n.muni ? muni(n.muni) : null,
      body: n.body.map(p), sources: [{ label: 'Nota de prensa inventada para la demostración (demo)' }], topics: n.topics, coverId: null,
      seo: { description: n.excerpt },
    }, n.status === 'scheduled' ? 'schedule' : (n.status ?? 'publish'), n.status === 'scheduled' ? today.plus({ days: n.day }).set({ hour: 8 }) : undefined);
  }
  const projectIds = new Map<string, string>();
  for (const x of DEMO_PROJECTS) {
    projectIds.set(x.slug, add('project', x.slug, {
      title: x.title, excerpt: x.excerpt, date: iso(x.day), category: x.category, state: x.state, municipalityId: muni(x.muni), place: x.place,
      description: x.description.map(p), beneficiaries: x.beneficiaries, organization: 'Dirección de obras (demo)', coverId: null, evidenceIds: [],
      ...(x.investment ? { investment: { ...x.investment, source: DEMO_SOURCE } } : {}),
      ...(x.progress !== undefined ? { progress: { percent: x.progress, source: DEMO_SOURCE } } : {}),
      dates: {
        announced: iso(Math.min(x.day, x.started ?? x.day) - 10),
        ...(x.started !== undefined ? { started: iso(x.started) } : {}),
        ...(x.finished !== undefined ? { finished: iso(x.finished) } : {}),
        ...(x.expected !== undefined ? { expected: iso(x.expected) } : {}),
      },
      updatedOn: iso(Math.max(x.day, -3)),
      seo: { description: x.excerpt },
    }));
  }
  for (const e of DEMO_EPISODES) {
    add('episode', e.slug, { title: e.title, excerpt: e.excerpt, date: iso(e.day), youtubeId: null, topics: e.topics, minutes: e.minutes, links: [] });
  }
  // The documents' files: small PDFs made here, in the public library (as the editor uploaded them).
  const docFiles: { id: string; key: string; title: string; bytes: Uint8Array }[] = [];
  for (const d of DEMO_DOCUMENTS) {
    const key = `${stableId(`file:${d.slug}`)}.pdf`;
    const bytes = textPdf(d.pages.map((t, i) => ({ text: t, size: i === 0 ? 20 : 12, bold: i === 0, gap: i === 0 ? 0 : 12 })), {
      title: d.title, createdAt: new Date(Date.UTC(2026, 0, 1)),
    });
    const id = stableId(`media:${d.slug}`);
    docFiles.push({ id, key, title: d.title, bytes });
    add('document', d.slug, { title: d.title, excerpt: d.excerpt, date: iso(d.day), category: d.category, fileId: id, versionLabel: d.version, pages: d.pages.length > 2 ? d.pages.length : 1 });
  }
  for (const nt of DEMO_NOTICES) {
    add('notice', nt.slug, {
      title: nt.title, excerpt: nt.body.slice(0, 140), category: nt.category, body: nt.body, municipalityIds: nt.munis.map(muni),
      municipalityId: nt.munis.length === 1 ? muni(nt.munis[0]) : null, date: iso(nt.day), updatedAt: today.plus({ days: nt.day }).set({ hour: 9 }).toISO()!,
      expiresAt: nt.expires === null ? null : today.plus({ days: nt.expires }).set({ hour: 18 }).toISO()!,
    });
  }
  for (const f of DEMO_FAQS) add('faq', f.slug, { title: f.q, category: f.group, answer: f.a.map(p), order: f.order });
  const indicatorIds = DEMO_INDICATORS.map((i) =>
    add('indicator', i.slug, { title: i.title, value: i.value, unit: i.unit, source: DEMO_SOURCE, asOf: iso(-1), order: i.order, computedFrom: null }),
  );

  // The editor writes and sends to approval; the publisher publishes (or schedules).
  const storage = localBucket('web-public');
  await asPerson(sql, ids.webEditor, async () => {
    for (const f of docFiles) {
      await storage.put(f.key, f.bytes, 'application/pdf');
      await sql.query(`insert into public.web_media (id, storage_key, kind, mime, bytes, title) values ($1, $2, 'document', 'application/pdf', $3, $4)`, [
        f.id, f.key, f.bytes.length, f.title,
      ]);
    }
    for (const it of items) {
      await sql.query(`insert into public.web_items (id, kind, slug, status, draft) values ($1, $2, $3, $4, $5::text::jsonb)`, [
        it.id, it.kind, it.slug, it.go === 'in_review' ? 'in_review' : 'draft', JSON.stringify(it.draft),
      ]);
    }
    // The home's indicators and the governor's press kit point at the demo's.
    await sql.query(
      `update public.web_items set draft = jsonb_set(draft, '{blocks}', (select jsonb_agg(case when b ->> 'id' = 'indicadores' then jsonb_set(b, '{data,ids}', $2::text::jsonb) else b end order by n)
                                                                  from jsonb_array_elements(draft -> 'blocks') with ordinality t(b, n)))
        where kind = 'page' and slug = $1`,
      ['inicio', JSON.stringify(indicatorIds)],
    );
    await sql.query(
      `update public.web_items set draft = jsonb_set(draft, '{blocks}', (select jsonb_agg(case when b ->> 'id' = 'prensa' then jsonb_set(b, '{data,ids}', $2::text::jsonb) else b end order by n)
                                                                  from jsonb_array_elements(draft -> 'blocks') with ordinality t(b, n)))
        where kind = 'page' and slug = $1`,
      ['gobernador', JSON.stringify([stableId('item:document:kit-de-prensa-demo')])],
    );
  });
  await asPerson(sql, ids.webPublisher, async () => {
    for (const it of items) {
      if (it.go === 'publish') await sql.query(`select public.publish_web_item($1, null)`, [it.id]);
      if (it.go === 'schedule') await sql.query(`select public.publish_web_item($1, null, $2::timestamptz)`, [it.id, it.at!.toUTC().toISO()]);
    }
    // The skeleton pages of the client's seed (drafts until someone publishes them): published for the demo.
    for (const pg of await sql.query<{ id: string }>(`select id from public.web_items where kind = 'page' and published is null order by slug`)) {
      await sql.query(`select public.publish_web_item($1, null)`, [pg.id]);
    }
  });
  // A live project with a change waiting for approval: the public keeps seeing what was approved.
  await asPerson(sql, ids.webEditor, () =>
    sql.query(`update public.web_items set draft = jsonb_set(draft, '{excerpt}', to_jsonb($2::text)), status = 'in_review' where id = $1`, [
      projectIds.get('limpieza-canalizacion-quebradas-torbes-demo'),
      'Cauces limpios y muros nuevos antes de las lluvias: va por la mitad.',
    ]),
  );
  return projectIds;
}

// --- Citizen requests -------------------------------------------------------------------------------------------------
type Ev = { kind: string; from?: string | null; to?: string | null; detail?: Record<string, unknown>; reason?: string | null; actor: string | null; by: 'staff' | 'citizen' | 'system'; h: number };
type Msg = { kind: 'internal_note' | 'public_reply' | 'info_request' | 'citizen_message'; body: string; author: string | null; h: number };

const RESOLVED: Record<string, string> = {
  agua: 'Se reparó la tubería y el servicio volvió a la normalidad (demo).',
  'electricidad-alumbrado': 'Se cambiaron las luminarias y el transformador quedó revisado (demo).',
  vialidad: 'La cuadrilla reparó la vía (demo).',
  salud: 'El área de salud atendió lo que se pidió (demo).',
  educacion: 'La escuela recibió lo que hacía falta (demo).',
  transporte: 'Se ajustó la ruta con la línea de transporte (demo).',
  'ambiente-aseo': 'Se limpió el lugar y quedó en la ruta del aseo (demo).',
  'servicios-comunitarios': 'Se hizo el mantenimiento que hacía falta (demo).',
  seguridad: 'El caso se atendió con las instituciones que corresponden (demo).',
  otros: 'El equipo atendió la solicitud (demo).',
};

async function seedRequests(ctx: SeedCtx, muni: (name: string) => string, projects: Map<string, string>, opts: { attended: boolean }): Promise<void> {
  const { sql, ids, today } = ctx;
  const now = Date.now();
  const year = today.year;
  const cats = new Map(
    (await sql.query<{ slug: string; id: string; area_slug: string | null; area_id: string | null; area_name: string | null; days: number | null }>(
      `select c.slug, c.id, a.slug as area_slug, a.id as area_id, a.name as area_name, c.default_due_days as days
         from public.request_categories c left join public.areas a on a.id = c.default_area_id`,
    )).map((c) => [c.slug, c]),
  );
  const dueDays = (await sql.one<{ value: Record<string, number> }>(`select value from public.app_settings where key = 'participation.due_days_by_priority'`))?.value ?? {};
  // The showcase receipts first, so no other code can take theirs.
  const used = new Set<string>(DEMO_REQUESTS.flatMap((r) => (r.showcase ? [`AC-${year}-${r.showcase.suffix}`] : [])));
  const reference = (name: string) => {
    let ref = '';
    for (let k = 0; !ref || used.has(ref); k++) ref = newReference(year, bytesOf(`ref:${name}:${k}`));
    used.add(ref);
    return ref;
  };
  const secret = (r: DemoRequest | null, name: string) => r?.showcase?.secret ?? generateSecret(bytesOf(`secret:${name}`).subarray(0, 10));

  const rows: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const attachments: Record<string, unknown>[] = [];
  const supports: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];
  const attended: Record<string, unknown>[] = [];
  const files: { key: string; bytes: Uint8Array }[] = [];
  const reqIds = DEMO_REQUESTS.map((_, i) => stableId(`request:${i}`));
  const supportCount = DEMO_REQUESTS.map((r) => r.supports ?? 0);
  const at = (base: number, hours: number) => new Date(base + hours * 3_600_000).toISOString();

  DEMO_REQUESTS.forEach((r, i) => {
    const id = reqIds[i];
    const ref = r.showcase ? `AC-${year}-${r.showcase.suffix}` : reference(`request:${i}`);
    const cat = cats.get(r.cat) ?? (() => { throw new Error(`demo web: categoría ${r.cat}`); })();
    const denuncia = r.type === 'denuncia';
    const coordinator = ids.attention;
    const reviewer = denuncia ? ids.complaintsDesk : coordinator;
    const assignee = denuncia ? ids.complaintsDesk : cat.area_slug === AREA_OF.servicesLead ? ids.servicesLead : cat.area_slug === AREA_OF.roadsLead ? ids.roadsLead : coordinator;
    const areaId = denuncia ? null : cat.area_id;
    const areaName = denuncia ? '' : (cat.area_name ?? '').toLowerCase();
    const prio = r.prio ?? 'normal';
    const merged = r.mergeInto !== undefined;
    // When it arrived: that day at a working hour, never in the future.
    const created = Math.min(today.plus({ days: r.day }).set({ hour: 8 + (i % 9), minute: (i * 7) % 60 }).toMillis(), now - (90 - i) * 60_000);
    const ev: Ev[] = [{ kind: 'created', to: 'recibido', actor: null, by: 'citizen', h: 0 }];
    const msg: Msg[] = [];
    const reached = (s: string) => ['asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'resuelto', 'cerrado'].includes(s);
    let state = 'recibido';
    const go = (to: string, h: number, actor: string | null, reason: string | null = null) => {
      ev.push({ kind: 'state', from: state, to, reason, actor, by: actor ? 'staff' : 'citizen', h });
      state = to;
    };
    let resolution: string | null = null;
    if (r.state !== 'recibido') go('en_revision', 3, reviewer);
    if (r.state !== 'recibido' && prio !== 'normal') ev.push({ kind: 'priority', detail: { from: 'normal', to: prio }, actor: reviewer, by: 'staff', h: 3.2 });
    if (merged) {
      ev.push({ kind: 'merged', from: state, to: 'cerrado', detail: { into: reqIds[r.mergeInto!], intoReference: '' }, reason: 'Es el mismo problema en el mismo lugar (demo).', actor: coordinator, by: 'staff', h: 6 });
      state = 'cerrado';
    } else if (reached(r.state)) {
      ev.push({ kind: 'assigned', detail: { area: { from: areaId, to: areaId }, assignee: { from: null, to: assignee } }, actor: reviewer, by: 'staff', h: 20 });
      go('asignado', 20, reviewer);
      msg.push({ kind: 'public_reply', author: reviewer, h: 20.2, body: denuncia ? 'Recibimos tu denuncia. La revisa solo el equipo de denuncias (demo).' : `Recibimos tu solicitud y la pasamos al área de ${areaName} (demo).` });
      if (r.state !== 'asignado') {
        go('en_atencion', 44, assignee);
        msg.push({ kind: 'internal_note', author: assignee, h: 44.5, body: denuncia ? 'Se pidió información a la institución que corresponde (demo).' : 'Se programó la visita de la cuadrilla (demo).' });
      }
      if (r.state === 'requiere_informacion') {
        const ask = '¿Nos puedes dar una referencia del lugar o mandar una foto? (demo)';
        msg.push({ kind: 'info_request', author: assignee, h: 60, body: ask });
        go('requiere_informacion', 60, assignee, ask);
      }
      if (r.state === 'derivado') {
        go('derivado', 70, assignee, 'Le corresponde a otra institución (demo).');
        msg.push({ kind: 'public_reply', author: assignee, h: 70.2, body: 'Tu solicitud se pasó a la institución que la atiende. Te avisamos cuando respondan (demo).' });
      }
      if (r.state === 'resuelto' || r.state === 'cerrado') {
        resolution = r.attended && r.attended !== 'denuncia' ? r.attended : RESOLVED[r.cat];
        if (r.evidence) {
          const att = stableId(`evidence:${i}`);
          const key = `${stableId(`evidence-file:${i}`)}.jpg`;
          files.push({ key, bytes: demoThumbBytes(i % 2 ? 'frame-2.jpg' : 'cover.jpg') });
          attachments.push({ id: att, request_id: id, kind: 'evidence', storage_key: key, mime: 'image/jpeg', bytes: files[files.length - 1].bytes.length, shared: true, uploaded_by: assignee, created_at: at(created, 95) });
          ev.push({ kind: 'evidence', detail: { attachment: att, shared: true }, actor: assignee, by: 'staff', h: 95 });
        }
        go('resuelto', 96, assignee, resolution);
        msg.push({ kind: 'public_reply', author: assignee, h: 96.2, body: `${resolution} Si no se resolvió, dínoslo desde tu consulta.` });
      }
      if (r.state === 'cerrado') {
        if (r.confirmed) ev.push({ kind: 'citizen_confirmed', actor: null, by: 'citizen', h: 110 });
        go('cerrado', 130, coordinator, r.confirmed ? 'La persona confirmó que se resolvió (demo).' : 'Pasaron diez días sin respuesta de la persona (demo).');
      }
    } else if (r.state === 'no_procede') {
      if (r.spam) {
        ev.push({ kind: 'spam', from: state, to: 'no_procede', reason: 'Publicidad sin relación con la gestión (demo).', actor: reviewer, by: 'staff', h: 30 });
        state = 'no_procede';
      } else {
        go('no_procede', 30, reviewer, 'No corresponde a la gestión del estado (demo).');
        msg.push({ kind: 'public_reply', author: reviewer, h: 30.2, body: 'Esto no lo atiende la gestión del estado. Te explicamos a quién acudir en la respuesta (demo).' });
      }
    }
    if (state !== r.state) throw new Error(`demo web: la solicitud ${i} terminó en ${state}, no en ${r.state}`);

    // Supports of an open report, after it arrived.
    for (let k = 0; k < (r.supports ?? 0); k++) {
      const sid = stableId(`support:${i}:${k}`);
      supports.push({ id: sid, request_id: id, reference: reference(`support:${i}:${k}`), submission_key: stableId(`support-key:${i}:${k}`), secret_digest: secretDigest(secret(null, `support:${i}:${k}`)), note: 'A mí también me afecta (demo).', automatic: false, h: 10 + k * 12 });
      ev.push({ kind: 'support', detail: { support: sid, automatic: false }, actor: null, by: 'citizen', h: 10 + k * 12 });
    }
    if (r.photo) {
      const key = `${stableId(`photo-file:${i}`)}.jpg`;
      files.push({ key, bytes: demoThumbBytes(i % 2 ? 'frame-1.jpg' : 'storyboard.jpg') });
      attachments.push({ id: stableId(`photo:${i}`), request_id: id, kind: 'citizen', storage_key: key, mime: 'image/jpeg', bytes: files[files.length - 1].bytes.length, shared: false, uploaded_by: null, created_at: at(created, 0.01) });
    }

    // Fit the history between its arrival and now (a request of today cannot have a reply of tomorrow).
    const last = Math.max(...ev.map((e) => e.h), ...msg.map((m) => m.h), ...supports.filter((s) => s.request_id === id).map((s) => s.h as number));
    const scale = Math.min(1, (now - created - 60_000) / 3_600_000 / Math.max(last, 1));
    const when = (h: number) => at(created, h * scale);
    const stateAt = (to: string) => ev.find((e) => e.kind === 'state' && e.to === to);
    const resolvedEv = stateAt('resuelto');
    for (const s of supports) if (s.request_id === id) s.created_at = when(s.h as number);
    for (const a of attachments) if (a.request_id === id && a.kind === 'evidence') a.created_at = when(95);

    const priorityDays = prio === 'urgente' || prio === 'alta' ? dueDays[prio] : undefined;
    const days = Math.min(cat.days ?? 365, priorityDays ?? 365);
    const n = i + 1;
    const hasContact = !!r.contact && !r.anonymous;
    rows.push({
      id, reference: ref, type: r.type, category_id: cat.id, municipality_id: r.muni ? muni(r.muni) : null, sector: r.sector,
      location_reference: denuncia ? '' : (r.place ?? ''), title: r.title, description: r.text, lat: r.point?.[0] ?? null, lng: r.point?.[1] ?? null,
      location_consent: !!r.point, anonymous: !!r.anonymous, publish_name_consent: !!r.nameConsent && !r.anonymous,
      linked_item_id: r.linked ? (projects.get(r.linked) ?? null) : null, submission_key: stableId(`request-key:${i}`), secret_digest: secretDigest(secret(r, `request:${i}`)),
      state: r.state, priority: prio, area_id: areaId, assignee_id: reached(r.state) && !merged ? assignee : null,
      due_at: days <= 365 ? new Date(created + days * 86_400_000).toISOString() : null,
      first_response_at: r.state === 'recibido' ? null : when(3),
      resolved_at: resolvedEv ? when(resolvedEv.h) : null, resolution_note: resolution,
      duplicate_of: merged ? reqIds[r.mergeInto!] : null, support_count: supportCount[i], is_spam: !!r.spam,
      citizen_confirmation: r.confirmed ? 'resolved' : null, citizen_confirmed_at: r.confirmed ? when(110) : null,
      created_at: when(0), updated_at: when(last),
    });
    ev.forEach((e, k) =>
      events.push({ id: stableId(`event:${i}:${k}`), request_id: id, kind: e.kind, from_state: e.from ?? null, to_state: e.to ?? null, detail: e.detail ?? {}, reason: e.reason ?? null, actor_id: e.actor, actor_kind: e.by, created_at: when(e.h) }),
    );
    msg.forEach((m, k) => messages.push({ id: stableId(`message:${i}:${k}`), request_id: id, kind: m.kind, body: m.body, author_id: m.author, created_at: when(m.h) }));
    if (hasContact) {
      const c = sealContact({ name: `Vecina de prueba ${n} (demo)`, email: `vecina${n}@demo.test`, phone: r.contact === 'email' ? '' : `+58 000 000 ${String(n).padStart(4, '0')}`, channel: r.contact });
      contacts.push({ id: stableId(`contact:${i}`), request_id: id, name_enc: c.name, email_enc: c.email, phone_enc: c.phone, preferred_channel: c.channel, created_at: when(0) });
    }
    if (r.attended && resolvedEv && opts.attended) {
      const pub = stableId(`attended:${i}`);
      attended.push({
        id: pub, request_id: id, type: r.type, category_id: denuncia ? null : cat.id, municipality_id: r.muni ? muni(r.muni) : null,
        public_summary: denuncia ? `Denuncia atendida en el municipio ${r.muni}.` : r.attended,
        display_name: denuncia || r.anonymous ? null : r.nameConsent ? `Vecina de prueba ${n}` : 'V. P.',
        resolved_on: today.plus({ days: Math.floor((Date.parse(when(resolvedEv.h)) - today.toMillis()) / 86_400_000) }).toISODate(),
        published_at: when(last), published_by: ids.attention, created_at: when(last), updated_at: when(last),
      });
      events.push({ id: stableId(`event:${i}:attended`), request_id: id, kind: 'attended_published', from_state: null, to_state: null, detail: { publication: pub }, reason: null, actor_id: ids.attention, actor_kind: 'staff', created_at: when(last) });
    }
  });

  // Merges: the case that stays counts the duplicate (and its supports) and records it too; references go into the detail.
  DEMO_REQUESTS.forEach((r, i) => {
    if (r.mergeInto === undefined) return;
    const dup = rows[i];
    const main = rows[r.mergeInto];
    main.support_count = (main.support_count as number) + 1 + (dup.support_count as number);
    const mergedEv = events.find((e) => e.request_id === dup.id && e.kind === 'merged')!;
    (mergedEv.detail as Record<string, unknown>).intoReference = main.reference;
    events.push({ id: stableId(`event:${i}:merged-into`), request_id: main.id, kind: 'merged', from_state: null, to_state: null, detail: { from: dup.id, fromReference: dup.reference }, reason: mergedEv.reason, actor_id: mergedEv.actor_id, actor_kind: 'staff', created_at: mergedEv.created_at });
  });

  const storage = localBucket('participacion-privado');
  for (const f of files) await storage.put(f.key, f.bytes, 'image/jpeg');
  const insert = (table: string, cols: string, types: string, data: Record<string, unknown>[]) =>
    data.length
      ? sql.query(`insert into public.${table} (${cols}) select ${cols} from jsonb_to_recordset($1::text::jsonb) as x(${types})`, [JSON.stringify(data)])
      : Promise.resolve([]);
  await insert(
    'requests',
    'id, reference, type, category_id, municipality_id, sector, location_reference, title, description, lat, lng, location_consent, anonymous, publish_name_consent, linked_item_id, submission_key, secret_digest, state, priority, area_id, assignee_id, due_at, first_response_at, resolved_at, resolution_note, duplicate_of, support_count, is_spam, citizen_confirmation, citizen_confirmed_at, created_at, updated_at',
    'id uuid, reference text, type text, category_id uuid, municipality_id uuid, sector text, location_reference text, title text, description text, lat numeric, lng numeric, location_consent boolean, anonymous boolean, publish_name_consent boolean, linked_item_id uuid, submission_key uuid, secret_digest text, state text, priority text, area_id uuid, assignee_id uuid, due_at timestamptz, first_response_at timestamptz, resolved_at timestamptz, resolution_note text, duplicate_of uuid, support_count int, is_spam boolean, citizen_confirmation text, citizen_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz',
    rows,
  );
  await insert('request_supports', 'id, request_id, reference, submission_key, secret_digest, note, automatic, created_at',
    'id uuid, request_id uuid, reference text, submission_key uuid, secret_digest text, note text, automatic boolean, created_at timestamptz', supports);
  await insert('request_contacts', 'id, request_id, name_enc, email_enc, phone_enc, preferred_channel, created_at',
    'id uuid, request_id uuid, name_enc text, email_enc text, phone_enc text, preferred_channel text, created_at timestamptz', contacts);
  await insert('request_events', 'id, request_id, kind, from_state, to_state, detail, reason, actor_id, actor_kind, created_at',
    'id uuid, request_id uuid, kind text, from_state text, to_state text, detail jsonb, reason text, actor_id uuid, actor_kind text, created_at timestamptz', events);
  await insert('request_messages', 'id, request_id, kind, body, author_id, created_at', 'id uuid, request_id uuid, kind text, body text, author_id uuid, created_at timestamptz', messages);
  await insert('request_attachments', 'id, request_id, kind, storage_key, mime, bytes, scan_status, shared, uploaded_by, created_at',
    "id uuid, request_id uuid, kind text, storage_key text, mime text, bytes bigint, scan_status text, shared boolean, uploaded_by uuid, created_at timestamptz",
    attachments.map((a) => ({ ...a, scan_status: 'sin_analizar' })));
  await insert('attended_publications', 'id, request_id, type, category_id, municipality_id, public_summary, display_name, resolved_on, status, published_at, published_by, created_at, updated_at',
    'id uuid, request_id uuid, type text, category_id uuid, municipality_id uuid, public_summary text, display_name text, resolved_on date, status text, published_at timestamptz, published_by uuid, created_at timestamptz, updated_at timestamptz',
    attended.map((a) => ({ ...a, status: 'published' })));
}
