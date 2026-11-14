import 'server-only';
import { getClientConfig, type ClientConfig } from '../../client-config';
import { PROGRAM_PATH, programNameOf } from '../program-name';
import { getSite } from '../site';
import { navLabel } from '../site-settings';
import type { KindSection } from './kinds';

// The weekly program's name, never from the code (§11.6): what the public site calls it. That is the label of its
// entry in the menu as «Ajustes del sitio» → «Navegación» saved it, else the brand's «programName», the same read and
// the same fallback as /reporte-bernal (getSite() and navLabel()), so a rename there shows in the panel too (F7, R23).
// When the settings cannot be read at all, the client's config (programNameOf(), ../program-name.ts). The address
// «/reporte-bernal» is a route and stays. Server code only (it reads the whole config, which the browser never needs):
// each panel page reads the name once and passes it down where a client component shows it (the block editor's new
// video block).

/** The program's name from the client's config alone (the demo seed and a page that cannot read the settings). */
export function configProgramLabel(cfg: ClientConfig = getClientConfig()): string {
  return programNameOf(cfg);
}

/** The program's name as the public site shows it right now. */
export async function programLabel(): Promise<string> {
  try {
    const site = await getSite();
    return navLabel(site, PROGRAM_PATH, '').trim() || site.programName?.trim() || configProgramLabel();
  } catch {
    return configProgramLabel();
  }
}

/** A section's name in the panel: the program's is `program` (read with programLabel()); the others, as kinds.ts says. */
export function sectionLabel(s: Pick<KindSection, 'kind' | 'label'>, program: string): string {
  return s.kind === 'episode' ? program : s.label;
}
