// The six roles in the code (cambios del 27/10/2026): the TypeScript lists mirror the database enum, the team is
// exactly six, Administración is apart, the retired roles are gone from every menu, and the demo has a button for
// each team role.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createMemoryDb } from '@/lib/db/pglite';
import {
  CREATE_ITEMS,
  FUTURE_ROLES,
  INVITABLE_ROLES,
  NAV,
  RETIRED_ROLES,
  ROLES,
  ROLE_LABEL,
  TEAM_ROLES,
  createFor,
  homeFor,
  isInvitableRole,
  isNavActive,
  isTeamRole,
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
    expect([...INVITABLE_ROLES].sort()).toEqual([...TEAM_ROLES, 'admin'].sort());
    for (const r of [...RETIRED_ROLES, ...FUTURE_ROLES]) {
      expect(isInvitableRole(r), r).toBe(false);
      expect(isTeamRole(r), r).toBe(false);
    }
    expect(isTeamRole('admin')).toBe(false);
    expect(isInvitableRole('admin')).toBe(true);
    expect([...RETIRED_ROLES, ...FUTURE_ROLES, ...INVITABLE_ROLES].sort()).toEqual([...ROLES].sort());
  });

  it('cada valor tiene su nombre en español', () => {
    for (const r of ROLES) expect(ROLE_LABEL[r], r).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(ROLE_LABEL.politics).toBe('Director de política');
    expect(ROLE_LABEL.ivt).toBe('Director del IVT');
  });
});

describe('menús', () => {
  const retired = (rs: readonly Role[]) => rs.filter((r) => (RETIRED_ROLES as readonly string[]).includes(r));

  it('ningún menú ni botón de «Crear» nombra un rol retirado o de la fase 3', () => {
    for (const n of NAV) {
      expect(retired(n.roles), n.href).toEqual([]);
      expect(retired(n.mobile ?? []), n.href).toEqual([]);
      for (const r of n.roles) expect(isInvitableRole(r), `${n.href} ${r}`).toBe(true);
    }
    for (const c of CREATE_ITEMS) for (const r of c.roles) expect(isInvitableRole(r), `${c.href} ${r}`).toBe(true);
  });

  it('el menú del jefe: Inicio, Agenda, Por aprobar, Redes, Obras, Municipios y Digital (§3)', () => {
    const { visible } = navFor(['boss']);
    expect(visible.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Redes', 'Obras', 'Municipios', 'Digital']);
    expect(visible.map((n) => n.href)).toEqual(['/jefe', '/agenda', '/aprobar', '/redes', '/obras', '/municipios', '/jefe/digital']);
    expect(visible.map((n) => n.label)).not.toContain('Hoy');
  });

  it('en el teléfono del jefe caben Inicio, Agenda, Por aprobar y Redes, más «Más» con Obras, Municipios y Digital', () => {
    const { visible, mobile, more } = navFor(['boss']);
    expect(mobile.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Redes']);
    expect(more.map((n) => n.label)).toEqual(['Obras', 'Municipios', 'Digital']);
    // Five cells at most on a 360 px phone: four items and «Más».
    expect(mobile.length + (more.length ? 1 : 0)).toBe(5);
    expect([...mobile, ...more]).toEqual(visible);
  });

  it('«Redes» es la puerta del jefe a las pantallas de Redes: las sigue abriendo y el menú lo marca allí', () => {
    const redes = NAV.find((n) => n.href === '/redes')!;
    expect(redes.roles).toEqual(['boss']);
    for (const href of ['/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca']) {
      expect(redes.also, href).toContain(href);
      expect(canOpen(href, ['boss']), href).toBe(true);
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
    expect(active('/piezas/123')).toEqual(['Redes']);
    expect(active('/biblioteca')).toEqual(['Redes']);
    expect(active('/aprobar/123')).toEqual(['Por aprobar']);
    expect(active('/eventos/123')).toEqual([]);
    // Whoever has Piezas in the menu sees Piezas marked, never the hub too.
    const both = navFor(['boss', 'social']).visible;
    expect(both.filter((n) => isNavActive('/piezas', n, both)).map((n) => n.label)).toEqual(['Piezas']);
    // Redes keeps its own menu (the hub is not in it until the client confirms Redes by format).
    expect(navFor(['social']).visible.map((n) => n.href)).toEqual(['/hoy', '/agenda', '/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca']);
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

  it('un botón por rol del equipo, con datos inventados', () => {
    const roles = new Set(DEMO_USERS.flatMap((u) => [...u.roles]));
    expect([...roles].sort()).toEqual([...INVITABLE_ROLES].sort());
    expect(DEMO_USERS.find((u) => u.key === 'politics')).toMatchObject({ id: '00000000-0000-4000-8000-000000000010', email: 'politica@demo.test', label: 'Director de política' });
    expect(DEMO_USERS.find((u) => u.key === 'ivt')).toMatchObject({ id: '00000000-0000-4000-8000-000000000011', email: 'ivt@demo.test', label: 'Director del IVT' });
    for (const u of DEMO_USERS) {
      expect(u.email, u.key).toMatch(/@demo\.test$/);
      expect(u.name, u.key).not.toMatch(REAL_NAMES);
    }
    expect(new Set(DEMO_USERS.map((u) => u.id)).size).toBe(DEMO_USERS.length);
  });
});
