// The public website's part of the client's seed (seedClient → seedWebPublica, config/clients/fb.json «participation» and
// «web»): it runs on production too, so it is idempotent, never overwrites what the team changed, invents no contact,
// account or parish, and leaves the skeleton pages as drafts.
import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '@/lib/db/pglite';
import { asSystem } from '@/lib/db/core';
import { seedClient, slugify } from '@/lib/db/seed-client';
import { getClientConfig } from '@/lib/client-config';

type Block = { id: string; type: string; visible: boolean; data: Record<string, unknown> };

describe('la semilla de la web pública', () => {
  it('dos veces deja lo mismo, y lo que el equipo cambió se queda', async () => {
    const { db, backend } = await createMemoryDb();
    try {
      await asSystem(backend, (sql) => seedClient(sql));
      const count = async (q: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${q}`)).rows[0].n;
      const before = {
        municipalities: await count(`public.territories where kind = 'municipality'`),
        parishes: await count(`public.territories where kind = 'parish'`),
        areas: await count('public.areas'),
        categories: await count('public.request_categories'),
        settings: await count('public.web_settings'),
        pages: await count(`public.web_items where kind = 'page'`),
        versions: await count('public.web_versions'),
      };
      expect(before).toEqual({ municipalities: 29, parishes: 0, areas: 4, categories: 10, settings: 12, pages: 6, versions: 6 });
      await db.exec(`update public.request_categories set name = 'Agua potable' where slug = 'agua';
                     update public.web_settings set value = '"Texto del equipo"' where key = 'site.demo_banner';
                     update public.web_items set draft = jsonb_set(draft, '{title}', '"Portada del equipo"') where slug = 'inicio'`);
      await asSystem(backend, (sql) => seedClient(sql));
      expect({
        municipalities: await count(`public.territories where kind = 'municipality'`),
        parishes: await count(`public.territories where kind = 'parish'`),
        areas: await count('public.areas'),
        categories: await count('public.request_categories'),
        settings: await count('public.web_settings'),
        pages: await count(`public.web_items where kind = 'page'`),
        versions: await count('public.web_versions'),
      }).toEqual({ ...before, versions: 7 });
      const kept = await db.query<{ a: string; b: unknown; c: string }>(
        `select (select name from public.request_categories where slug = 'agua') as a,
                (select value from public.web_settings where key = 'site.demo_banner') as b,
                (select draft ->> 'title' from public.web_items where slug = 'inicio') as c`);
      expect(kept.rows[0]).toEqual({ a: 'Agua potable', b: 'Texto del equipo', c: 'Portada del equipo' });
      // Every category has its area; the limits and the due days are in the settings.
      expect(await count('public.request_categories where default_area_id is null')).toBe(0);
      const s = await db.query<{ key: string }>(`select key from public.app_settings where key like 'participation.%' order by key`);
      expect(s.rows.map((r) => r.key)).toEqual(['participation.due_days_by_priority', 'participation.rate_limits']);
      // Nothing of it is public before someone publishes it.
      expect(await count('public.web_items where published is not null')).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it('las páginas base: bloques con id, tipo, visible y datos; las legales marcan lo que falta antes de publicar', () => {
    const pages = getClientConfig().web.pages;
    expect(pages.map((p) => p.slug)).toEqual(['inicio', 'gobernador', 'atencion', 'aviso-de-privacidad', 'condiciones-de-participacion', 'accesibilidad']);
    for (const p of pages) {
      const d = p.draft as { title: string; blocks: Block[]; seo: { title: string; description: string } };
      expect(d.title, p.slug).toBeTruthy();
      expect(d.seo.description.length, p.slug).toBeGreaterThan(40);
      expect(new Set(d.blocks.map((b) => b.id)).size, p.slug).toBe(d.blocks.length);
      for (const b of d.blocks) expect(Object.keys(b).sort(), `${p.slug} ${b.id}`).toEqual(['data', 'id', 'type', 'visible']);
    }
    for (const slug of ['aviso-de-privacidad', 'condiciones-de-participacion', 'accesibilidad', 'gobernador']) {
      const text = JSON.stringify(pages.find((p) => p.slug === slug)!.draft);
      expect(text, slug).toContain('"type":"pending"');
      expect(text, slug).toMatch(/Por completar/);
    }
  });

  it('nada real que no deba ir en un repositorio público: sin correos, teléfonos, contactos ni parroquias; las cuentas del diagnóstico, todas por confirmar', async () => {
    const cfg = getClientConfig();
    const text = JSON.stringify({ participation: cfg.participation, web: cfg.web });
    expect(text).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    // The only addresses are the public accounts and the portal the diagnosis found (docs/diagnostico.md §8), over https
    // and «por confirmar»: production shows none of them until the team verifies them (src/lib/web/site-settings.ts).
    const PUBLIC_HOSTS = ['www.youtube.com', 'www.instagram.com', 'x.com', 'www.facebook.com', 'www.tiktok.com', 'www.threads.com', 'mastodon.social', 'freddybernalrosales.wordpress.com', 'tachira.gob.ve'];
    const links = text.match(/https?:\/\/[^"\s]+/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      const u = new URL(l);
      expect(u.protocol, l).toBe('https:');
      expect(PUBLIC_HOSTS, l).toContain(u.hostname);
    }
    const accounts = cfg.web.settings['site.social_accounts'] as { verified: boolean }[];
    expect(accounts.every((a) => a.verified === false)).toBe(true);
    expect(cfg.web.settings['site.institutional_portal']).toMatchObject({ verified: false });
    expect(cfg.web.settings['site.contacts']).toEqual([]);
    expect(cfg.web.settings['site.whatsapp_channel']).toBeNull();
    expect(Object.keys(cfg.parishes).filter((k) => !k.startsWith('$'))).toEqual([]);
    const { db } = await createMemoryDb();
    try {
      // A profile's number inside its address is not a phone: the addresses are checked above, the rest here.
      const r = await db.query<{ phone: boolean }>(`select public.text_has_phone($1) as phone`, [text.replace(/https:\/\/[^"\s]+/g, '')]);
      expect(r.rows[0].phone).toBe(false);
    } finally {
      await db.close();
    }
  }, 120_000);

  it('slugify: sin tildes, en minúsculas y con guiones', () => {
    expect(slugify('San Cristóbal')).toBe('san-cristobal');
    expect(slugify('José María Vargas')).toBe('jose-maria-vargas');
    expect(slugify('  Fernández   Feo ')).toBe('fernandez-feo');
    expect(getClientConfig().municipalities.map(slugify).every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toBe(true);
  });
});
