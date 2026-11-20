// The public website's frame and its base pieces (design §3, §7): text is escaped (no HTML or script an editor writes
// ever runs) and links go only through safeHref; the demo band, the header, the channels, the participation accesses and
// the footer; pages arrive whole (no loading skeleton); and no dangerouslySetInnerHTML anywhere but the escaped JSON-LD,
// no heavy library in the web's client components. (Until 19/11/2026 in web-blocks-render.test.ts, with the blocks; the
// shared helpers are in helpers/web-render.ts.)
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import type { TextNode } from '@/lib/web/blocks';
import { RichText } from '@/components/web/rich-text';
import { ExternalText, SafeLink } from '@/components/web/ui';
import { ChannelPills, PendingAccountsNote, orderedChannels, pendingAccountsText } from '@/components/web/channels';
import { DemoBanner } from '@/components/web/public-chrome';
import { SiteHeader } from '@/components/web/site-header';
import { ParticipationActions } from '@/components/web/participation-actions';
import { SiteFooter } from '@/components/web/site-footer';
import { EMERGENCY_NOTICE } from '@/lib/participation/notices';
import { EVIL, html, site } from './helpers/web-render';

describe('el texto estructurado: escapado siempre', () => {
  it('ningún texto de un editor sale como HTML ni como script', () => {
    const nodes = [
      { type: 'heading', level: 2, text: EVIL },
      { type: 'paragraph', text: EVIL },
      { type: 'paragraph', runs: [{ text: EVIL, bold: true }, { text: ' y un enlace', href: '/gestion' }] },
      { type: 'list', items: [EVIL, [{ text: EVIL, italic: true }]] },
      { type: 'quote', text: EVIL, cite: EVIL },
      { type: 'pending', text: EVIL },
    ] as TextNode[];
    // The administrator's preview draws everything, the «por completar» slot too: escaped all the same.
    const out = html(h(RichText, { nodes, preview: true }));
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toMatch(/<a [^>]*href="\/gestion"/);
    expect(out).toContain('Por completar');
    const pub = html(h(RichText, { nodes }));
    expect(pub).not.toContain('<script');
    expect(pub).not.toContain('Por completar');
  });

  it('un enlace que no pasa safeHref (aunque se cuele) sale como texto, sin href', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', '//otro.test', 'vbscript:x']) {
      const out = html(h(RichText, { nodes: [{ type: 'paragraph', runs: [{ text: 'clic', href: bad }] }] as TextNode[] }));
      expect(out, bad).not.toContain('href');
      expect(out, bad).toContain('clic');
    }
    expect(html(h(SafeLink, { href: 'https://fuente.test/a', children: 'fuente' }))).toBe('<a href="https://fuente.test/a" rel="noopener noreferrer">fuente</a>');
    expect(html(h(SafeLink, { href: 'mailto:prensa@ejemplo.test', children: 'correo' }))).toContain('href="mailto:prensa@ejemplo.test"');
  });

  it('los saltos de línea de un párrafo quedan, sin HTML', () => {
    expect(html(h(RichText, { nodes: [{ type: 'paragraph', text: 'uno\ndos' }] as TextNode[] }))).toContain('uno<br/>dos');
  });
});

describe('el marco de la web', () => {
  it('el aviso de la versión de prueba, fijo', () => {
    expect(html(h(DemoBanner, { text: site.demoBanner }))).toContain('Versión de prueba. El contenido es de ejemplo.');
  });

  it('las páginas llegan enteras: sin loading.tsx (un esqueleto escondería el contenido a quien no tiene JavaScript); la carga es la barra de arriba', () => {
    const web = path.join(process.cwd(), 'src', 'app', '(web)');
    expect(fs.existsSync(path.join(web, 'loading.tsx'))).toBe(false);
    const chrome = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'web', 'public-chrome.tsx'), 'utf8');
    expect(chrome).toMatch(/<Suspense fallback=\{null\}>\s*<NavProgress \/>\s*<\/Suspense>/);
  });

  it('la cabecera: el nombre en letras, las dos acciones a la vista y el menú del teléfono nativo (abre al primer toque)', () => {
    const out = html(h(SiteHeader, { site }));
    expect(out).toContain(site.name);
    expect(out.match(/href="\/atencion\/nueva\?tipo=reporte"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out.match(/href="\/atencion\/consultar"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toMatch(/<details[^>]*>\s*<summary/);
    expect(out).toContain('Menú');
    for (const n of site.navigation) expect(out).toContain(`href="${n.path}"`);
    expect(out).not.toMatch(/<img|logo/i);
  });

  it('los canales: el del programa primero, cada uno una vez; sin una marca en cada cuenta por confirmar, una sola línea', () => {
    const list = orderedChannels(site);
    expect(list[0].url).toBe('https://www.youtube.com/@FreddyBernal.oficial');
    expect(new Set(list.map((c) => c.url)).size).toBe(list.length);
    const out = html(h(ChannelPills, { channels: list }));
    expect(out).not.toMatch(/sin verificar|por confirmar/);
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    // None confirmed: one line for all of them; some confirmed: the line says which; production lists only confirmed ones.
    expect(pendingAccountsText(list, true)).toBe('Estas cuentas están en proceso de confirmación.');
    const mixed = [{ ...list[0], verified: true }, ...list.slice(1)];
    expect(pendingAccountsText(mixed, true)).toBe('Las cuentas sin la marca de verificación están en proceso de confirmación.');
    expect(html(h(ChannelPills, { channels: mixed }))).toContain('<span class="sr-only">verificada</span>');
    expect(pendingAccountsText(mixed.map((c) => ({ ...c, verified: true })), true)).toBeNull();
    expect(pendingAccountsText(list, false)).toBeNull();
    expect(html(h(PendingAccountsNote, { channels: list, demo: true }))).toContain('Estas cuentas están en proceso de confirmación.');
  });

  it('un enlace a otro sitio: el icono va pegado a la última palabra (nunca solo en una línea del teléfono)', () => {
    const out = html(h(ExternalText, { text: 'Canal de YouTube @canal.prueba' }));
    expect(out).toMatch(/^<span>Canal de YouTube <span class="whitespace-nowrap">@canal\.prueba<svg[^>]*aria-hidden="true"/);
    expect(out.replace(/<[^>]+>/g, '')).toBe('Canal de YouTube @canal.prueba');
    expect(html(h(ExternalText, { text: ' Portal ' }))).toMatch(/^<span><span class="whitespace-nowrap">Portal<svg/);
  });

  it('los accesos de participación: el reporte en naranja, los cuatro tipos y el aviso de emergencias', () => {
    const out = html(h(ParticipationActions, { title: 'Atención ciudadana' }));
    for (const href of ['/atencion/nueva?tipo=reporte', '/atencion/nueva?tipo=peticion', '/atencion/nueva?tipo=acotacion', '/atencion/nueva?tipo=denuncia', '/atencion/consultar']) {
      expect(out, href).toContain(`href="${href}"`);
    }
    expect(out).toContain('bg-action');
    expect(out).toContain(EMERGENCY_NOTICE);
  });

  it('el pie de la web: el aviso de emergencias es el de las constantes (el mismo de los formularios y los correos)', () => {
    const out = html(h(SiteFooter, { site }));
    expect(out).toContain(EMERGENCY_NOTICE);
    expect(out.match(/no es un servicio de emergencias/gi)).toHaveLength(1);
  });
});

describe('nada de HTML crudo en la web pública', () => {
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));

  it('dangerouslySetInnerHTML solo en json-ld.tsx (datos escapados, nunca contenido)', () => {
    const offenders = [...files(path.join('src', 'components', 'web')), ...files(path.join('src', 'app', '(web)'))]
      .filter((f) => /dangerouslySetInnerHTML\s*=/.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith(path.join('components', 'web', 'json-ld.tsx')));
    expect(offenders).toEqual([]);
  });

  it('los componentes de cliente de la web no traen librerías pesadas (ni iconos ni clases combinadas)', () => {
    const client = files(path.join('src', 'components', 'web')).filter((f) => /^['"]use client['"]/.test(fs.readFileSync(f, 'utf8').trimStart()));
    expect(client.length).toBeGreaterThan(0);
    for (const f of client) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import [^;]*from '(lucide-react|@\/lib\/cn|tailwind-merge|clsx|next\/image)';/m);
    }
  });
});
