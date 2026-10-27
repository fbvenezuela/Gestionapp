// The six roles in the code (Hillary, 27/10/2026): the TypeScript lists mirror the database enum, the team is
// exactly six, Administración is apart, the retired roles are gone from every menu, and the demo has a button for
// each team role.
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
  isTeamRole,
  navFor,
  type Role,
} from '@/lib/roles';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { getClientConfig } from '@/lib/client-config';

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

  it('el jefe tiene las pantallas de Redes; en el teléfono caben con «Más»', () => {
    const { visible, mobile, more } = navFor(['boss']);
    const labels = visible.map((n) => n.label);
    for (const l of ['Inicio', 'Agenda', 'Por aprobar', 'Piezas', 'Tweets', 'Publicar', 'Resultados', 'Biblioteca', 'Digital']) expect(labels, l).toContain(l);
    expect(labels).not.toContain('Hoy');
    expect(mobile.map((n) => n.label)).toEqual(['Inicio', 'Agenda', 'Por aprobar', 'Digital']);
    expect(mobile.length + (more.length ? 1 : 0)).toBeLessThanOrEqual(5);
    expect([...mobile, ...more].length).toBe(visible.length);
  });

  it('el jefe crea piezas, tweets y publicaciones; el evento todavía es de despacho (la base decide)', () => {
    const boss = createFor(['boss']).map((c) => c.label);
    expect(boss).toEqual(['Nueva pieza', 'Tweets de la semana', 'Nueva publicación']);
    expect(createFor(['dispatch']).map((c) => c.label)).toEqual(['Nuevo evento']);
    expect(createFor(['politics'])).toEqual([]);
    expect(createFor(['ivt'])).toEqual([]);
  });

  it('política e IVT entran a Hoy (sus pantallas llegan con las fichas); sin agenda, contenido ni aprobaciones', () => {
    for (const r of ['politics', 'ivt'] as const) {
      expect(homeFor([r]), r).toBe('/hoy');
      expect(navFor([r]).visible.map((n) => n.href), r).toEqual(['/hoy']);
    }
    expect(homeFor(['boss'])).toBe('/jefe');
    expect(homeFor(['boss', 'admin'])).toBe('/hoy');
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
      expect(u.name, u.key).not.toMatch(/William|[ÁA]ngel|Hillary/i);
    }
    expect(new Set(DEMO_USERS.map((u) => u.id)).size).toBe(DEMO_USERS.length);
  });
});
