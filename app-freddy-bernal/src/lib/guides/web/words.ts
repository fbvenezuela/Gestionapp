// The client's words in the web's and Atención's guide (WF-C): the docs and «Ayuda y guías» name the weekly program,
// the weekly paper and the official site, but src never does (the repository is public, §11.6): the data writes huecos
// and these fill them from config/clients/<brand>.json, the same words the public site uses: the program's name is
// the label of its page in the site's menu (programNameOf, as the program's own page says it), the paper's is the
// brand's «weeklyName» and the official site's address is «realSite.source». Whatever prints a web text fills it first.
import { getClientConfig, type ClientConfig } from '../../client-config';
import { programNameOf } from '../../web/program-name';

export type ClientWords = { program: string; weekly: string; officialSite: string };

/** The huecos the web's guide writes instead of the client's words. */
export const CLIENT_HUECOS: Record<keyof ClientWords, string> = { program: '[PROGRAMA]', weekly: '[SEMANARIO]', officialSite: '[WEB_OFICIAL]' };

/** This client's words, from its config. */
export function clientWords(cfg: ClientConfig = getClientConfig()): ClientWords {
  return { program: programNameOf(cfg), weekly: cfg.brand.weeklyName, officialSite: cfg.web.realSite.source };
}

/** A web text with the client's words in place of its huecos. */
export function fillClientWords(text: string, w: ClientWords): string {
  return text.replaceAll(CLIENT_HUECOS.program, w.program).replaceAll(CLIENT_HUECOS.weekly, w.weekly).replaceAll(CLIENT_HUECOS.officialSite, w.officialSite);
}
