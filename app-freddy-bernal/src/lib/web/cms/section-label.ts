import 'server-only';
import { getClientConfig, type ClientConfig } from '../../client-config';
import type { KindSection } from './kinds';

// The weekly program's name comes from the client's config (config/clients/fb.json, §11.6), never from the code: the
// label of its entry in the site's menu (the public page says the same), else the brand's «programName». The address
// «/reporte-bernal» is a route and stays. Server code only (it reads the whole config, which the browser never needs):
// the panel's pages pass the name down where a client component shows it (the block editor's new video block).

const PROGRAM_PATH = '/reporte-bernal';

/** The program's name for this client: what the menu calls the program's page. */
export function programLabel(cfg: ClientConfig = getClientConfig()): string {
  const nav = (cfg.web.settings as Record<string, unknown>)['site.navigation'];
  const entry = Array.isArray(nav) ? (nav as { label?: unknown; path?: unknown }[]).find((n) => n?.path === PROGRAM_PATH) : undefined;
  const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
  return label || cfg.brand.programName;
}

/** A section's name in the panel: the program's is the client's; the others, as kinds.ts says them. */
export function sectionLabel(s: Pick<KindSection, 'kind' | 'label'>, cfg?: ClientConfig): string {
  return s.kind === 'episode' ? programLabel(cfg) : s.label;
}
