// The shapes of the help content (R3, D-42): one source in src/lib/guides for the role guides (job description, step
// by step, every screen), the flows between roles, the tutorials, the pages under /ayuda, 360's section cards and the
// generated docs (docs/GUIA-POR-ROL.md, docs/FLUJOS.md, docs/GUIA-ADMINISTRACION.md). Data only: no React, no database.
import type { TeamRole } from '../roles';
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

// 'mes-redes' (R4): «El mes de Redes», written by WP-E.
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

// Administración's own guide (D-43): apart from the team's guides, only for admin (/ayuda/administracion).
export type AdminGuide = {
  mission: string;
  sections: { screen?: string; title: string; what: string; youDo: string[]; cannot?: string[] }[];
  notes: string[]; // «Mensajes no es para administración…», «El rol de jefe no se da desde Equipo…»
  faq: { q: string; a: string }[];
};
