// The public website and the attention desk on top of the RLS test database (tests/rls/setup.ts): one person per new
// role (D-93), two responsibles in two different areas, the role anon, and receipts made the way the app makes them
// (HMAC of the secret; the contact encrypted). Invented people only, on the reserved .test domain.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { asAnon, asUser, type Sql } from '@/lib/db/core';
import type { DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from './setup';

export const WEB_USERS = {
  writer: { id: '00000000-0000-4000-8000-0000000000b1', email: 'editora.web@demo.test', name: 'Editora web (prueba)', roles: ['writer'] },
  publisher: { id: '00000000-0000-4000-8000-0000000000b2', email: 'aprobador.web@demo.test', name: 'Aprobador web (prueba)', roles: ['web_publisher'] },
  coordinator: { id: '00000000-0000-4000-8000-0000000000b3', email: 'coordinacion@demo.test', name: 'Coordinación (prueba)', roles: ['attention_coordinator'] },
  areaA: { id: '00000000-0000-4000-8000-0000000000b4', email: 'servicios@demo.test', name: 'Responsable de servicios (prueba)', roles: ['reports_operator'] },
  areaB: { id: '00000000-0000-4000-8000-0000000000b5', email: 'vialidad@demo.test', name: 'Responsable de vialidad (prueba)', roles: ['reports_operator'] },
  complaints: { id: '00000000-0000-4000-8000-0000000000b6', email: 'denuncias@demo.test', name: 'Denuncias (prueba)', roles: ['complaints_operator'] },
  auditor: { id: '00000000-0000-4000-8000-0000000000b7', email: 'auditoria@demo.test', name: 'Auditoría (prueba)', roles: ['auditor'] },
} as const;
export type WebUserKey = keyof typeof WEB_USERS;
export type Who = WebUserKey | DemoUserKey;

// D-96: everything anon may read in public, column by column (each table behind a policy for what is published).
// No table-wide privilege, no write, no function of public. A new column for anon is granted on purpose and listed here.
export const ANON_COLUMNS: Record<string, string[]> = {
  attended_publications: ['category_id', 'display_name', 'id', 'municipality_id', 'public_summary', 'published_at', 'resolved_on', 'type'],
  request_categories: ['description', 'id', 'name', 'slug', 'sort'],
  territories: ['id', 'kind', 'name', 'parent_id', 'slug', 'sort'],
  web_items: ['category', 'display_date', 'id', 'kind', 'municipality_id', 'publish_at', 'published', 'published_at', 'published_media',
    'published_version', 'search', 'slug', 'state'],
  web_redirects: ['from_path', 'status_code', 'to_path'],
  web_settings: ['key', 'updated_at', 'value'],
};
// And the functions anon executes: only these, all in the schema citizen (not exposed by the Data API).
export const CITIZEN_FUNCTIONS = ['add_citizen_message', 'add_request_attachment', 'confirm_request', 'lookup_request', 'request_attachment',
  'request_stats', 'similar_requests', 'submit_request', 'support_request'];

// The six team roles and Administración as they are seeded: none of them reads a request or a draft (except
// Administración, which reads drafts).
export const TEAM: DemoUserKey[] = ['boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'];

export type WebTestDb = TestDb & {
  /** As any person (team or web), with 2FA unless told. */
  asWho: <T>(who: Who, fn: (sql: Sql) => Promise<T>, aal?: 'aal1' | 'aal2') => Promise<T>;
  anon: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;
  idOf: (who: Who) => string;
  area: { a: string; b: string };
  category: (slug: string) => string;
  municipality: (name: string) => string;
};

export async function makeWebTestDb(): Promise<WebTestDb> {
  const t = await makeTestDb();
  const cats = new Map<string, string>();
  const munis = new Map<string, string>();
  const area = await t.system(async (sql) => {
    for (const u of Object.values(WEB_USERS)) {
      await sql.query(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [u.email, u.name, `{${u.roles.join(',')}}`]);
      await sql.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, u.email]);
    }
    const a = (await sql.one<{ id: string }>(`select id from public.areas where slug = 'servicios-publicos'`))!.id;
    const b = (await sql.one<{ id: string }>(`select id from public.areas where slug = 'vialidad-transporte'`))!.id;
    await sql.query(`insert into public.area_members (area_id, user_id) values ($1, $2), ($3, $4)`, [a, WEB_USERS.areaA.id, b, WEB_USERS.areaB.id]);
    for (const c of await sql.query<{ slug: string; id: string }>(`select slug, id from public.request_categories`)) cats.set(c.slug, c.id);
    for (const m of await sql.query<{ name: string; id: string }>(`select name, id from public.territories where kind = 'municipality'`)) munis.set(m.name, m.id);
    return { a, b };
  });
  const idOf = (who: Who) => (who in WEB_USERS ? WEB_USERS[who as WebUserKey].id : t.ids[who as DemoUserKey]);
  return {
    ...t,
    asWho: (who, fn, aal = 'aal2') => asUser(t.backend, { sub: idOf(who), aal }, fn),
    anon: (fn) => asAnon(t.backend, fn),
    idOf,
    area,
    category: (slug) => cats.get(slug) ?? (() => { throw new Error(`categoría ${slug}`); })(),
    municipality: (name) => munis.get(name) ?? (() => { throw new Error(`municipio ${name}`); })(),
  };
}

// --- What the app does before calling the citizen functions ---------------------------------------------------------
const PEPPER = 'pimienta-de-prueba';
/** A new receipt: the browser's form key, the secret (80 bits, Crockford groups like the app's) and its HMAC. */
export function receipt() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const secret = [...randomBytes(16)].map((x) => alphabet[x % 32]).join('').match(/.{4}/g)!.slice(0, 4).join('-');
  return { submissionKey: randomUUID(), secret, digest: digestOf(secret) };
}
export const digestOf = (secret: string) => createHmac('sha256', PEPPER).update(secret).digest('hex');
/** A device or network key: the app's HMAC of the cookie or the IP (here, of any text). */
export const rateKey = (s: string = randomUUID()) => createHash('sha256').update(`llave:${s}`).digest('hex');
/** A contact field as the app stores it: «<key id>:<iv>:<ciphertext+tag>», base64url (here random bytes, never a real one). */
export const sealed = () => `demo:${randomBytes(12).toString('base64url')}:${randomBytes(40).toString('base64url')}`;

export type Submit = {
  type?: string;
  category?: string;
  title?: string;
  description?: string;
  municipality?: string | null;
  sector?: string;
  place?: string;
  lat?: number | null;
  lng?: number | null;
  consent?: boolean;
  anonymous?: boolean;
  nameConsent?: boolean;
  contact?: boolean;
  device?: string;
  ip?: string;
  linkedItem?: string | null;
  r?: ReturnType<typeof receipt>;
};

/** citizen.submit_request as the app calls it (named arguments), as anon. */
export async function submit(t: WebTestDb, o: Submit = {}) {
  const r = o.r ?? receipt();
  const out = await t.anon((sql) =>
    sql.one<{ v: { status: string; id: string; reference: string; kind: string } }>(
      `select citizen.submit_request(
         p_submission_key => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_type => $5,
         p_category_id => $6, p_title => $7, p_description => $8, p_municipality_id => $9, p_sector => $10,
         p_location_reference => $11, p_lat => $12, p_lng => $13, p_location_consent => $14, p_anonymous => $15,
         p_publish_name_consent => $16, p_linked_item_id => $17, p_contact_name => $18, p_contact_email => $19,
         p_contact_channel => $20) as v`,
      [
        r.submissionKey, r.digest, o.device ?? rateKey(), o.ip ?? rateKey(), o.type ?? 'reporte', t.category(o.category ?? 'agua'),
        o.title ?? 'Bote de agua en la esquina (prueba)', o.description ?? 'Hace tres días sale agua de la tubería y se pierde (prueba).',
        o.municipality === null ? null : t.municipality(o.municipality ?? 'San Cristóbal'), o.sector ?? 'Sector de prueba',
        o.place ?? '', o.lat ?? null, o.lng ?? null, o.consent ?? (o.lat != null), o.anonymous ?? false, o.nameConsent ?? false,
        o.linkedItem ?? null, o.contact ? sealed() : null, o.contact ? sealed() : null, o.contact ? 'email' : 'none',
      ],
    ),
  );
  return { ...out!.v, receipt: r };
}

/** citizen.lookup_request as anon. */
export const lookup = (t: WebTestDb, reference: string, digest: string, device = rateKey(), ip = rateKey()) =>
  t.anon(async (sql) => (await sql.one<{ v: Record<string, unknown> }>(`select citizen.lookup_request($1, $2, $3, $4) as v`, [reference, digest, device, ip]))!.v);
