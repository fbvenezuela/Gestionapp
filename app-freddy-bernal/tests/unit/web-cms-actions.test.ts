// The website administrator's server actions (src/lib/actions/web.ts, web-site.ts) and its upload route, against a real
// in-memory database with the same migrations and the demo's web content. The session is mocked (each test is someone
// of the demo: the editor, the publisher, Administración, the boss or Redes) and so are the notices and Next's cache, to
// see what they get. What is checked: the editor writes and sends but never publishes (the database refuses it, in
// words); the publisher publishes exactly the reviewed draft and the public pages are refreshed; scheduling, returning,
// archiving, restoring a version, a new address with its 301; the site's settings and redirects for who keeps the site;
// the library's words and the upload's checks (alternative text, file type, who may). All data is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { asAnon } from '@/lib/db/core';
import { makeTestDb, type TestDb } from '../rls/setup';
import { pngOf } from './fixtures/web-png';

const h = vi.hoisted(() => ({
  session: null as unknown,
  tags: [] as string[],
  paths: [] as string[],
  notices: [] as { userIds: string[]; kind: string; link?: string; title: string }[],
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn((p: string) => h.paths.push(p)),
  revalidateTag: vi.fn((t: string) => h.tags.push(t)),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session), getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/notify', () => ({
  notify: vi.fn(async (n: { userIds: string[]; kind: string; link?: string; title: string }) => {
    h.notices.push(n);
  }),
  usersWithRole: vi.fn(async (role: string) => DEMO_USERS.filter((u) => (u.roles as readonly string[]).includes(role)).map((u) => u.id)),
}));

let t: TestDb;
let web: typeof import('@/lib/actions/web');
let site: typeof import('@/lib/actions/web-site');
let upload: typeof import('@/app/(panel)/admin/web/biblioteca/subir/route');

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  web = await import('@/lib/actions/web');
  site = await import('@/lib/actions/web-site');
  upload = await import('@/app/(panel)/admin/web/biblioteca/subir/route');
}, 180_000);

beforeEach(() => {
  h.tags.length = 0;
  h.paths.length = 0;
  h.notices.length = 0;
});

function as(key: DemoUserKey, aal: 'aal1' | 'aal2' = 'aal2') {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: true, mfaOk: aal === 'aal2',
    claims: { sub: t.ids[key], aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

type Row = { id: string; kind: string; slug: string; status: string; rev: number; draft: Record<string, unknown>; draft_version: number; published: Record<string, unknown> | null; published_version: number | null; publish_at: Date | null; archived_at: Date | null; review_note: string | null };
const item = async (id: string) => (await t.system((sql) => sql.one<Row>(`select * from public.web_items where id = $1`, [id])))!;
const bySlug = async (kind: string, slug: string) => (await t.system((sql) => sql.one<Row>(`select * from public.web_items where kind = $1 and slug = $2`, [kind, slug])))!;
const anonSees = async (id: string) => (await asAnon(t.backend, (sql) => sql.query(`select id from public.web_items where id = $1`, [id]))).length === 1;
const ok = <T>(r: { ok: boolean; data?: T; error?: string }) => {
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  return r.data as T;
};

async function newNews(title = 'Cancha nueva en el barrio de prueba (demo)') {
  as('webEditor');
  const { id } = ok(await web.createWebItem({ kind: 'news', title }));
  return id;
}

describe('crear y guardar (el editor)', () => {
  it('«Nuevo» crea un borrador con su dirección libre, sacada del título', async () => {
    const a = await newNews('Plaza renovada en el centro (demo)');
    const b = await newNews('Plaza renovada en el centro (demo)');
    expect((await item(a)).slug).toBe('plaza-renovada-en-el-centro-demo');
    expect((await item(b)).slug).toBe('plaza-renovada-en-el-centro-demo-2');
    expect((await item(a)).status).toBe('draft');
    expect(await anonSees(a)).toBe(false);
    as('webEditor');
    expect(await web.createWebItem({ kind: 'page', title: 'Otra página' })).toMatchObject({ ok: false });
    as('admin');
    expect(await web.createWebItem({ kind: 'news', title: 'De administración (demo)' })).toEqual({ ok: false, error: expect.stringMatching(/^Escriben la web el editor/) });
  });

  it('«Guardar borrador» deja una versión con su nota; a medias también; con la versión vieja, no', async () => {
    const id = await newNews();
    const it = await item(id);
    const draft = { ...it.draft, excerpt: 'Un resumen (demo).', body: [{ type: 'paragraph', runs: [{ text: 'Texto ' }, { text: 'fuerte', bold: true }] }] };
    const saved = ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft, note: 'Primer texto' }));
    expect(saved.draftVersion).toBe(2);
    expect(saved.problems).toEqual([]);
    const v = await t.system((sql) => sql.one<{ note: string }>(`select note from public.web_versions where item_id = $1 and version_no = 2`, [id]));
    expect(v?.note).toBe('Primer texto');
    // Half done: saved anyway, with what is missing.
    const half = ok(await web.saveWebDraft({ id, rev: saved.rev, slug: it.slug, draft: { ...draft, title: '' } }));
    expect(half.problems[0]).toMatch(/^Título: Falta el título/);
    // Somebody saved meanwhile: refused, nothing lost.
    expect(await web.saveWebDraft({ id, rev: saved.rev, slug: it.slug, draft })).toEqual({ ok: false, error: expect.stringMatching(/^Alguien guardó cambios/) });
    expect(h.tags).toEqual([]);
  });

  it('la dirección: única por tipo y en minúsculas; la de una página no se cambia', async () => {
    const id = await newNews('Una nota con dirección (demo)');
    const it = await item(id);
    expect(await web.saveWebDraft({ id, rev: it.rev, slug: 'arranco-rehabilitacion-avenida-principal-demo', draft: it.draft })).toEqual({
      ok: false, error: 'Ya hay otro contenido con esa dirección: cambia alguna palabra.',
    });
    expect(await web.saveWebDraft({ id, rev: it.rev, slug: 'Con Mayúsculas', draft: it.draft })).toMatchObject({ ok: false });
    const home = await bySlug('page', 'inicio');
    as('webPublisher');
    expect(await web.saveWebDraft({ id: home.id, rev: home.rev, slug: 'portada', draft: home.draft })).toEqual({ ok: false, error: 'La dirección de una página de la web no se cambia.' });
  });
});

describe('enviar, publicar, devolver (el flujo de aprobación)', () => {
  it('no se envía a medias; entero sí, y quien aprueba recibe el aviso', async () => {
    as('webEditor');
    const { id } = ok(await web.createWebItem({ kind: 'indicator', title: 'Puentes reparados (demo)' }));
    expect(await web.submitWebItem({ id })).toEqual({ ok: false, error: expect.stringMatching(/^Antes de enviarlo falta esto: Fuente: Un indicador sale en la web solo con su fuente/) });
    const it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, value: 12, source: { label: 'Informe de obras (demo)' } } }));
    ok(await web.submitWebItem({ id }));
    expect((await item(id)).status).toBe('in_review');
    expect(h.notices).toEqual([expect.objectContaining({ kind: 'web_review', userIds: [t.ids.webPublisher], link: `/admin/web/revisar/${id}` })]);
    // Back to work before the publisher looks.
    ok(await web.withdrawWebItem({ id }));
    expect((await item(id)).status).toBe('draft');
  });

  it('el editor no publica: la base lo rechaza con sus palabras y la web no se refresca', async () => {
    const id = await newNews();
    const it = await item(id);
    expect(await web.publishWebItem({ id, rev: it.rev })).toEqual({ ok: false, error: 'Publica quien aprueba la web o el jefe, con doble factor.' });
    expect(await web.archiveWebItem({ id })).toEqual({ ok: false, error: 'Archiva quien aprueba la web o el jefe, con doble factor.' });
    expect(await web.returnWebItem({ id, note: 'Esto no' })).toMatchObject({ ok: false });
    expect(await anonSees(id)).toBe(false);
    expect(h.tags).toEqual([]);
    // Without the second factor, not even the publisher: the database does not even show it the draft.
    as('webPublisher', 'aal1');
    expect(await web.publishWebItem({ id, rev: it.rev })).toEqual({ ok: false, error: 'No encontramos ese contenido.' });
    expect(await anonSees(id)).toBe(false);
  });

  it('quien aprueba publica exactamente lo revisado: la web lo ve, se refrescan sus páginas y le llega el aviso a quien lo envió', async () => {
    const id = await newNews('Inauguran biblioteca municipal (demo)');
    let it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, body: [{ type: 'paragraph', text: 'Abrió sus puertas (demo).' }] } }));
    ok(await web.submitWebItem({ id }));
    it = await item(id);
    as('webPublisher');
    // A stale review: refused.
    expect(await web.publishWebItem({ id, rev: it.rev - 1 })).toEqual({ ok: false, error: 'El contenido cambió mientras lo revisabas. Ábrelo de nuevo para ver lo último.' });
    h.notices.length = 0;
    const r = ok(await web.publishWebItem({ id, rev: it.rev }));
    expect(r).toMatchObject({ scheduled: false, path: `/actualidad/${it.slug}` });
    expect(await anonSees(id)).toBe(true);
    expect((await item(id)).status).toBe('published');
    expect(h.tags).toContain('web:news');
    expect(h.paths).toEqual(expect.arrayContaining(['/', '/actualidad', `/actualidad/${it.slug}`, '/sitemap.xml']));
    expect(h.notices).toEqual([expect.objectContaining({ kind: 'web_published', userIds: [t.ids.webEditor] })]);
  });

  it('programar: no se ve antes de su hora; una hora pasada no; quitar la programación lo deja en borrador', async () => {
    as('webEditor');
    const { id } = ok(await web.createWebItem({ kind: 'notice', title: 'Corte de luz programado (demo)' }));
    let it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, body: 'Sin luz de 8 a 12 en el sector de prueba (demo).' } }));
    ok(await web.submitWebItem({ id }));
    it = await item(id);
    as('webPublisher');
    expect(await web.publishWebItem({ id, rev: it.rev, at: { date: '2020-01-01', time: '08:00' } })).toEqual({ ok: false, error: 'Elige una hora que todavía no haya pasado, o publica ahora.' });
    expect(await web.publishWebItem({ id, rev: it.rev, at: { date: '2026-02-30', time: '08:00' } })).toEqual({ ok: false, error: 'Esa fecha u hora no existe: revísala.' });
    const tomorrow = new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 10);
    const r = ok(await web.publishWebItem({ id, rev: it.rev, at: { date: tomorrow, time: '08:00' } }));
    expect(r.scheduled).toBe(true);
    expect(r.at).toBe(new Date(`${tomorrow}T12:00:00.000Z`).toISOString());
    expect((await item(id)).status).toBe('scheduled');
    expect(await anonSees(id)).toBe(false);
    // Its time comes: the public sees it by publish_at, and the cron marks it published.
    await t.system(async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      await sql.query(`update public.web_items set publish_at = now() - interval '1 minute' where id = $1`, [id]);
    });
    expect(await anonSees(id)).toBe(true);
    expect(await t.system((sql) => sql.one<{ n: number }>(`select public.web_items_flip_scheduled() as n`))).toEqual({ n: expect.any(Number) });
    expect((await item(id)).status).toBe('published');
    // Another one, taken back before its time.
    as('webEditor');
    const second = ok(await web.createWebItem({ kind: 'notice', title: 'Desvío por obras (demo)' })).id;
    let s2 = await item(second);
    ok(await web.saveWebDraft({ id: second, rev: s2.rev, slug: s2.slug, draft: { ...s2.draft, body: 'Desvío por la calle de prueba (demo).' } }));
    s2 = await item(second);
    as('webPublisher');
    ok(await web.publishWebItem({ id: second, rev: s2.rev, at: { date: tomorrow, time: '09:30' } }));
    ok(await web.cancelWebSchedule({ id: second }));
    const after = await item(second);
    expect(after).toMatchObject({ status: 'draft', published: null, publish_at: null });
  });

  it('«Devolver con comentario»: vuelve al borrador con la nota y le llega a quien lo envió', async () => {
    const id = await newNews('Nota para devolver (demo)');
    ok(await web.submitWebItem({ id }));
    h.notices.length = 0;
    as('webPublisher');
    expect(await web.returnWebItem({ id, note: 'x' })).toEqual({ ok: false, error: 'Escribe qué hay que cambiar.' });
    ok(await web.returnWebItem({ id, note: 'Falta la fuente del dato de la plaza.' }));
    expect(await item(id)).toMatchObject({ status: 'draft', review_note: 'Falta la fuente del dato de la plaza.' });
    expect(h.notices).toEqual([expect.objectContaining({ kind: 'web_returned', userIds: [t.ids.webEditor] })]);
  });

  it('archivar lo saca de la web al momento (y refresca sus páginas); desarchivar lo trae', async () => {
    const live = await bySlug('news', 'alumbrado-nuevo-cardenas-demo');
    expect(await anonSees(live.id)).toBe(true);
    as('webPublisher');
    ok(await web.archiveWebItem({ id: live.id }));
    expect(await anonSees(live.id)).toBe(false);
    expect(h.paths).toContain('/actualidad/alumbrado-nuevo-cardenas-demo');
    // An archived item is not edited until it comes back.
    const a = await item(live.id);
    as('webEditor');
    expect(await web.saveWebDraft({ id: a.id, rev: a.rev, slug: a.slug, draft: a.draft })).toEqual({ ok: false, error: 'Está archivado: quien aprueba lo desarchiva antes de cambiarlo.' });
    as('webPublisher');
    ok(await web.unarchiveWebItem({ id: live.id }));
    expect(await anonSees(live.id)).toBe(true);
  });

  it('el jefe también publica; Administración y Redes no', async () => {
    const id = await newNews('Nota que publica el jefe (demo)');
    const it = await item(id);
    as('admin');
    expect(await web.publishWebItem({ id, rev: it.rev })).toEqual({ ok: false, error: 'Publica quien aprueba la web o el jefe, con doble factor.' });
    expect(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: it.draft })).toEqual({ ok: false, error: expect.stringMatching(/^Escriben la web/) });
    as('social');
    expect(await web.publishWebItem({ id, rev: it.rev })).toMatchObject({ ok: false });
    as('boss');
    ok(await web.publishWebItem({ id, rev: it.rev }));
    expect(await anonSees(id)).toBe(true);
  });
});

describe('versiones y direcciones', () => {
  it('«Volver a esta versión» copia al borrador; lo publicado no cambia hasta aprobarlo de nuevo', async () => {
    const id = await newNews('Nota con versiones (demo)');
    let it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, excerpt: 'Primera versión (demo).' } }));
    it = await item(id);
    as('webPublisher');
    ok(await web.publishWebItem({ id, rev: it.rev }));
    as('webEditor');
    it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, excerpt: 'Segunda versión con un error (demo).' } }));
    const r = ok(await web.restoreWebVersion({ id, version: 2 }));
    const after = await item(id);
    expect(r.draftVersion).toBe(after.draft_version);
    expect(after.draft.excerpt).toBe('Primera versión (demo).');
    expect(after.published?.excerpt).toBe('Primera versión (demo).');
    expect(after.status).toBe('draft');
    expect(after.published_version).toBe(2);
    const note = await t.system((sql) => sql.one<{ note: string }>(`select note from public.web_versions where item_id = $1 and version_no = $2`, [id, after.draft_version]));
    expect(note?.note).toBe('Vuelta a la versión 2');
    as('admin');
    expect(await web.restoreWebVersion({ id, version: 1 })).toEqual({ ok: false, error: 'Vuelve a una versión quien edita la web, con doble factor.' });
  });

  it('la dirección de algo publicado la cambia quien aprueba, y la vieja lleva a la nueva (301, sin cadenas)', async () => {
    const live = await bySlug('news', 'escuela-rehabilitada-michelena-demo');
    as('webEditor');
    expect(await web.saveWebDraft({ id: live.id, rev: live.rev, slug: 'escuela-de-michelena-demo', draft: live.draft })).toEqual({
      ok: false, error: 'La dirección de algo ya publicado la cambia quien publica (y deja una redirección).',
    });
    as('webPublisher');
    const r = ok(await web.saveWebDraft({ id: live.id, rev: live.rev, slug: 'escuela-de-michelena-demo', draft: live.draft }));
    expect(r.redirected).toBe('/actualidad/escuela-rehabilitada-michelena-demo');
    const red = () => t.system((sql) => sql.query<{ from_path: string; to_path: string; status_code: number }>(`select from_path, to_path, status_code from public.web_redirects where from_path like '/actualidad/escuela%' order by from_path`));
    expect(await red()).toEqual([{ from_path: '/actualidad/escuela-rehabilitada-michelena-demo', to_path: '/actualidad/escuela-de-michelena-demo', status_code: 301 }]);
    expect(h.tags).toContain('web:redirects');
    expect(h.paths).toEqual(expect.arrayContaining(['/actualidad/escuela-rehabilitada-michelena-demo', '/actualidad/escuela-de-michelena-demo']));
    // A second change: the oldest address goes straight to the newest.
    const again = await item(live.id);
    ok(await web.saveWebDraft({ id: live.id, rev: again.rev, slug: 'escuela-michelena-demo', draft: again.draft }));
    expect((await red()).map((x) => [x.from_path, x.to_path])).toEqual([
      ['/actualidad/escuela-de-michelena-demo', '/actualidad/escuela-michelena-demo'],
      ['/actualidad/escuela-rehabilitada-michelena-demo', '/actualidad/escuela-michelena-demo'],
    ]);
    expect(await anonSees(live.id)).toBe(true);
  });
});

describe('los ajustes del sitio y las redirecciones', () => {
  it('los ajustes los cambian administración, quien aprueba y el jefe; se revisan y la web se refresca', async () => {
    as('webEditor');
    expect(await site.saveSiteSetting({ key: 'site.navigation', value: [{ label: 'Inicio', path: '/' }] })).toEqual({ ok: false, error: expect.stringMatching(/^Los ajustes del sitio los cambian/) });
    as('admin');
    expect(await site.saveSiteSetting({ key: 'site.navigation', value: [{ label: 'Afuera', path: 'https://otro.test' }] })).toEqual({ ok: false, error: expect.stringMatching(/^Revisa la navegación/) });
    expect(await site.saveSiteSetting({ key: 'site.algo', value: 1 })).toMatchObject({ ok: false });
    ok(await site.saveSiteSetting({ key: 'site.contacts', value: [{ label: 'Atención (demo)', value: 'atencion@ejemplo.test', href: 'mailto:atencion@ejemplo.test', verified: true }] }));
    expect(h.tags).toEqual(['web:settings']);
    const anon = await asAnon(t.backend, (sql) => sql.one<{ value: unknown }>(`select value from public.web_settings where key = 'site.contacts'`));
    expect(anon?.value).toEqual([{ label: 'Atención (demo)', value: 'atencion@ejemplo.test', href: 'mailto:atencion@ejemplo.test', verified: true }]);
    // A channel keeps its internal note; turned off it is null.
    as('webPublisher');
    ok(await site.saveSiteSetting({ key: 'site.whatsapp_channel', value: { url: 'https://whatsapp.com/channel/demo', verified: false, active: true, note: 'Por confirmar (demo)' } }));
    ok(await site.saveSiteSetting({ key: 'site.whatsapp_channel', value: null }));
  });

  it('una cuenta verificada llega a sameAs; una sin verificar, no', async () => {
    const { normalizeSite } = await import('@/lib/web/site-settings');
    as('admin');
    ok(await site.saveSiteSetting({ key: 'site.social_accounts', value: [
      { network: 'instagram', handle: '@demo', url: 'https://www.instagram.com/demo/', verified: true, active: true },
      { network: 'x', handle: '@demo', url: 'https://x.com/demo', verified: false, active: true },
    ] }));
    const raw = Object.fromEntries((await asAnon(t.backend, (sql) => sql.query<{ key: string; value: unknown }>(`select key, value from public.web_settings`))).map((r) => [r.key, r.value]));
    const s = normalizeSite(raw, { demo: false, indexable: false, baseUrl: 'https://web.test' });
    expect(s.sameAs).toEqual(['https://www.instagram.com/demo/']);
    expect(s.accounts.map((a) => a.url)).toEqual(['https://www.instagram.com/demo/']);
  });

  it('redirecciones: solo hacia esta web, desde una dirección que la web no contesta; sin repetir; quien maneja el sitio', async () => {
    as('admin');
    expect(await site.saveRedirect({ from: '/2024/05/vieja', to: 'https://otro.test/x' })).toEqual({ ok: false, error: expect.stringMatching(/^El destino es una dirección de esta web/) });
    expect(await site.saveRedirect({ from: '/gestion', to: '/actualidad' })).toEqual({ ok: false, error: expect.stringMatching(/la redirección nunca se usaría/) });
    expect(await site.saveRedirect({ from: 'sin-barra', to: '/actualidad' })).toMatchObject({ ok: false });
    ok(await site.saveRedirect({ from: '/2024/05/una-nota-vieja/', to: '/actualidad' }));
    expect(h.tags).toEqual(['web:redirects']);
    expect(await site.saveRedirect({ from: '/2024/05/una-nota-vieja', to: '/gestion' })).toEqual({ ok: false, error: expect.stringMatching(/^Ya hay una redirección/) });
    const row = (await t.system((sql) => sql.one<{ id: string; to_path: string }>(`select id, to_path from public.web_redirects where from_path = '/2024/05/una-nota-vieja'`)))!;
    expect(row.to_path).toBe('/actualidad');
    ok(await site.saveRedirect({ id: row.id, from: 'x', to: '/gestion', status: 302 }));
    as('webEditor');
    expect(await site.deleteRedirect({ id: row.id })).toMatchObject({ ok: false });
    as('webPublisher');
    ok(await site.deleteRedirect({ id: row.id }));
  });
});

describe('la biblioteca', () => {
  const post = (fields: Record<string, string>, file: Uint8Array | null, name = 'foto.png', headers: Record<string, string> = { origin: 'http://localhost:3000', host: 'localhost:3000' }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (file) fd.set('file', new Blob([file as Uint8Array<ArrayBuffer>]), name);
    return new Request('http://localhost:3000/admin/web/biblioteca/subir', { method: 'POST', body: fd, headers });
  };

  it('subir una foto: con su texto alternativo, limpia, como la persona; sin texto o de otro sitio, no', async () => {
    as('webEditor');
    const noAlt = await upload.POST(post({ kind: 'image', alt: '' }, pngOf(400, 300)) as never);
    expect(noAlt.status).toBe(422);
    expect(await noAlt.json()).toEqual({ ok: false, error: expect.stringMatching(/^Falta el texto alternativo/) });
    expect((await upload.POST(post({ kind: 'image', alt: 'Una cancha (demo)' }, pngOf(400, 300), 'foto.png', { origin: 'https://otro.test', host: 'localhost:3000' }) as never)).status).toBe(403);
    expect((await upload.POST(post({ kind: 'image', alt: 'Una cancha (demo)' }, new TextEncoder().encode('<svg/>'), 'x.svg') as never)).status).toBe(415);
    const res = await upload.POST(post({ kind: 'image', alt: 'Cancha techada del barrio de prueba (demo)', credit: 'Prensa (demo)', focalX: '0.25', focalY: '0.75' }, pngOf(400, 300)) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; media: { id: string; alt: string; width: number; focalX: number; url: string } };
    expect(body.media).toMatchObject({ alt: 'Cancha techada del barrio de prueba (demo)', width: 400, focalX: 0.25 });
    expect(body.media.url).toMatch(/^\/api\/archivos\/web\/[0-9a-f-]{36}\.png$/);
    const row = await t.system((sql) => sql.one<{ created_by: string; mime: string }>(`select created_by, mime from public.web_media where id = $1`, [body.media.id]));
    expect(row).toEqual({ created_by: t.ids.webEditor, mime: 'image/png' });
    // Who does not edit the web uploads nothing.
    as('admin');
    expect((await upload.POST(post({ kind: 'image', alt: 'Otra (demo)' }, pngOf(400, 300)) as never)).status).toBe(403);
    as('webEditor', 'aal1');
    expect((await upload.POST(post({ kind: 'image', alt: 'Otra (demo)' }, pngOf(400, 300)) as never)).status).toBe(401);
  });

  it('las palabras de un archivo: el texto alternativo de una foto no queda vacío; archivar lo saca del selector', async () => {
    as('webEditor');
    const res = await upload.POST(post({ kind: 'image', alt: 'Fachada de la escuela de prueba (demo)' }, pngOf(300, 300)) as never);
    const { media } = (await res.json()) as { media: { id: string } };
    expect(await site.updateWebMedia({ id: media.id, alt: '', caption: '', credit: '', title: '', focalX: 0.5, focalY: 0.5 })).toEqual({ ok: false, error: expect.stringMatching(/^Falta el texto alternativo/) });
    ok(await site.updateWebMedia({ id: media.id, alt: 'Fachada pintada de la escuela (demo)', caption: 'Así quedó (demo)', credit: 'Prensa (demo)', title: '', focalX: 0.1, focalY: 0.9 }));
    const picked = ok(await web.pickWebMedia({ kind: 'image', q: 'fachada pintada' }));
    expect(picked.map((m) => m.id)).toContain(media.id);
    ok(await site.archiveWebMedia({ id: media.id, archived: true }));
    expect(ok(await web.pickWebMedia({ kind: 'image', q: 'fachada pintada' })).map((m) => m.id)).not.toContain(media.id);
    as('social');
    expect(await site.updateWebMedia({ id: media.id, alt: 'Cambiada', caption: '', credit: '', title: '', focalX: 0.5, focalY: 0.5 })).toEqual({ ok: false, error: expect.stringMatching(/^La biblioteca la cambian/) });
  });

  it('un borrador con una foto archivada no se envía a aprobación', async () => {
    as('webEditor');
    const res = await upload.POST(post({ kind: 'image', alt: 'Foto que se archiva (demo)' }, pngOf(300, 300)) as never);
    const { media } = (await res.json()) as { media: { id: string } };
    const id = await newNews('Nota con foto archivada (demo)');
    const it = await item(id);
    ok(await web.saveWebDraft({ id, rev: it.rev, slug: it.slug, draft: { ...it.draft, coverId: media.id } }));
    ok(await site.archiveWebMedia({ id: media.id, archived: true }));
    expect(await web.submitWebItem({ id })).toEqual({ ok: false, error: expect.stringMatching(/está archivado en la biblioteca/) });
  });
});
