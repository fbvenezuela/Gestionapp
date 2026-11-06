// The six roles in the code (cambios del 27/10/2026): the TypeScript lists mirror the database enum, the team is
// exactly six, Administración is apart, the retired roles are gone from every menu, and the demo has a button for
// each role. The web's and the attention desk's six (D-93) have their own screen, home and second factor.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createMemoryDb } from '@/lib/db/pglite';
import {
  ATTENTION_ROLES,
  CREATE_ITEMS,
  FUTURE_ROLES,
  INVITABLE_ROLES,
  MFA_ALWAYS,
  NAV,
  RETIRED_ROLES,
  ROLES,
  ROLE_LABEL,
  STAFF_ROLES,
  TEAM_ROLES,
  WEB_CONTENT_ROLES,
  WEB_ROLES,
  createFor,
  homeFor,
  isInvitableRole,
  isNavActive,
  isStaffRole,
  isTeamRole,
  isWebRole,
  roleGrantProblem,
  ADMIN_WEB_MIX_MESSAGE,
  navFor,
  type Role,
} from '@/lib/roles';
import { canOpen } from '@/lib/assistant/screens';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { getClientConfig } from '@/lib/client-config';

// Real people of the client's team are named only in the docs: never in the code, the seeds, the tests or the config.
// Built from pieces so this file does not match itself. Applied migrations are not scanned (they are never edited).
const REAL_NAMES = new RegExp(`(?<!\\p{L})(?:${['Wil' + 'liam', '[ÁA]n' + 'gel', 'Hil' + 'lary'].join('|')})(?!\\p{L})`, 'iu');
const TEXT_FILE = /\.(?:ts|tsx|mts|mjs|js|json|sql|css)$/;
function textFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? textFiles(p) : TEXT_FILE.test(d.name) ? [p] : [];
  });
}

describe('nombres de personas reales', () => {
  it('no aparecen en el código, los datos de prueba, las pruebas ni la configuración', () => {
    const bad = ['src', 'tests', 'config', 'scripts', 'emails', path.join('supabase', 'shim'), path.join('supabase', 'tests')]
      .flatMap(textFiles)
      .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => ({ f, i: i + 1, l })))
      .filter(({ l }) => REAL_NAMES.test(l))
      .map(({ f, i, l }) => `${f}:${i}: ${l.trim().slice(0, 100)}`);
    expect(bad).toEqual([]);
    // The guard itself works.
    expect('Aprobado por Hil' + 'lary').toMatch(REAL_NAMES);
    expect('Los Ángeles').not.toMatch(REAL_NAMES);
  });
});

describe('los roles del código son los de la base', () => {
  it('ROLES es el enum app_role, en el mismo orden', async () => {
    const { db } = await createMemoryDb();
    const r = await db.query<{ v: string[] }>(`select enum_range(null::public.app_role)::text[] as v`);
    await db.close();
    expect([...ROLES]).toEqual(r.rows[0].v);
  }, 60_000);

  it('el equipo son seis; Administración aparte; ni retirados ni de la fase 3', () => {
    expect([...TEAM_ROLES]).toEqual(['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social']);
    // The team and Administración: who the assistant 360 serves (its cards, scripts and notices).
    expect([...STAFF_ROLES].sort()).toEqual([...TEAM_ROLES, 'admin'].sort());
    // The web and the attention desk (D-93): given by the database since 20261106000100_web_publica.sql and, since the
    // attention desk's admin (W3), from Ajustes → Equipo; never team roles, never the assistant's.
    expect([...WEB_ROLES]).toEqual(['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor']);
    expect([...INVITABLE_ROLES].sort()).toEqual([...STAFF_ROLES, ...WEB_ROLES].sort());
    for (const r of [...RETIRED_ROLES, ...FUTURE_ROLES]) {
      expect(isInvitableRole(r), r).toBe(false);
      expect(isTeamRole(r), r).toBe(false);
    }
    for (const r of WEB_ROLES) {
      expect(isInvitableRole(r), r).toBe(true);
      expect(isTeamRole(r), r).toBe(false);
      expect(isStaffRole(r), r).toBe(false);
    }
    expect(isTeamRole('admin')).toBe(false);
    expect(isInvitableRole('admin')).toBe(true);
    expect([...RETIRED_ROLES, ...FUTURE_ROLES, ...INVITABLE_ROLES].sort()).toEqual([...ROLES].sort());
  });

  it('Administración no comparte cuenta con quien publica la web ni con los roles que leen solicitudes (el editor sí)', () => {
    for (const r of ['web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'] as const) {
      expect(roleGrantProblem({ isSelf: false, roles: ['admin'], role: r }), r).toBe(ADMIN_WEB_MIX_MESSAGE);
      expect(roleGrantProblem({ isSelf: false, roles: [r], role: 'admin' }), r).toBe(ADMIN_WEB_MIX_MESSAGE);
    }
    expect(roleGrantProblem({ isSelf: false, roles: ['admin'], role: 'writer' })).toBeNull();
    expect(roleGrantProblem({ isSelf: false, roles: ['social'], role: 'attention_coordinator' })).toBeNull();
  });

  it('cada valor tiene su nombre en español', () => {
    for (const r of ROLES) expect(ROLE_LABEL[r], r).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(ROLE_LABEL.politics).toBe('Director de política');
    expect(ROLE_LABEL.ivt).toBe('Director del IVT');
  });
});

describe('menús', () => {
  const retired = (rs: readonly Role[]) => rs.filter((r) => (RETIRED_ROLES as readonly string[]).includes(r));

  it('ningún menú ni botón de «Crear» nombra un rol retirado o de la fase 3 (los de la web solo tienen su pantalla)', () => {
    for (const n of NAV) {
      expect(retired(n.roles), n.href).toEqual([]);
      expect(retired(n.mobile ?? []), n.href).toEqual([]);
      // The team and Administración; the web's and the attention desk's roles only in their own two items (D-91).
      for (const r of n.roles) expect(isStaffRole(r) || (isWebRole(r) && n.href.startsWith('/admin/')), `${n.href} ${r}`).toBe(true);
      for (const r of FUTURE_ROLES) expect(n.roles, n.href).not.toContain(r);
    }
    for (const c of CREATE_ITEMS) for (const r of c.roles) expect(isStaffRole(r), `${c.href} ${r}`).toBe(true);
  });

  it('la web y la atención ciudadana (D-91, D-93): su pantalla en el menú y su inicio; el menú del equipo no cambia', () => {
    for (const r of WEB_CONTENT_ROLES) {
      expect(navFor([r]).visible.map((n) => n.href), r).toEqual(['/admin/web']);
      expect(homeFor([r]), r).toBe('/admin/web');
    }
    for (const r of ATTENTION_ROLES) {
      expect(navFor([r]).visible.map((n) => n.href), r).toEqual(['/admin/atencion']);
      expect(navFor([r]).mobile.map((n) => n.label), r).toEqual(['Atención']);
      expect(homeFor([r]), r).toBe('/admin/atencion');
      expect(createFor([r]), r).toEqual([]);
    }
    // Both halves: the requests first (they have due dates); someone of the team keeps the team's home.
    expect(homeFor(['writer', 'attention_coordinator'])).toBe('/admin/atencion');
    expect(navFor(['writer', 'attention_coordinator']).visible.map((n) => n.label)).toEqual(['Web', 'Atención']);
    expect(homeFor(['social', 'writer'])).toBe('/hoy');
    expect(homeFor(['admin', 'writer'])).toBe('/hoy');
    expect(homeFor(['boss', 'web_publisher'])).toBe('/jefe');
    // The team's menus do not change, but the boss's and Administración's: «Web» and «Atención» (D-93), in «Más».
    for (const r of TEAM_ROLES.filter((x) => x !== 'boss')) {
      expect(navFor([r]).visible.some((n) => n.href.startsWith('/admin/')), r).toBe(false);
    }
    for (const r of ['boss', 'admin'] as const) {
      expect(navFor([r]).more.filter((n) => n.href.startsWith('/admin/')).map((n) => n.label), r).toEqual(['Web', 'Atención']);
      expect(navFor([r]).mobile.some((n) => n.href.startsWith('/admin/')), r).toBe(false);
    }
    // Always with the second factor, whatever the editable list says (the database asks the token for it).
    expect([...MFA_ALWAYS].sort()).toEqual([...WEB_ROLES].sort());
  });

  it('el menú del jefe: Inicio, Agenda, Por aprobar, Redes, Obras, Municipios, Digital, Web y Atención (§3, D-93)', () => {
    const { visible } = navFor(['boss']);
    expect(visible.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Redes', 'Obras', 'Municipios', 'Digital', 'Web', 'Atención']);
    expect(visible.map((n) => n.href)).toEqual(['/jefe', '/agenda', '/aprobar', '/redes', '/obras', '/municipios', '/jefe/digital', '/admin/web', '/admin/atencion']);
    expect(visible.map((n) => n.label)).not.toContain('Hoy');
  });

  it('en el teléfono del jefe caben Inicio, Agenda, Por aprobar y Redes, más «Más» con Obras, Municipios, Digital, Web y Atención', () => {
    const { visible, mobile, more } = navFor(['boss']);
    expect(mobile.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Redes']);
    expect(more.map((n) => n.label)).toEqual(['Obras', 'Municipios', 'Digital', 'Web', 'Atención']);
    // Five cells at most on a 360 px phone: four items and «Más».
    expect(mobile.length + (more.length ? 1 : 0)).toBe(5);
    expect([...mobile, ...more]).toEqual(visible);
  });

  it('«Redes» es la puerta del jefe a las pantallas de Redes: las sigue abriendo y el menú lo marca allí', () => {
    const redes = NAV.find((n) => n.href === '/redes')!;
    for (const href of ['/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca']) {
      expect(redes.also, href).toContain(href);
      expect(canOpen(href === '/piezas' ? '/piezas/123' : href, ['boss']), href).toBe(true);
      expect(navFor(['boss']).visible.some((n) => n.href === href), href).toBe(false);
    }
    expect(canOpen('/redes', ['boss'])).toBe(true);
    expect(canOpen('/redes', ['social'])).toBe(true);
    expect(canOpen('/redes', ['dispatch'])).toBe(false);
    const boss = navFor(['boss']).visible;
    const active = (path: string) => boss.filter((n) => isNavActive(path, n, boss)).map((n) => n.label);
    expect(active('/jefe')).toEqual(['Inicio']);
    expect(active('/jefe/politica')).toEqual(['Inicio']);
    expect(active('/jefe/digital')).toEqual(['Digital']);
    expect(active('/redes')).toEqual(['Redes']);
    expect(active('/redes/reels')).toEqual(['Redes']);
    expect(active('/redes/feed')).toEqual(['Redes']);
    expect(active('/piezas/123')).toEqual(['Redes']);
    expect(active('/biblioteca')).toEqual(['Redes']);
    expect(active('/aprobar/123')).toEqual(['Por aprobar']);
    expect(active('/eventos/123')).toEqual([]);
  });

  it('«Piezas» pasa a «Redes» en el menú de Redes y de administración (R4, D-60): el tablero, sin «Piezas»', () => {
    const redes = NAV.find((n) => n.href === '/redes')!;
    expect([...redes.roles].sort()).toEqual(['admin', 'boss', 'social']);
    expect([...(redes.mobile ?? [])].sort()).toEqual(['admin', 'boss', 'social']);
    expect(NAV.some((n) => n.href === '/piezas')).toBe(false);
    expect(NAV.some((n) => n.label === 'Piezas')).toBe(false);
    // Redes: Hoy, Agenda, Redes, Tweets, Publicar, Resultados, Biblioteca; on the phone Hoy, Agenda, Redes, Tweets and «Más».
    const social = navFor(['social']);
    expect(social.visible.map((n) => n.label)).toEqual(['Hoy', 'Agenda', 'Redes', 'Tweets', 'Publicar', 'Resultados', 'Biblioteca']);
    expect(social.mobile.map((n) => n.label)).toEqual(['Hoy', 'Agenda', 'Redes', 'Tweets']);
    expect(social.more.map((n) => n.label)).toEqual(['Publicar', 'Resultados', 'Biblioteca']);
    // Administración: the same with Redes where Piezas was, on the phone too.
    const admin = navFor(['admin']);
    expect(admin.visible.map((n) => n.label)).toEqual(['Hoy', 'Agenda', 'Por aprobar', 'Redes', 'Obras', 'Municipios', 'Tweets', 'Publicar', 'Resultados', 'Biblioteca', 'Web', 'Atención', 'Ajustes']);
    expect(admin.mobile.map((n) => n.label)).toEqual(['Hoy', 'Agenda', 'Redes', 'Ajustes']);
    // The boss's menu: the same Redes (only Web and Atención were added, D-93).
    expect(navFor(['boss']).visible.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Redes', 'Obras', 'Municipios', 'Digital', 'Web', 'Atención']);
    // Whoever has Tweets in the menu sees Tweets marked there, never the hub too; a section of Redes marks Redes.
    const both = navFor(['boss', 'social']).visible;
    expect(both.filter((n) => isNavActive('/tweets', n, both)).map((n) => n.label)).toEqual(['Tweets']);
    expect(both.filter((n) => isNavActive('/redes/posts', n, both)).map((n) => n.label)).toEqual(['Redes']);
    expect(both.filter((n) => isNavActive('/piezas/123', n, both)).map((n) => n.label)).toEqual(['Redes']);
    for (const r of ['social', 'admin'] as const) expect(navFor([r]).visible.filter((n) => isNavActive('/piezas/123', n, navFor([r]).visible)).map((n) => n.label), r).toEqual(['Redes']);
  });

  it('«Crear» → «Nueva pieza» abre «¿Qué quieres crear?» en el tablero; desde un evento sigue /piezas/nueva', () => {
    const item = CREATE_ITEMS.find((c) => c.label === 'Nueva pieza')!;
    expect(item.href).toBe('/redes?crear=1');
    expect([...item.roles].sort()).toEqual(['admin', 'boss', 'social']);
    expect(CREATE_ITEMS.some((c) => c.href === '/piezas/nueva')).toBe(false);
  });

  it('el jefe y el despacho comparten la agenda: los dos crean eventos y visitas de obra; administración no (la base decide)', () => {
    expect(createFor(['boss']).map((c) => c.label)).toEqual(['Nuevo evento', 'Visita de obra', 'Ficha de obra', 'Ficha comunitaria', 'Nueva pieza', 'Tweets de la semana', 'Nueva publicación']);
    expect(createFor(['dispatch']).map((c) => c.label)).toEqual(['Nuevo evento', 'Visita de obra', 'Ficha de obra', 'Ficha comunitaria']);
    expect(createFor(['admin']).map((c) => c.label)).not.toContain('Nuevo evento');
    expect(createFor(['admin']).map((c) => c.label)).not.toContain('Visita de obra');
    expect(createFor(['politics']).map((c) => c.label)).toEqual(['Ficha comunitaria']);
    expect(createFor(['ivt']).map((c) => c.label)).toEqual(['Ficha de obra']);
    expect(createFor(['social', 'camera']).map((c) => c.label)).not.toContain('Ficha comunitaria');
  });

  it('el IVT entra a sus fichas de obra (y «Mis visitas de obra» en la agenda) y política a los municipios; sin contenido ni aprobaciones', () => {
    expect(homeFor(['ivt'])).toBe('/obras');
    expect(homeFor(['politics'])).toBe('/municipios');
    expect(navFor(['ivt']).visible.map((n) => n.href)).toEqual(['/agenda', '/obras']);
    expect(navFor(['politics']).visible.map((n) => n.href)).toEqual(['/municipios']);
    expect(homeFor(['boss'])).toBe('/jefe');
    expect(homeFor(['boss', 'admin'])).toBe('/hoy');
    expect(homeFor(['ivt', 'dispatch'])).toBe('/hoy');
  });

  it('Redes y Grabación no tienen Obras ni Municipios en el menú (Redes nunca ve los reportes)', () => {
    for (const r of ['social', 'camera'] as const) {
      const hrefs = navFor([r]).visible.map((n) => n.href);
      expect(hrefs, r).not.toContain('/obras');
      expect(hrefs, r).not.toContain('/municipios');
    }
    // Despacho fits its five in the phone bar.
    const d = navFor(['dispatch']);
    expect(d.mobile.map((n) => n.label)).toEqual(['Hoy', 'Agenda', 'Obras', 'Municipios', 'Biblioteca']);
    expect(d.more).toEqual([]);
  });

  it('«Por aprobar» es del jefe (y administración lo mira); ya no hay supervisión', () => {
    const aprobar = NAV.find((n) => n.href === '/aprobar')!;
    expect([...aprobar.roles].sort()).toEqual(['admin', 'boss']);
    expect(aprobar.mobile).toEqual(['boss']);
  });
});

describe('doble factor y demostración', () => {
  it('el doble factor lo piden jefe, despacho, política, IVT y administración (config del cliente)', () => {
    const mfa = getClientConfig().mfaRoles as string[];
    for (const r of ['admin', 'boss', 'dispatch', 'politics', 'ivt']) expect(mfa, r).toContain(r);
    for (const r of RETIRED_ROLES) expect(mfa, r).not.toContain(r);
  });

  it('el doble factor lo piden también los seis roles de la web y la atención (config del cliente)', () => {
    const mfa = getClientConfig().mfaRoles as string[];
    for (const r of WEB_ROLES) expect(mfa, r).toContain(r);
  });

  it('un botón por rol del equipo y por rol de la web y la atención, con datos inventados', () => {
    const roles = new Set(DEMO_USERS.flatMap((u) => [...u.roles]));
    expect([...roles].sort()).toEqual([...INVITABLE_ROLES].sort());
    // A responsible in each of two areas, and the team first in «Entrar como…».
    expect(DEMO_USERS.filter((u) => (u.roles as readonly string[]).includes('reports_operator'))).toHaveLength(2);
    expect(DEMO_USERS.slice(0, 9).every((u) => u.roles.every((r) => isStaffRole(r)))).toBe(true);
    expect(DEMO_USERS.find((u) => u.key === 'politics')).toMatchObject({ id: '00000000-0000-4000-8000-000000000010', email: 'politica@demo.test', label: 'Director de política' });
    expect(DEMO_USERS.find((u) => u.key === 'ivt')).toMatchObject({ id: '00000000-0000-4000-8000-000000000011', email: 'ivt@demo.test', label: 'Director del IVT' });
    for (const u of DEMO_USERS) {
      expect(u.email, u.key).toMatch(/@demo\.test$/);
      expect(u.name, u.key).not.toMatch(REAL_NAMES);
    }
    expect(new Set(DEMO_USERS.map((u) => u.id)).size).toBe(DEMO_USERS.length);
  });
});
