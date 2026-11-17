// The client's words in the web's and Atención's guide (WF-C): the docs and «Ayuda y guías» name the weekly program,
// the weekly paper, the official site and the organization, but src never does (the repository is public, §11.6): the
// data writes huecos and these fill them from config/clients/<brand>.json, the same words the public site uses: the
// program's name is the label of its page in the site's menu (programNameOf, as the program's own page says it), the
// paper's is the brand's «weeklyName», the official site's address is «realSite.source» and the organization's name is
// the one the citizen's receipt prints («Comprobante · Atención ciudadana · …», structuredData.organizationName).
// Whatever prints a web text fills it first.
import { getClientConfig, type ClientConfig } from '../../client-config';
import { programNameOf } from '../../web/program-name';

export type ClientWords = { program: string; weekly: string; officialSite: string; organization: string };

/** The huecos the web's guide writes instead of the client's words. */
export const CLIENT_HUECOS: Record<keyof ClientWords, string> = {
  program: '[PROGRAMA]',
  weekly: '[SEMANARIO]',
  officialSite: '[WEB_OFICIAL]',
  organization: '[ORGANIZACION]',
};

/** This client's words, from its config. */
export function clientWords(cfg: ClientConfig = getClientConfig()): ClientWords {
  return { program: programNameOf(cfg), weekly: cfg.brand.weeklyName, officialSite: cfg.web.realSite.source, organization: cfg.web.structuredData.organizationName };
}

/** A web text with the client's words in place of its huecos. */
export function fillClientWords(text: string, w: ClientWords): string {
  let out = text;
  for (const k of Object.keys(CLIENT_HUECOS) as (keyof ClientWords)[]) out = out.replaceAll(CLIENT_HUECOS[k], w[k]);
  return out;
}

/** Any hueco left in a text (a text printed without its words filled). */
export const UNFILLED_HUECO = /\[(?:PROGRAMA|SEMANARIO|WEB_OFICIAL|ORGANIZACION)\]/;
