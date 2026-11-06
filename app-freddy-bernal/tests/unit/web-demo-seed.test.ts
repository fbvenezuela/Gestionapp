// The website's demo (design §8, D-95; seed-parts/web.ts): INVENTED and marked, coherent with the database's own rules.
// Every title says «(demo)»; every draft fits its schema; no link, phone or address of anyone; episodes without a real
// video; one notice expired; indicators with their (invented) source; 60 requests of the six kinds whose history follows
// the state machine, in time order, never in the future; denuncias without a point; contacts only encrypted with the
// demo key; the files behind documents and attachments exist; the people of the new roles in their areas.
import { describe, expect, it, beforeAll } from 'vitest';
import { asSystem } from '@/lib/db/core';
import { makeTestDb, type TestDb } from '../rls/setup';
import { contactKeyring, openContact } from '@/lib/participation/contact-crypto';
import { localBucket } from '@/lib/storage/buckets';
import { parseSnapshot, type WebKind } from '@/lib/web/schema';
import { WEB_DEMO_USERS, AREA_OF } from '@/lib/db/seed-parts/web-people';
import { DEMO_REQUESTS } from '@/lib/db/seed-parts/web-requests';
import { REQUEST_TYPES } from '@/lib/participation/input';

let t: TestDb;
const sys = <T>(q: string, p: unknown[] = []) => asSystem(t.backend, (sql) => sql.query<T>(q, p));

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
}, 120_000);

describe('el contenido de la web de prueba', () => {
  it('cada título termina en «(demo)» (salvo las páginas base del cliente) y cada borrador cabe en su esquema', async () => {
    const items = await sys<{ kind: WebKind; slug: string; draft: Record<string, unknown>; status: string }>(`select kind, slug, draft, status from public.web_items order by kind, slug`);
    expect(items.length).toBe(67);
    for (const it of items) {
      if (it.kind !== 'page') expect(String(it.draft.title), it.slug).toMatch(/\(demo\)$/);
      const r = parseSnapshot(it.kind, it.draft);
      expect(r.ok ? 'ok' : r.error, `${it.kind}/${it.slug}`).toBe('ok');
    }
    const by = (status: string) => items.filter((i) => i.status === status).map((i) => i.slug);
    expect(by('scheduled')).toEqual(['proxima-jornada-de-vacunacion-libertador-demo']);
    expect(by('draft')).toEqual(['balance-del-mes-demo']);
    expect(by('in_review').sort()).toEqual(['ferias-de-alimentos-fin-de-semana-demo', 'limpieza-canalizacion-quebradas-torbes-demo']);
    const counts = Object.fromEntries((await sys<{ kind: string; n: number }>(`select kind, count(*)::int as n from public.web_items where published is not null group by kind`)).map((r) => [r.kind, r.n]));
    expect(counts).toEqual({ page: 6, news: 13, project: 14, episode: 6, document: 8, notice: 4, faq: 10, indicator: 4 });
  });

  it('sin enlaces, correos ni teléfonos en lo publicado; episodios sin video real; un aviso vencido; indicadores con su fuente', async () => {
    const texts = await sys<{ kind: string; t: string }>(`select kind, published::text as t from public.web_items where published is not null and kind <> 'page'`);
    for (const x of texts) {
      expect(x.t, x.kind).not.toMatch(/https?:\/\//);
      expect(x.t, x.kind).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    }
    // Every text a person reads (not the ids and dates the snapshot also carries).
    const phones = await sys<{ s: string }>(
      `select x #>> '{}' as s from public.web_items i, jsonb_path_query(i.published, 'strict $.** ? (@.type() == "string")') x
        where i.published is not null and (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-' and (x #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          and public.text_has_phone(x #>> '{}')`,
    );
    expect(phones).toEqual([]);
    expect(await sys(`select slug from public.web_items where kind = 'episode' and published ->> 'youtubeId' is not null`)).toEqual([]);
    const notices = await sys<{ slug: string; expired: boolean }>(`select slug, (published ->> 'expiresAt')::timestamptz < now() as expired from public.web_items where kind = 'notice' order by slug`);
    expect(notices.filter((n) => n.expired).map((n) => n.slug)).toEqual(['interrupcion-electrica-por-trabajos-demo']);
    expect(await sys(`select slug from public.web_items where kind = 'indicator' and published -> 'source' ->> 'label' not like '%(demo)'`)).toEqual([]);
  });

  it('los documentos tienen su PDF en la biblioteca pública, congelado al publicar', async () => {
    const docs = await sys<{ slug: string; key: string; title: string }>(
      `select i.slug, m.storage_key as key, m.title from public.web_items i join public.web_media m on m.id = (i.published ->> 'fileId')::uuid where i.kind = 'document'`,
    );
    expect(docs).toHaveLength(8);
    const store = localBucket('web-public');
    for (const d of docs) {
      const bytes = await store.read(d.key);
      expect(bytes, d.slug).not.toBeNull();
      expect(Buffer.from(bytes!.subarray(0, 8)).toString('latin1'), d.slug).toBe('%PDF-1.4');
      const text = Buffer.from(bytes!).toString('latin1');
      expect(text, d.slug).toContain('/Title (');
      expect(text.endsWith('%%EOF\n'), d.slug).toBe(true);
    }
  });
});

describe('las solicitudes de prueba', () => {
  it('60, de los seis tipos, en todos los estados, con su historia y títulos marcados', async () => {
    const rows = await sys<{ type: string; state: string; title: string }>(`select type, state, title from public.requests`);
    expect(rows).toHaveLength(60);
    expect(rows.length).toBe(DEMO_REQUESTS.length);
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(REQUEST_TYPES));
    expect(new Set(rows.map((r) => r.state)).size).toBe(9);
    for (const r of rows) expect(r.title, r.title).toMatch(/\(demo\)$/);
  });

  it('la historia sigue la máquina de estados, en orden, nunca en el futuro ni antes de que llegara', async () => {
    const reqs = await sys<{ id: string; state: string; created_at: Date; duplicate_of: string | null; is_spam: boolean }>(`select id, state, created_at, duplicate_of, is_spam from public.requests`);
    const events = await sys<{ request_id: string; kind: string; from_state: string | null; to_state: string | null; created_at: Date; ok: boolean | null }>(
      `select request_id, kind, from_state, to_state, created_at, case when kind = 'state' then public.request_transition_ok(from_state, to_state) end as ok
         from public.request_events order by created_at, id`,
    );
    const now = Date.now();
    for (const r of reqs) {
      const mine = events.filter((e) => e.request_id === r.id);
      expect(mine[0]?.kind, r.id).toBe('created');
      let state = 'recibido';
      for (const e of mine) {
        expect(+e.created_at, r.id).toBeGreaterThanOrEqual(+r.created_at);
        expect(+e.created_at, r.id).toBeLessThanOrEqual(now);
        if (e.kind === 'state') {
          expect(e.ok, `${r.id} ${e.from_state}→${e.to_state}`).toBe(true);
          expect(e.from_state).toBe(state);
          state = e.to_state!;
        }
        if ((e.kind === 'merged' && e.to_state) || e.kind === 'spam') state = e.to_state!;
      }
      expect(state, r.id).toBe(r.state);
    }
    // Some open ones are past their due date (the alerts of the attention desk have something to show).
    const overdue = await sys<{ n: number }>(`select count(*)::int as n from public.requests where due_at < now() and state not in ('resuelto', 'cerrado', 'no_procede')`);
    expect(overdue[0].n).toBeGreaterThan(0);
  });

  it('las denuncias sin punto ni referencia y sin área; nada público con datos; el contacto solo cifrado (clave de la demo)', async () => {
    expect(await sys(`select id from public.requests where type = 'denuncia' and (lat is not null or location_reference <> '' or area_id is not null)`)).toEqual([]);
    const plain = await sys<{ n: number }>(
      `select count(*)::int as n from (select title || ' ' || description as t from public.requests union all select body from public.request_messages
                                        union all select public_summary || ' ' || coalesce(display_name, '') from public.attended_publications) x
        where public.text_has_phone(t) or t ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}'`,
    );
    expect(plain[0].n).toBe(0);
    const contacts = await sys<{ name_enc: string; email_enc: string; phone_enc: string | null; preferred_channel: string }>(`select * from public.request_contacts`);
    expect(contacts.length).toBeGreaterThan(20);
    const ring = contactKeyring({ mode: 'demo', key: '', previous: '' });
    for (const c of contacts) {
      expect(c.name_enc.startsWith('demo:')).toBe(true);
      const o = openContact(c, ring);
      expect(o.name).toMatch(/^Vecina de prueba \d+ \(demo\)$/);
      expect(o.email).toMatch(/@demo\.test$/);
      if (o.phone) expect(o.phone).toMatch(/^\+58 000 000 \d{4}$/);
    }
    // Lo atendido: only resolved cases; a denuncia with the fixed sentence, no name, no category.
    const att = await sys<{ state: string; type: string; display_name: string | null; category_id: string | null; public_summary: string }>(
      `select r.state, a.type, a.display_name, a.category_id, a.public_summary from public.attended_publications a join public.requests r on r.id = a.request_id`,
    );
    expect(att.every((a) => a.state === 'resuelto' || a.state === 'cerrado')).toBe(true);
    for (const a of att.filter((x) => x.type === 'denuncia')) expect(a).toMatchObject({ display_name: null, category_id: null, public_summary: expect.stringMatching(/^Denuncia atendida en el municipio /) });
  });

  it('los archivos de las solicitudes existen en el balde privado y quedan «sin analizar»', async () => {
    const files = await sys<{ storage_key: string; scan_status: string; kind: string }>(`select storage_key, scan_status, kind from public.request_attachments`);
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(new Set(files.map((f) => f.kind))).toEqual(new Set(['citizen', 'evidence']));
    const store = localBucket('participacion-privado');
    for (const f of files) {
      expect(f.scan_status).toBe('sin_analizar');
      expect(await store.exists(f.storage_key), f.storage_key).toBe(true);
    }
  });
});

describe('la gente de los roles nuevos', () => {
  it('una persona por rol, con su rol; los dos responsables en su área; también en las bases de las pruebas', async () => {
    for (const u of WEB_DEMO_USERS) {
      const roles = await sys<{ role: string }>(`select role::text from public.user_roles where user_id = $1`, [u.id]);
      expect(roles.map((r) => r.role), u.key).toEqual([...u.roles]);
      expect(t.ids[u.key]).toBe(u.id);
    }
    const members = await sys<{ email: string; slug: string }>(`select p.email, a.slug from public.area_members m join public.profiles p on p.id = m.user_id join public.areas a on a.id = m.area_id order by a.slug`);
    expect(members).toEqual([
      { email: 'atencion.servicios@demo.test', slug: AREA_OF.servicesLead },
      { email: 'atencion.vialidad@demo.test', slug: AREA_OF.roadsLead },
    ]);
    const plain = await makeTestDb();
    const n = await plain.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.user_roles where role in ('writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor')`));
    expect(n!.n).toBe(7);
    expect(await plain.system((sql) => sql.query(`select id from public.requests`))).toEqual([]);
  }, 120_000);
});
