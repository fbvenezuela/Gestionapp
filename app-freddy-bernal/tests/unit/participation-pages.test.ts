// What the participation pages read (src/app/(web)/atencion/_lib/data.ts), over the demo database as anon: the form's
// catalogues, the published item a request is about (never a draft, something in review or scheduled for later), the
// FAQs of the group «atencion» in their order, only the verified contacts, «lo atendido» with its filters (a denuncia
// never has a category), and the consultation behind the sealed cookie (none, tampered, or one that no longer finds
// anything). next/headers is mocked: the cookie jar of a browser.
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { today } from '@/lib/time';
import { LOOKUP_COOKIE, sealLookup } from '@/lib/participation/lookup-cookie';
import { receiptGrant } from '@/lib/web/participation';
import { makeTestDb, type TestDb } from '../rls/setup';

// The tests stand for the platform's proxy (they write x-real-ip): src/lib/participation/keys.ts trusts it only then.
const h = vi.hoisted(() => ({ trust: (process.env.TRUST_PROXY_HEADERS = 'true'), jar: new Map<string, string>(), ip: '203.0.113.200' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': h.ip }),
  cookies: async () => ({
    get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined),
    set: (n: string, v: string) => h.jar.set(n, v),
    delete: (n: string) => h.jar.delete(n),
  }),
}));

let t: TestDb;
let data: typeof import('@/app/(web)/atencion/_lib/data');
const YEAR = today().year;
const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  data = await import('@/app/(web)/atencion/_lib/data');
}, 120_000);

beforeEach(() => h.jar.clear());

describe('lo público del formulario', () => {
  it('los 29 municipios y las categorías activas, leídos como anon', async () => {
    const c = await data.loadFormCatalog();
    expect(c.municipalities).toHaveLength(29);
    expect(c.categories.map((x) => x.slug)).toContain('agua');
    expect(Object.keys(c.categories[0]).sort()).toEqual(['description', 'id', 'name', 'slug']);
  });

  it('«?sobre=» trae solo lo publicado: nunca un borrador, algo en revisión o programado para después', async () => {
    const project = await data.loadLinkedItem('project:rehabilitacion-avenida-principal-demo');
    expect(project).toMatchObject({ kind: 'project', kindLabel: 'Obra o acción', href: '/gestion/rehabilitacion-avenida-principal-demo' });
    expect(project!.title).toMatch(/\(demo\)$/);
    expect(await data.loadLinkedItem('news:arranco-rehabilitacion-avenida-principal-demo')).toMatchObject({ kind: 'news', href: '/actualidad/arranco-rehabilitacion-avenida-principal-demo' });
    for (const hidden of ['news:balance-del-mes-demo', 'news:ferias-de-alimentos-fin-de-semana-demo', 'news:proxima-jornada-de-vacunacion-libertador-demo', 'news:no-existe', 'page:inicio', "news:x' or '1'='1", null]) {
      expect(await data.loadLinkedItem(hidden), String(hidden)).toBeNull();
    }
  });

  it('las preguntas frecuentes del grupo «atencion», en el orden del equipo', async () => {
    const faqs = await data.loadAttentionFaqs();
    expect(faqs.length).toBe(6);
    expect(faqs.every((f) => f.category === 'atencion')).toBe(true);
    expect(faqs[0].data.title).toBe('¿Cómo sigo mi solicitud? (demo)');
    expect(faqs.map((f) => f.data.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('contactos: ninguno inventado en la demo; solo los que el equipo marcó verificados', async () => {
    expect(await data.loadVerifiedContacts()).toEqual([]);
    await t.system((sql) =>
      sql.query(`update public.web_settings set value = $1::text::jsonb where key = 'site.contacts'`, [
        JSON.stringify([
          { label: 'Atención (prueba)', value: '0276 000 0000', kind: 'phone', verified: true },
          { label: 'Sin confirmar (prueba)', value: '0276 111 1111', kind: 'phone', verified: false },
        ]),
      ]),
    );
    try {
      expect((await data.loadVerifiedContacts()).map((c) => [c.label, c.href])).toEqual([['Atención (prueba)', 'tel:02760000000']]);
    } finally {
      await t.system((sql) => sql.query(`update public.web_settings set value = '[]'::jsonb where key = 'site.contacts'`));
    }
  });
});

describe('lo atendido', () => {
  it('lo publicado, del más nuevo al más viejo, con filtros; una denuncia sin categoría ni nombre', async () => {
    const all = await data.loadAttended({ municipalityId: null, categoryId: null, page: 1, perPage: 12 });
    expect(all.total).toBe(7);
    expect(all.items.map((i) => i.publishedAt.getTime())).toEqual([...all.items.map((i) => i.publishedAt.getTime())].sort((a, b) => b - a));
    const denuncia = all.items.find((i) => i.type === 'denuncia')!;
    expect(denuncia).toMatchObject({ categoryId: null, displayName: null });
    expect(denuncia.summary).toMatch(/^Denuncia atendida en el municipio /);

    const c = await data.loadFormCatalog();
    const bolivar = c.municipalities.find((m) => m.name === 'Bolívar')!;
    const agua = c.categories.find((x) => x.slug === 'agua')!;
    const inBolivar = await data.loadAttended({ municipalityId: bolivar.id, categoryId: null, page: 1, perPage: 12 });
    expect(inBolivar.items.every((i) => i.municipalityId === bolivar.id)).toBe(true);
    expect(inBolivar.items.some((i) => i.type === 'denuncia')).toBe(true);
    const water = await data.loadAttended({ municipalityId: bolivar.id, categoryId: agua.id, page: 1, perPage: 12 });
    expect(water.items.length).toBeGreaterThan(0);
    expect(water.items.every((i) => i.type !== 'denuncia' && i.categoryId === agua.id)).toBe(true);

    const pages = await data.loadAttended({ municipalityId: null, categoryId: null, page: 2, perPage: 5 });
    expect(pages).toMatchObject({ total: 7, page: 2, pages: 2 });
    expect(pages.items).toHaveLength(2);
    expect(data.bySlug(c.municipalities, 'bolivar')?.id).toBe(bolivar.id);
    expect(data.bySlug(c.municipalities, ['bolivar'])).toBeNull();
  });
});

describe('la consulta detrás de la cookie', () => {
  it('sin cookie no hay consulta; con la cookie sellada, el resumen seguro', async () => {
    expect(await data.loadConsultation()).toEqual({ status: 'none' });
    h.jar.set(LOOKUP_COOKIE, sealLookup(receiptGrant(DEMR03.reference, DEMR03.secret)!));
    const c = await data.loadConsultation();
    expect(c.status).toBe('ok');
    const view = (c as Extract<typeof c, { status: 'ok' }>).view;
    expect(view.request.reference).toBe(DEMR03.reference);
    // Never a contact, an internal note or who in the team did what.
    expect(JSON.stringify(view)).not.toMatch(/name_enc|email_enc|internal_note|actor_id|assignee|area/);
  });

  it('una cookie alterada no es ninguna consulta; una bien sellada que ya no encuentra nada, tampoco muestra nada', async () => {
    const sealed = sealLookup(receiptGrant(DEMR03.reference, DEMR03.secret)!);
    h.jar.set(LOOKUP_COOKIE, sealed.slice(0, 30) + (sealed[30] === 'A' ? 'B' : 'A') + sealed.slice(31));
    expect(await data.loadConsultation()).toEqual({ status: 'none' });
    h.jar.set(LOOKUP_COOKIE, sealLookup(receiptGrant(DEMR03.reference, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ')!));
    expect(await data.loadConsultation()).toEqual({ status: 'gone' });
  });
});
