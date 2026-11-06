import type { RequestType } from '../participation/input';

// The website's links to citizen participation (the pages under /atencion are the citizen flow's; the website only
// points at them). The form reads `tipo` to start on a kind of request and `sobre` («news:<slug>», «project:<slug>»)
// to link the request to a piece of content (design §4). Pure.

export const ATTENTION = {
  home: '/atencion',
  newRequest: '/atencion/nueva',
  lookup: '/atencion/consultar',
  attended: '/atencion/atendido',
} as const;

/** The form, starting on a kind of request when one is given. */
export function newRequestHref(type?: RequestType): string {
  return type ? `${ATTENTION.newRequest}?tipo=${type}` : ATTENTION.newRequest;
}

/** «Hacer un reporte»: the form on a report. */
export const REPORT_HREF = newRequestHref('reporte');

/** A request about a news item or a project («Comentar esta noticia», «Hacer una observación sobre esta obra»). */
export function aboutHref(kind: 'news' | 'project', slug: string): string {
  return `${ATTENTION.newRequest}?sobre=${kind}:${slug}`;
}

/** Whether a link leaves the site (it then opens with rel="noopener noreferrer"). */
export function isExternal(href: string): boolean {
  return !href.startsWith('/');
}
