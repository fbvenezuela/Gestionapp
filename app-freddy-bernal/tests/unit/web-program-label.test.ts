// The weekly program's name comes from the client's config, never from the code (§11.6, the public repository): the
// panel's section of episodes and a new video block say what the site's menu calls the program's page, and the shared
// code (read by the browser too) only has neutral words. All data here is invented except the config, read as it is.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getClientConfig, type ClientConfig } from '@/lib/client-config';
import type { Site } from '@/lib/web/site-settings';

// The menu as «Ajustes del sitio» saved it (F7, R23): null = the settings could not be read.
const saved = vi.hoisted(() => ({ navigation: null as { label: string; path: string }[] | null, programName: '' }));
vi.mock('@/lib/web/site', () => ({
  getSite: vi.fn(async () => {
    if (!saved.navigation) throw new Error('sin ajustes (prueba)');
    return { navigation: saved.navigation, programName: saved.programName } as unknown as Site;
  }),
}));

const { configProgramLabel, programLabel, sectionLabel } = await import('@/lib/web/cms/section-label');
import { KIND_SECTIONS, sectionOf } from '@/lib/web/cms/kinds';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { starter } from '@/components/cms/block-editor';

const cfg = getClientConfig();
const menu = (cfg.web.settings as Record<string, unknown>)['site.navigation'] as { label: string; path: string }[];
const fromMenu = menu.find((n) => n.path === '/reporte-bernal')!.label;
const withMenu = (nav: unknown): ClientConfig => ({ ...cfg, web: { ...cfg.web, settings: { ...cfg.web.settings, 'site.navigation': nav } } }) as ClientConfig;

describe('el nombre del programa semanal sale de la configuración del cliente', () => {
  it('lo que dice el menú de la web; sin esa entrada, el nombre del programa de la marca', () => {
    expect(configProgramLabel()).toBe(fromMenu);
    expect(configProgramLabel(withMenu([{ label: 'Programa de prueba', path: '/reporte-bernal' }]))).toBe('Programa de prueba');
    expect(configProgramLabel(withMenu([{ label: 'Inicio', path: '/' }]))).toBe(cfg.brand.programName);
    expect(configProgramLabel(withMenu([{ label: '  ', path: '/reporte-bernal' }]))).toBe(cfg.brand.programName);
  });

  it('el panel dice lo que dice la web: el menú guardado en «Ajustes del sitio»; sin poder leerlo, el de la configuración', async () => {
    saved.navigation = [{ label: 'Programa renombrado (prueba)', path: '/reporte-bernal' }];
    saved.programName = 'Programa de la marca (prueba)';
    expect(await programLabel()).toBe('Programa renombrado (prueba)');
    // Without its entry in the saved menu, what /reporte-bernal says then: the brand's program name.
    saved.navigation = [{ label: 'Inicio', path: '/' }];
    expect(await programLabel()).toBe('Programa de la marca (prueba)');
    saved.programName = '';
    expect(await programLabel()).toBe(fromMenu);
    saved.navigation = null;
    expect(await programLabel()).toBe(fromMenu);
  });

  it('la sección de episodios del panel lo usa; las demás, su nombre de siempre', () => {
    expect(sectionLabel(sectionOf('episode'), 'Programa de prueba')).toBe('Programa de prueba');
    for (const s of KIND_SECTIONS.filter((x) => x.kind !== 'episode')) expect(sectionLabel(s, 'Programa de prueba')).toBe(s.label);
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
