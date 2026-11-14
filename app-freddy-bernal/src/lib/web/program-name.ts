import type { ClientConfig } from '../client-config';

// The weekly program's name, from the client's config (config/clients/<brand>.json, §11.6), never from the code: the
// label of its entry in the site's menu as the config brings it, else the brand's «programName». The address
// «/reporte-bernal» is a route and stays. Pure, so the demo seed can use it too. The panel reads the menu as «Ajustes
// del sitio» saved it, like the public page (cms/section-label.ts, server code only), and falls back to this.

export const PROGRAM_PATH = '/reporte-bernal';

/** The program's name for this client: what the config's menu calls the program's page. */
export function programNameOf(cfg: ClientConfig): string {
  const nav = (cfg.web.settings as Record<string, unknown>)['site.navigation'];
  const entry = Array.isArray(nav) ? (nav as { label?: unknown; path?: unknown }[]).find((n) => n?.path === PROGRAM_PATH) : undefined;
  const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
  return label || cfg.brand.programName;
}
