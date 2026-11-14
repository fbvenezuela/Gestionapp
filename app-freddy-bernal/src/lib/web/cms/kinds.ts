import type { WebKind } from '../schema';

// The sections of the website's administrator (/admin/web, design §3): one per kind of content, with the words the team
// reads and the address of its list (/admin/web/contenido/<section>). Pages are fixed (the home «inicio» and the site's
// own pages): they are edited, never created here (a new page would have no address on the site). Pure. The weekly
// program's section shows the name the public site gives it (sectionLabel(), section-label.ts: the saved menu, else the
// config): here, only a neutral one.

export type KindSection = {
  kind: WebKind;
  /** The list's address piece. */
  section: string;
  /** The list's title (the panel says it with sectionLabel()). */
  label: string;
  /** «una noticia», «un aviso»: for sentences. */
  one: string;
  /** The «Nuevo» button, or null when this kind is not created from the administrator. */
  create: string | null;
  /** What goes here, in one line. */
  hint: string;
  /** Whether it has a page of its own on the site (then it has a slug that matters and search-engine fields). */
  ownPage: boolean;
};

export const KIND_SECTIONS: readonly KindSection[] = [
  { kind: 'page', section: 'paginas', label: 'Páginas', one: 'una página', create: null, hint: 'La portada (por bloques) y las páginas fijas: el gobernador y las legales.', ownPage: true },
  { kind: 'news', section: 'noticias', label: 'Noticias y comunicados', one: 'una noticia', create: 'Nueva noticia', hint: 'Noticias, comunicados, columnas de opinión y entrevistas: salen en «Noticias».', ownPage: true },
  { kind: 'project', section: 'obras', label: 'Obras y acciones', one: 'una obra', create: 'Nueva obra o acción', hint: 'La gestión: dónde, para quién, el estado y las evidencias.', ownPage: true },
  { kind: 'episode', section: 'reporte-bernal', label: 'Programa semanal', one: 'un episodio', create: 'Nuevo episodio', hint: 'Los episodios del programa semanal, con su video y sus temas.', ownPage: false },
  { kind: 'document', section: 'documentos', label: 'Documentos', one: 'un documento', create: 'Nuevo documento', hint: 'Semanarios, informes y documentos en PDF de Transparencia.', ownPage: false },
  { kind: 'notice', section: 'avisos', label: 'Avisos de servicio', one: 'un aviso', create: 'Nuevo aviso', hint: 'Cortes, desvíos y horarios: con fecha de actualización y de vencimiento.', ownPage: false },
  { kind: 'faq', section: 'preguntas', label: 'Preguntas frecuentes', one: 'una pregunta', create: 'Nueva pregunta', hint: 'Las preguntas de Atención ciudadana, de la web y de la gestión.', ownPage: false },
  { kind: 'indicator', section: 'indicadores', label: 'Indicadores', one: 'un indicador', create: 'Nuevo indicador', hint: 'Las cifras de «Gestión en cifras». Solo salen con su fuente.', ownPage: false },
];

const BY_KIND = new Map(KIND_SECTIONS.map((s) => [s.kind, s]));
const BY_SECTION = new Map(KIND_SECTIONS.map((s) => [s.section, s]));

export function sectionOf(kind: WebKind): KindSection {
  return BY_KIND.get(kind)!;
}

export function sectionBySlug(section: string): KindSection | null {
  return BY_SECTION.get(section) ?? null;
}

/** The administrator's addresses. */
export const ADMIN_WEB = {
  home: '/admin/web',
  list: (kind: WebKind) => `/admin/web/contenido/${sectionOf(kind).section}`,
  create: (kind: WebKind) => `/admin/web/contenido/${sectionOf(kind).section}/nuevo`,
  edit: (id: string) => `/admin/web/editar/${id}`,
  versions: (id: string) => `/admin/web/editar/${id}/versiones`,
  review: (id: string) => `/admin/web/revisar/${id}`,
  preview: (id: string, version?: number) => `/admin/web/vista-previa/${id}${version ? `?version=${version}` : ''}`,
  queue: '/admin/web/por-aprobar',
  media: '/admin/web/biblioteca',
  mediaItem: (id: string) => `/admin/web/biblioteca/${id}`,
  upload: '/admin/web/biblioteca/subir',
  settings: '/admin/web/ajustes',
  redirects: '/admin/web/redirecciones',
} as const;
