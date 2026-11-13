// The weekly program's name comes from the client's config, never from the code (§11.6, the public repository): the
// panel's section of episodes and a new video block say what the site's menu calls the program's page, and the shared
// code (read by the browser too) only has neutral words. All data here is invented except the config, read as it is.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getClientConfig, type ClientConfig } from '@/lib/client-config';
import { programLabel, sectionLabel } from '@/lib/web/cms/section-label';
import { KIND_SECTIONS, sectionOf } from '@/lib/web/cms/kinds';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { starter } from '@/components/cms/block-editor';

const cfg = getClientConfig();
const menu = (cfg.web.settings as Record<string, unknown>)['site.navigation'] as { label: string; path: string }[];
const fromMenu = menu.find((n) => n.path === '/reporte-bernal')!.label;
const withMenu = (nav: unknown): ClientConfig => ({ ...cfg, web: { ...cfg.web, settings: { ...cfg.web.settings, 'site.navigation': nav } } }) as ClientConfig;

describe('el nombre del programa semanal sale de la configuración del cliente', () => {
  it('lo que dice el menú de la web; sin esa entrada, el nombre del programa de la marca', () => {
    expect(programLabel()).toBe(fromMenu);
    expect(programLabel(withMenu([{ label: 'Programa de prueba', path: '/reporte-bernal' }]))).toBe('Programa de prueba');
    expect(programLabel(withMenu([{ label: 'Inicio', path: '/' }]))).toBe(cfg.brand.programName);
    expect(programLabel(withMenu([{ label: '  ', path: '/reporte-bernal' }]))).toBe(cfg.brand.programName);
  });

  it('la sección de episodios del panel lo usa; las demás, su nombre de siempre', () => {
    expect(sectionLabel(sectionOf('episode'))).toBe(fromMenu);
    for (const s of KIND_SECTIONS.filter((x) => x.kind !== 'episode')) expect(sectionLabel(s)).toBe(s.label);
  });

  it('un bloque de video nuevo lleva el nombre del programa; los demás, su texto de siempre', () => {
    expect(starter('video', 'Programa de prueba')).toEqual({ title: 'Programa de prueba', latestEpisode: true });
    expect(starter('news', 'Programa de prueba')).toEqual({ title: 'Últimas publicaciones', limit: 4 });
  });

  it('el código que también lee el navegador no escribe el nombre del programa', () => {
    expect(WEB_KIND_LABEL.episode).toBe('Episodio');
    const words = [cfg.brand.programName, fromMenu];
    const files = [
      'src/lib/web/schema.ts',
      'src/lib/web/cms/kinds.ts',
      ...fs.readdirSync('src/components/cms').filter((f) => /\.tsx?$/.test(f)).map((f) => path.join('src/components/cms', f)),
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const w of words) expect(src.includes(w), `${f}: «${w}»`).toBe(false);
    }
  });
});
