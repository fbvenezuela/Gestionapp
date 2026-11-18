// The shapes of the help content (R3, D-42): one source in src/lib/guides for the role guides (job description, step
// by step, every screen), the flows between roles, the tutorials, the pages under /ayuda, 360's section cards and the
// generated docs (docs/GUIA-POR-ROL.md, docs/FLUJOS.md, docs/GUIA-ADMINISTRACION.md). Data only: no React, no database.
import type { Role, TeamRole } from '../roles';
import type { STABLE_TARGETS, TOUR_ANCHORS } from './anchors';

// ── Tutorials (design §6.1) ─────────────────────────────────────────────────────────────────────────────────────────

export type TourAnchor = (typeof TOUR_ANCHORS)[number];
export type StableTarget = (typeof STABLE_TARGETS)[number];

// A step that says something different per role carries one text per role (U3); otherwise one string.
export type TourText = string | Partial<Record<TeamRole, string>>;

export type TourStep = {
  // Selectors in order of preference: '[data-tour="x"]' (anchor('x')), or a stable one ('#approve-title',
  // 'nav[aria-label="Menú"]'). The first visible one is used; with none visible the step is not counted.
  target: string[];
  title: string; // ≤ 40 letters
  body: TourText; // ≤ 140 letters each, one or two sentences, no concrete dates and no demo data; never «toca» as an order
  placement?: 'auto' | 'center';
};

export type Tour = {
  id: string; // ^[a-z0-9-]{1,40}$
  // A SCREENS pattern ('/hoy', '/eventos/[id]'), with an optional tab ('/eventos/[id]?tab=storyboard'), or HOME_SCREEN
  // ('@home': the person's own home, homeFor(roles)).
  screen: string;
  roles: TeamRole[]; // who it is offered to; the screen must also open for them (canOpen)
  title: string; // «Cómo se usa Publicar»
  steps: TourStep[]; // 2..6
  // Only `bienvenida`: the tutorial it chains to at the end («Seguir»). In tours.ts it is HOME_NEXT ('@home');
  // toursForRoles() turns it into the id of the person's home tutorial (or drops it when there is none).
  next?: string;
  form?: boolean; // a form screen: 360 does not offer it (D-47)
};

// ── Flows between roles (design §7.4, D-44) ─────────────────────────────────────────────────────────────────────────

// 'mes-redes' (R4, D-77): «El mes de Redes».
export type FlowId = 'evento' | 'obra' | 'comunitario' | 'tweets' | 'aprobacion' | 'entrega' | 'mensajes' | 'ayuda' | 'mes-redes';

// One way out of a decision («Sí → …», «No, pide cambios → …»). `to` is the id of the step it goes to (a later one,
// or an earlier one when it goes back); without `to` the branch ends there (its text says how).
export type FlowBranch = { label: string; text: string; to?: string };

export type FlowStep = {
  id: string; // unique inside the flow: the Mermaid node and the branches' `to`
  roles: TeamRole[]; // who does it («Jefe o Despacho»); the reader's own steps say «tú»
  text: string; // the action, with the screen's labels in «»
  href?: string; // a screen of SCREENS; the app shows «Abrir» only when the reader can open it (canOpen)
  question?: string; // a decision step: «¿Va a la agenda del jefe?», answered by `branches`
  branches?: FlowBranch[];
  // The next part of this work is another flow («La aprobación, con el semáforo.» goes on in «El semáforo»): the app
  // links to it and the docs write it as a link.
  see?: FlowId;
};

export type Flow = {
  id: FlowId;
  title: string; // «Un evento, de la agenda a la publicación»
  roles: TeamRole[]; // the roles it touches
  steps: FlowStep[]; // in order; without branches a step goes on to the next one
};

// ── Role guides (design §7.2) ───────────────────────────────────────────────────────────────────────────────────────

// «Paso a paso»: one task of the role.
export type Task = { id: string; title: string; when: string; steps: string[]; flow?: FlowId; tour?: string };

// «Cada pantalla»: what one screen is for, for this role. Grouped by `menu` («Inicio», «Más → Obras»).
export type SectionGuide = {
  screen: string; // a SCREENS href (or pattern) that canOpen(screen, [role])
  menu: string;
  title: string;
  what: string; // «Para qué es»
  youDo: string[]; // «Qué haces aquí»
  cannot?: string[]; // «No puedes»
  tour?: string; // the id of its tutorial, if it has one
};

export type RoleGuide = {
  role: TeamRole;
  slug: string; // 'redes' (/ayuda/redes)
  label: string; // 'Redes'
  account: { home: string; menu: string[]; phoneBar: string[]; more: string[]; create: string[]; twoFactor: boolean };
  // «Tu trabajo»: the job description, what it is and what it should be.
  job: { mission: string; responsibilities: string[]; never: string[]; worksWith: { role: TeamRole; what: string }[]; rhythm: string[] };
  day: string[]; // «Tu día», in order
  tasks: Task[];
  sections: SectionGuide[];
  flows: FlowId[];
  faq: { q: string; a: string }[];
};

// «Para todos» (shared.ts): signing in, the top bar, the phone, no signal, the date rule, Mensajes, 360, Ayuda.
export type SharedTopic = { id: string; title: string; body: string[] };

// «Palabras de la app» (glossary.ts): a word a new person does not know, as the team uses it. `term` is how the guide
// writes it («Reel y Short»), `aka` the words people ask with (lower case, singular and plural, as they say them: «el
// texto de abajo», «la cuadrícula»), `text` what it means.
// «Palabras de la web» and «Palabras de la atención» (web/glossary.ts, WF-C): the same for the web's and Atención's
// words, only for the boss and Administración. `page`: the page of «Ayuda y guías» that lists it, and its domain in 360;
// `section`: the section of the web's guide that explains it (360 goes on from there); `shared`: the names of `aka` the
// team also uses for something of its own («Borrador» is a piece's state too, «Vencidas» the fichas of the municipios),
// which mean this word only with the web's or Atención's words or on their screens.
// What 360 says when asked to explain the word (design §4(c)): `easy`, the same said more simply; `example`, a made-up
// case with the screen's labels (no dates, hours, names, phones or codes); `why`, only where the guide gives a reason.
// One text, or one per role (`default` for the rest).
export type GlossaryText = string | (Partial<Record<Role, string>> & { default?: string });
export type GlossaryTerm = {
  id: string;
  term: string;
  aka: string[];
  text: string;
  easy?: GlossaryText;
  example?: GlossaryText;
  why?: GlossaryText;
  page?: WebPage;
  section?: string;
  shared?: string[];
};

// Administración's own guide (D-43): apart from the team's guides, only for admin (/ayuda/administracion).
export type AdminGuide = {
  mission: string;
  sections: { screen?: string; title: string; what: string; youDo: string[]; cannot?: string[] }[];
  notes: string[]; // «Mensajes no es para administración…», «El rol de jefe no se da desde Equipo…»
  faq: { q: string; a: string }[];
};

// ── The web and Atención guides (WF-C, design §4(a)) ────────────────────────────────────────────────────────────────
// The four hand-written docs of the public web and the attention desk (docs/GUIA-WEB.md, MANUAL-ADMIN-WEB.md,
// MANUAL-ATENCION.md, FLUJOS-WEB.md), ported 1:1 to src/lib/guides/web/: one source for the docs
// (src/lib/guides/render-web-md.ts writes them back), «Ayuda y guías» (/ayuda/web, /ayuda/atencion) and 360.

/** Who in the panel reads the web's and Atención's guide: the boss and Administración. The web's and the desk's own
 * roles (WEB_ROLES) get no guides, no tutorials and no 360. */
export type Audience = 'boss' | 'admin';

/** One text for both, or one per audience («Tú publicas…» for the boss, «No: eso lo hace…» for Administración);
 * `default` is for whoever has no text of their own. */
export type RoleText = string | Partial<Record<Audience | 'default', string>>;

/** The length of each line the doc prints for one text (client words filled), kept only where the doc's hard wrap is
 * not the greedy one at its width. Only render-web-md.ts reads it; whoever changes a text drops its wrap. */
export type Wrap = number[];

/** A block of a section, word for word as the doc prints it. Each text is one line, with the screen's labels in «»
 * (exact), `**bold**` and `` `code` `` inline, and the client's words as huecos ([PROGRAMA], [SEMANARIO], [WEB_OFICIAL],
 * [ORGANIZACION]: fillClientWords() in src/lib/guides/web/words.ts). `wrap` is keyed by the item's or paragraph's index. */
export type WebBlock =
  | { kind: 'p'; text: string; wrap?: Wrap }
  | { kind: 'list'; items: string[]; wrap?: Record<number, Wrap> } // «- …»
  | { kind: 'steps'; items: string[]; wrap?: Record<number, Wrap> } // «1. …», numbered from 1
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'note'; paras: string[]; wrap?: Record<number, Wrap> }; // a «> …» box, paragraph by paragraph

/** One task of a web or Atención section, for 360 (like the team's «Paso a paso»). `audience`: who does it, when only
 * one of the section's audiences does (the boss writes and publishes content; Administración gives the roles and arms
 * the desk's areas); absent, whoever reads the section. To the other one 360 says the section's `cannot` for them, never
 * the steps as theirs. */
export type WebTask = { id: string; title: string; when?: string; steps: string[]; audience?: Audience[] };

/** What 360 says of a web or Atención section or flow (design §4(a), (c)): empty in the port, filled in the next round.
 * The texts follow the guides' rules (labels exist, no dates, hours, phones, codes, keys or demo names; «tú»). */
export type WebFacets = {
  screen?: string; // a SCREENS href (/admin/web/aprobar…), once the panel's screens are there
  what?: RoleText; // para qué es
  items?: RoleText[]; // qué ves / qué haces, with the screen's labels in «»
  tasks?: WebTask[];
  cannot?: Partial<Record<Audience, string[]>>; // «¿puedo…?» → «No: …»
  rules?: string[];
  faq?: { q: string; a: RoleText }[];
  easy?: RoleText; // dicho más fácil
  example?: RoleText; // un ejemplo inventado, sin fechas
  why?: string; // por qué es así
};

export type WebSection = WebFacets & {
  id: string; // unique among the web's sections and flows ('aprobar'): its anchor in /ayuda and 360's entry
  pdf: string; // its number in «Guía de la web y sus flujos» ('4.8'); 'N.0' is part N's opening and '0.0' the guide's
  title: string; // the heading's text, without its number
  heading?: { level: 2 | 3; num: string }; // how its doc writes the heading («## 4. …», «### 4.1 …»): the doc's own number
  // To whom 360 explains it: the roles that do it, read it or must know it (design §4(d), the doc's «Quién hace qué»).
  // A role that cannot (Administración and a case, the boss and a contact) is left out: it gets `cannot` instead.
  // «Ayuda y guías» shows every section to both, as the PDF does.
  audience: Audience[];
  blocks: WebBlock[];
};

export type WebFlowNode = { id: string; text: string; shape: 'box' | 'round' | 'decision' };
export type WebFlowEdge = { from: string; to: string; label?: string; dotted?: true };
/** One line of a flow's Mermaid drawing: a node written on its own line, or an edge (`def`: that line also writes its
 * source, its target or both in full). */
export type WebFlowLine = { node: string } | { edge: number; def?: 'from' | 'to' | 'both' };

/** One flow of FLUJOS-WEB: its drawing exactly (nodes with their text and shape, edges with their labels) and what to
 * know about it. */
export type WebFlow = WebFacets & {
  id: string; // the doc's anchor ('flujo-web-envio')
  pdf: string; // '6.1'
  title: string;
  who: string; // the line under the title: who does it, and where («Lo hace cualquier persona…»)
  audience: Audience[];
  nodes: WebFlowNode[]; // in the order the drawing writes them
  edges: WebFlowEdge[]; // in the order the drawing draws them
  know: string[]; // «Qué hay que saber»
  layout?: WebFlowLine[]; // the drawing's line order, only for the doc; without it the renderer draws a default one
};

export type WebDocId = 'guia-web' | 'manual-admin-web' | 'manual-atencion' | 'flujos-web';

export type WebDoc = {
  id: WebDocId;
  file: string; // 'docs/GUIA-WEB.md'
  title: string; // its «# …» line
  date?: string; // its edition («09/11/2026»): printed in bold at the start of its first paragraph, never a section text
  width: number | null; // the column its text wraps at, or null: one line per text
  sections: WebSection[]; // in the doc's order; the first one has no heading (the doc's opening)
  flows?: WebFlow[];
};

/** A part of «Guía de la web y sus flujos», the PDF the managers read: its number, title and opening line. */
export type WebPart = { n: number; title: string; lede: string };

/** The page of «Ayuda y guías» a section or a flow is on: /ayuda/web or /ayuda/atencion. */
export type WebPage = 'web' | 'atencion';
