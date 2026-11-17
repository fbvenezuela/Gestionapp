// The scope of the web's and Atención's guide data (WF-C, design §4(d)): what each section and flow tells the boss and
// Administración, and what 360 answers them from it, agrees with what the code lets each one do. The law is read from
// the code, never copied here: the database's gates (the can_* functions and the desk's own functions, their last
// definition in supabase/migrations), the desk's flags (deskAccess(), typesFor()), the menu (navFor()) and each page's
// requireRole (SCREENS, canOpen()). A team role never gets anything of the web, and the web's and the desk's own roles
// get no guide and no 360 (D-93). A section that drifts from the code fails here, not in front of the boss.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCREENS, canOpen, screenFor } from '@/lib/assistant/screens';
import { deskAccess, typesFor, type DeskAccess } from '@/lib/domain/attention';
import { ROLES, STAFF_ROLES, TEAM_ROLES, WEB_ROLES, navFor, type Role } from '@/lib/roles';
import { ADMIN_GUIDE, guideFor } from '@/lib/guides';
import { concreteDateTime, hasPhone, hasReceiptCode } from '@/lib/guides/check';
import type { Audience, RoleText, WebFlow, WebSection } from '@/lib/guides/types';
import { PANEL_SCREENS, UNFILLED_HUECO, roleTextFor, webFlows, webGuideRows, webSections, webSectionsFor } from '@/lib/guides/web';

const AUD: Audience[] = ['boss', 'admin'];
const ALL: (WebSection | WebFlow)[] = [...webSections(), ...webFlows()];
function byId(id: string): WebSection | WebFlow {
  const x = ALL.find((s) => s.id === id);
  if (!x) throw new Error(`no hay sección ni flujo «${id}»`);
  return x;
}
const where = (x: WebSection | WebFlow) => `${x.pdf} ${x.id}`;

// ── The law, read from the code ──────────────────────────────────────────────────────────────────────────────────────

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');
const SQL = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));

/** The body of a function's last definition in the migrations (a later migration can redefine it). */
function sqlBody(name: string): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'g');
  let body: string | null = null;
  for (const sql of SQL) for (const m of sql.matchAll(re)) body = m[1];
  if (body === null) throw new Error(`no hay public.${name}() en las migraciones`);
  return body;
}

/** The roles a gate names (has_role('x'), has_any_role(array['x', 'y'])), with those of the gates it calls. */
function gateRoles(name: string, seen = new Set<string>()): Set<string> {
  seen.add(name);
  const body = sqlBody(name);
  const out = new Set<string>();
  for (const m of body.matchAll(/has_role\('([a-z_]+)'\)/g)) out.add(m[1]);
  for (const m of body.matchAll(/has_any_role\(\s*array\[([^\]]*)\]/g)) for (const r of m[1].matchAll(/'([a-z_]+)'/g)) out.add(r[1]);
  for (const m of body.matchAll(/public\.(can_[a-z_]+)\(/g)) if (!seen.has(m[1])) for (const r of gateRoles(m[1], seen)) out.add(r);
  return out;
}

type Can = (a: Audience) => boolean;
const GATES = {
  editWeb: 'can_edit_web', // drafts and the web's library
  publishWeb: 'can_publish_web', // publish, schedule, archive, restore
  readWeb: 'can_read_web',
  manageSite: 'can_manage_site', // the site's settings and the redirects
  catalogs: 'can_manage_catalogs', // the desk's areas, their people, the categories' defaults
  readCases: 'can_read_request',
  workCases: 'can_work_request', // reply, notes, states, evidence, the contact
  steerCases: 'can_steer_request', // area, priority, due date, moderation
  answer: 'can_answer_requests',
  merge: 'merge_request',
  spam: 'mark_request_spam',
  publishAttended: 'publish_attended',
} as const;
const gate = (name: string): Can => {
  const roles = gateRoles(name);
  return (a) => roles.has(a);
};
const desk = (k: keyof DeskAccess): Can => (a) => deskAccess([a])[k] === true;
const CAN = {
  ...(Object.fromEntries(Object.entries(GATES).map(([k, fn]) => [k, gate(fn)])) as Record<keyof typeof GATES, Can>),
  denuncias: (a) => typesFor([a]).includes('denuncia'),
  stats: desk('stats'),
  exports: desk('exports'),
  seesAreas: desk('seesAreas'),
  auditLog: desk('auditLog'),
  // Giving roles: «Ajustes» → «Equipo» (its page's requireRole).
  team: (a) => canOpen('/ajustes/equipo', [a]),
  // What anyone does on the public web, without an account (the boss and Administración too, as anyone).
  anyone: () => true,
  // The trial's quick entry: whoever tries the trial, with no role.
  trial: () => true,
} satisfies Record<string, Can>;
type Cap = keyof typeof CAN;

// What each section or flow is about. `read`: what its audience must be able to see (who cannot is out of it, or is told
// «No: …»). `do`: what its tasks do (who reads it and cannot do it is told «No: …», and a task says who does it when not
// everyone who reads it does). Every section with tasks and every section nobody reads is here.
const SCOPE: Record<string, { read?: Cap; do?: Cap }> = {
  // Part 1, the public pages: anyone reads them; changing them is the web's content or the site's settings.
  'la-web': { do: 'manageSite' },
  inicio: { do: 'editWeb' },
  'el-gobernador': { do: 'editWeb' },
  'gestion-y-obras': { do: 'editWeb' },
  noticias: { do: 'editWeb' },
  programa: { do: 'editWeb' },
  'atencion-ciudadana': { do: 'editWeb' },
  transparencia: { do: 'editWeb' },
  canales: { do: 'manageSite' },
  'paginas-legales': { do: 'editWeb' },
  // Part 2, the citizen's journey (a person without an account), and part 7's trial.
  'hacer-un-reporte': { do: 'anyone' },
  'apoyar-un-reporte': { do: 'anyone' },
  consultar: { do: 'anyone' },
  'agregar-informacion': { do: 'anyone' },
  'hacer-una-denuncia': { do: 'anyone' },
  'entrar-con-un-toque': { do: 'trial' },
  // Part 3.
  'editar-en-5-pasos': { read: 'readWeb', do: 'editWeb' },
  'atender-en-5-pasos': { do: 'workCases' },
  // Part 4, the web's panel.
  'manual-web': { read: 'readWeb' },
  'web-quien-hace-que': { read: 'readWeb', do: 'team' },
  'pantalla-la-web': { read: 'readWeb', do: 'editWeb' },
  'listas-y-etiquetas': { read: 'readWeb' },
  'crear-contenido': { read: 'readWeb', do: 'editWeb' },
  editor: { read: 'readWeb', do: 'editWeb' },
  'bloques-y-formato': { read: 'readWeb', do: 'editWeb' },
  'vista-previa': { read: 'readWeb' },
  aprobar: { read: 'readWeb', do: 'publishWeb' },
  programar: { read: 'readWeb', do: 'publishWeb' },
  archivar: { read: 'readWeb', do: 'publishWeb' },
  versiones: { read: 'readWeb', do: 'publishWeb' },
  biblioteca: { read: 'readWeb', do: 'editWeb' },
  'ajustes-del-sitio': { read: 'manageSite', do: 'manageSite' },
  redirecciones: { read: 'manageSite', do: 'manageSite' },
  'contenido-traido': { read: 'readWeb', do: 'editWeb' },
  'si-algo-sale-mal': { read: 'readWeb' },
  // Part 5, the desk.
  'atencion-quien-ve-y-hace': { do: 'team' },
  'seis-tipos': { read: 'readCases' },
  'bandeja-y-tablero': { read: 'readCases', do: 'workCases' },
  'buscar-y-filtrar': { read: 'readCases', do: 'readCases' },
  'un-caso': { read: 'readCases', do: 'workCases' },
  estados: { read: 'readCases', do: 'workCases' },
  asignar: { read: 'readCases', do: 'steerCases' },
  escribir: { read: 'readCases', do: 'answer' },
  contacto: { read: 'workCases' },
  'archivos-y-evidencias': { read: 'readCases', do: 'workCases' },
  'casos-iguales': { read: 'readCases', do: 'merge' },
  'casos-atendidos': { read: 'readCases', do: 'publishAttended' },
  denuncias: { read: 'denuncias' },
  'avisos-de-casos': { read: 'readCases' },
  cifras: { read: 'stats' },
  exportar: { read: 'exports' },
  moderacion: { read: 'readCases', do: 'spam' },
  'lo-que-nunca-se-promete': { read: 'readCases' },
  'areas-y-plazos': { read: 'seesAreas', do: 'catalogs' },
  mapa: { read: 'readCases' },
  registro: { read: 'auditLog' },
  // Part 6, the flows.
  'flujo-web-denuncia': { read: 'denuncias' },
  'flujo-web-caso': { read: 'readCases', do: 'workCases' },
  'flujo-web-estados': { read: 'readCases' },
  'flujo-web-desvios': { read: 'readCases' },
  'flujo-web-iguales': { read: 'readCases', do: 'merge' },
  'flujo-web-spam': { read: 'readCases', do: 'spam' },
  'flujo-web-correos': { read: 'readCases' },
  'flujo-web-atendidos': { read: 'readCases', do: 'publishAttended' },
  'flujo-web-avisos': { read: 'readCases' },
  'flujo-web-contenido': { read: 'readWeb', do: 'editWeb' },
  'flujo-web-decidir': { read: 'readWeb', do: 'publishWeb' },
  'flujo-web-arreglar': { read: 'readWeb', do: 'publishWeb' },
  'flujo-web-fotos': { read: 'readWeb', do: 'editWeb' },
  'flujo-web-ajustes': { read: 'manageSite', do: 'manageSite' },
  'flujo-web-redirecciones': { read: 'manageSite', do: 'manageSite' },
};

const roleTexts = (t: RoleText | undefined): string[] => (t === undefined ? [] : typeof t === 'string' ? [t] : Object.values(t).filter((x): x is string => typeof x === 'string'));
const roleKeys = (t: RoleText | undefined): string[] => (t && typeof t === 'object' ? Object.keys(t) : []);

describe('la ley sale del código', () => {
  it('cada puerta de la base nombra sus roles, y las banderas de la atención dicen lo mismo que la base para el jefe y administración', () => {
    for (const fn of Object.values(GATES)) expect(gateRoles(fn).size, fn).toBeGreaterThan(0);
    for (const a of AUD) {
      expect(desk('readsCases')(a), `${a}: leer casos`).toBe(CAN.readCases(a));
      expect(desk('works')(a), `${a}: trabajar casos`).toBe(CAN.workCases(a));
      expect(desk('catalogs')(a), `${a}: áreas y plazos`).toBe(CAN.catalogs(a));
    }
  });

  it('cada sección del mapa existe, y está ahí toda sección con pasos a paso y toda sección que nadie lee', () => {
    for (const id of Object.keys(SCOPE)) byId(id);
    for (const x of ALL) {
      if (x.tasks?.length) expect(SCOPE[x.id]?.do, `${where(x)}: tiene pasos a paso; dile al mapa qué hacen`).toBeDefined();
      if (!x.audience.length) expect(SCOPE[x.id]?.read, `${where(x)}: nadie la lee; dile al mapa qué no se ve`).toBeDefined();
    }
  });
});

describe('cada sección dice lo que cada uno puede, según el código', () => {
  it('quien no puede ver lo de una sección no la lee, o se le dice «No: …»; quien puede, la lee', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      const read = SCOPE[x.id]?.read;
      if (!read) continue;
      for (const a of AUD) {
        const reads = x.audience.includes(a);
        if (CAN[read](a) && !reads) bad.push(`${where(x)}: ${a} puede (${read}) y no la lee`);
        if (!CAN[read](a) && reads && !x.cannot?.[a]?.length) bad.push(`${where(x)}: ${a} no puede (${read}): falta su «No: …»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('quien la lee y no puede hacer lo que enseña tiene su «No: …»', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      const does = SCOPE[x.id]?.do;
      if (!does) continue;
      for (const a of x.audience) if (!CAN[does](a) && !x.cannot?.[a]?.length) bad.push(`${where(x)}: ${a} no puede (${does}): falta su «No: …»`);
    }
    expect(bad).toEqual([]);
  });

  it('lo que nadie lee (un contacto, una denuncia, exportar) solo tiene su «No: …», para los dos', () => {
    const bad: string[] = [];
    for (const x of ALL.filter((s) => !s.audience.length)) {
      for (const k of ['what', 'items', 'tasks', 'rules', 'faq', 'easy', 'example', 'why', 'screen'] as const) if (x[k] !== undefined) bad.push(`${where(x)}: ${k}`);
      for (const a of AUD) if (!x.cannot?.[a]?.length) bad.push(`${where(x)}: falta el «No: …» de ${a}`);
    }
    expect(bad).toEqual([]);
  });

  it('cada paso a paso dice quién lo hace: todos los que leen la sección, los que dice su público, o su título lo dice', () => {
    const WHO = /\((?:lo hacen? [^)]+|lo que hace la persona)\)$/;
    const bad: string[] = [];
    for (const x of ALL) {
      const does = SCOPE[x.id]?.do;
      for (const t of x.tasks ?? []) {
        if (t.audience) {
          if (!t.audience.length || t.audience.some((a) => !x.audience.includes(a))) bad.push(`${where(x)} ${t.id}: su público no es de la sección`);
          if (t.audience.length === x.audience.length) bad.push(`${where(x)} ${t.id}: su público es el de la sección: sobra`);
        }
        if (!does) continue;
        const doers = x.audience.filter((a) => CAN[does](a));
        if (t.audience) {
          if (t.audience.join() !== doers.join()) bad.push(`${where(x)} ${t.id}: lo hacen [${doers}] (${does}), no [${t.audience}]`);
        } else if (doers.length !== x.audience.length) {
          if (doers.length) bad.push(`${where(x)} ${t.id}: solo lo hacen [${doers}] (${does}): ponle su público`);
          else if (!WHO.test(t.title)) bad.push(`${where(x)} ${t.id}: nadie que la lee lo hace (${does}): el título dice quién («(lo hace …)»)`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('ningún texto le dice a alguien que hace lo que el código no le deja («tú publicas», «lo apruebas»…)', () => {
    // A second-person verb, never right after «no», «ni», «nunca» or «tampoco» (with a pronoun between, too).
    const NOT_AFTER = String.raw`(?<!\b(?:no|ni|nunca|tampoco|jamás)\s+(?:(?:lo|la|los|las|le|les|te|se|me)\s+)?)`;
    const says = (verbs: string) => new RegExp(`${NOT_AFTER}\\b(?:${verbs})\\b`, 'i');
    const CLAIMS: { cap: Cap; re: RegExp }[] = [
      { cap: 'publishWeb', re: says('publicas|apruebas|devuelves|archivas') },
      // «programas», but not the noun («los programas»).
      { cap: 'publishWeb', re: new RegExp(`${NOT_AFTER}(?<!\\b(?:los|unos|sus|tus|esos|estos)\\s)\\bprogramas\\b`, 'i') },
      { cap: 'editWeb', re: says('escribes|editas|redactas|subes') },
      { cap: 'answer', re: says('respondes|contestas|atiendes') },
      { cap: 'steerCases', re: says('asignas|reasignas|priorizas|moderas') },
      { cap: 'merge', re: says('unes') },
      { cap: 'exports', re: says('exportas') },
      { cap: 'catalogs', re: says('armas') },
      { cap: 'team', re: says('invitas|das (?:el|los|un|una|sus) roles?') },
      { cap: 'readCases', re: says('(?:lees|ves) (?:los|las) (?:casos|solicitudes)') },
      { cap: 'workCases', re: says('ves (?:el|los|sus) contactos?') },
      { cap: 'denuncias', re: says('(?:lees|ves) las denuncias') },
    ];
    // What the screen says («Qué cambia si lo publicas») is the screen's, not a claim: out, the innermost first.
    const ownWords = (t: string) => {
      let s = t;
      for (let prev = ''; prev !== s; ) [prev, s] = [s, s.replace(/«[^«»]*»/g, '«»')];
      return s;
    };
    const bad: string[] = [];
    for (const x of ALL) {
      for (const a of x.audience) {
        const texts = [
          roleTextFor(x.what, a),
          ...(x.items ?? []).map((t) => roleTextFor(t, a)),
          ...(x.faq ?? []).map((f) => roleTextFor(f.a, a)),
          roleTextFor(x.easy, a),
          roleTextFor(x.example, a),
          ...(x.rules ?? []),
          x.why,
        ].filter((t): t is string => !!t);
        for (const t of texts) for (const c of CLAIMS) if (!CAN[c.cap](a) && c.re.test(ownWords(t))) bad.push(`${where(x)} (${a}, ${c.cap}): ${t}`);
      }
    }
    expect(bad).toEqual([]);
    // The check itself catches a claim, and lets a «no» and a label pass.
    const publishes = CLAIMS.filter((c) => c.cap === 'publishWeb');
    expect(publishes.some((c) => c.re.test('Tú publicas lo aprobado.'))).toBe(true);
    expect(publishes.some((c) => c.re.test(ownWords('Tú no lo publicas; miras «Qué cambia si lo publicas».')))).toBe(false);
  });

  it('cada «¿puedo…?» empieza con «No:», y cada texto por rol es de alguien que lee la sección', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      for (const [a, list] of Object.entries(x.cannot ?? {})) {
        if (!AUD.includes(a as Audience)) bad.push(`${where(x)}: «No: …» de ${a}`);
        for (const c of list ?? []) if (!/^No: \S/.test(c)) bad.push(`${where(x)} (${a}): ${c}`);
      }
      const own = [x.what, ...(x.items ?? []), ...(x.faq ?? []).map((f) => f.a), x.easy, x.example];
      for (const t of own) for (const k of roleKeys(t)) if (k !== 'default' && !x.audience.includes(k as Audience)) bad.push(`${where(x)}: un texto para ${k}, que no la lee: ${roleTexts(t).join(' | ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('cada pantalla de una sección es una pantalla del panel, sin [id], que abre cada uno de su público', () => {
    const bad: string[] = [];
    for (const x of ALL) {
      if (!x.screen) continue;
      if (x.screen.includes('[') || screenFor(x.screen)?.href !== x.screen) bad.push(`${where(x)}: ${x.screen} no es una pantalla de SCREENS`);
      else for (const a of x.audience) if (!canOpen(x.screen, [a])) bad.push(`${where(x)}: ${a} no abre ${x.screen}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('«Web» y «Atención» en las guías del jefe y de administración (APP-42)', () => {
  const panel = (href: string) => /^\/admin\/(?:web|atencion)(?:\/|$)/.test(href);

  it('cada pantalla de «Web» y «Atención» que abre cada uno tiene su sección en su guía, y ninguna más', () => {
    for (const a of AUD) {
      const want = SCREENS.filter((s) => panel(s.href) && !s.href.includes('[') && canOpen(s.href, [a])).map((s) => s.href);
      const have = PANEL_SCREENS.filter((p) => p.audience.includes(a)).map((p) => p.screen);
      expect([...have].sort(), a).toEqual([...want].sort());
    }
    for (const p of PANEL_SCREENS) {
      expect(p.audience, p.screen).toEqual(AUD.filter((a) => canOpen(p.screen, [a])));
      for (const a of p.audience) expect(byId(p.section).audience, `${p.screen}: ${p.section}`).toContain(a);
    }
    expect(new Set(PANEL_SCREENS.map((p) => p.screen)).size).toBe(PANEL_SCREENS.length);
    const bossScreens = guideFor('boss').sections.map((s) => s.screen);
    for (const s of webSectionsFor('boss')) expect(bossScreens, s.screen).toContain(s.screen);
    const adminScreens = ADMIN_GUIDE.sections.map((s) => s.screen);
    for (const s of webSectionsFor('admin')) expect(adminScreens, s.screen).toContain(s.screen);
  });

  it('lo que dicen esas secciones sale de la guía de la web, sin huecos, fechas, horas, teléfonos ni códigos', () => {
    for (const a of AUD) {
      for (const s of webSectionsFor(a)) {
        expect(s.youDo.length, s.screen).toBeGreaterThan(0);
        for (const t of [s.what, ...s.youDo]) {
          expect(UNFILLED_HUECO.test(t), t).toBe(false);
          expect(hasReceiptCode(t) || hasPhone(t) || concreteDateTime(t), t).toBe(false);
        }
        const x = byId(PANEL_SCREENS.find((p) => p.screen === s.screen)!.section);
        expect(s.what).toBe(roleTextFor(x.what, a));
      }
    }
  });

  it('el menú: el «Web» del jefe abre «La web» y el de administración, «Ajustes del sitio», como lo dicen sus textos', () => {
    const menu = (r: Role, label: string) => navFor([r]).visible.find((n) => n.label === label)?.href;
    expect(menu('boss', 'Web')).toBe('/admin/web');
    const adminWeb = menu('admin', 'Web');
    expect(adminWeb).toBeDefined();
    if (adminWeb === '/admin/web/ajustes') expect(roleTextFor(byId('pantalla-la-web').what, 'admin')).toMatch(/«Web» abre directo «Ajustes del sitio»/);
    else expect(roleTextFor(byId('pantalla-la-web').what, 'admin')).not.toMatch(/abre directo/);
    expect(menu('boss', 'Atención')).toBe('/admin/atencion');
    expect(menu('admin', 'Atención')).toBe('/admin/atencion');
    // Administración's «Atención» does not open the inbox (it reads no case), and its text says so.
    expect(roleTextFor(byId('bandeja-y-tablero').what, 'admin')).toMatch(deskAccess(['admin']).readsCases ? /bandeja/ : /no abre la bandeja/);
  });
});

describe('nada de la web para el equipo, ni guía ni 360 para los roles de la web', () => {
  it('ningún rol del equipo fuera del jefe abre una pantalla de «Web» o «Atención», ni tiene sus guías o una sección de ellas', () => {
    const others = TEAM_ROLES.filter((r) => r !== 'boss');
    const web = SCREENS.filter((s) => /^\/(?:admin\/(?:web|atencion)|ayuda\/(?:web|atencion))(?:\/|$)/.test(s.href));
    expect(web.length).toBeGreaterThan(0);
    for (const r of others) {
      for (const s of web) expect(canOpen(s.href, [r]), `${r}: ${s.href}`).toBe(false);
      expect(webGuideRows([r]), r).toEqual([]);
      for (const s of guideFor(r).sections) expect(/^\/(?:admin|ayuda\/(?:web|atencion))(?:\/|$)/.test(s.screen), `${r}: ${s.screen}`).toBe(false);
    }
  });

  it('los roles de la web y de la atención no son del equipo: sin guía por rol, sin las guías de la web y sin 360', () => {
    for (const r of WEB_ROLES) {
      expect((TEAM_ROLES as readonly Role[]).includes(r), r).toBe(false);
      expect((STAFF_ROLES as readonly Role[]).includes(r), r).toBe(false);
      expect(webGuideRows([r]), r).toEqual([]);
    }
    // Every role is one of: the team (with its guide), Administración, the web's and the desk's, or retired.
    for (const r of ROLES) if (!(TEAM_ROLES as readonly Role[]).includes(r) && r !== 'admin' && !(WEB_ROLES as readonly Role[]).includes(r)) expect(webGuideRows([r]), r).toEqual([]);
  });
});
