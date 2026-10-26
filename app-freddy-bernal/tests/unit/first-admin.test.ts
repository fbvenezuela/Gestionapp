// scripts/create-first-admin.mts against the in-memory database (same migrations and the same
// trigger that gives roles to a new Auth user). Supabase Auth is a fake that inserts into the
// shim's auth.users, like the real createUser does. Every statement commits on its own, as in the
// script (Auth reads the invitation from another connection).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Row, Sql } from '@/lib/db/core';
import { makeTestDb, type TestDb } from '../rls/setup';
import { createFirstAdmin, hideEmails, type CreateAuthUser } from '../../scripts/first-admin';

let t: TestDb;
let sql: Sql;

beforeAll(async () => {
  t = await makeTestDb();
  sql = {
    query: <T = Row,>(q: string, p: unknown[] = []) => t.system((s) => s.query<T>(q, p)),
    one: <T = Row,>(q: string, p: unknown[] = []) => t.system((s) => s.one<T>(q, p)),
  };
});

const authOk: CreateAuthUser = vi.fn(async (email, name) => {
  await t.system((s) => s.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::text::jsonb)`, [email, JSON.stringify({ full_name: name })]));
  return { error: null };
});
const authFails = (message: string): CreateAuthUser => vi.fn(async () => ({ error: message }));

const invitations = (email: string) =>
  t.system((s) =>
    s.query<{ roles: string[]; accepted: boolean; revoked: boolean }>(
      `select roles::text[] as roles, accepted_at is not null as accepted, revoked_at is not null as revoked from public.invitations where lower(email) = $1 order by created_at`,
      [email],
    ),
  );
const isAdmin = async (email: string) =>
  !!(await t.system((s) => s.one(`select 1 from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'admin' where p.email = $1`, [email])));

// Every message the script could print, to check that the email never shows.
function run(email: string, createUser: CreateAuthUser) {
  const said: string[] = [];
  return createFirstAdmin({ sql, email, name: 'Persona Inventada', createUser, warn: (m) => said.push(m) }).then((r) => {
    if (!r.ok) said.push(r.message);
    for (const m of said) expect(m).not.toContain(email.split('@')[0]);
    return r;
  });
}

describe('primer administrador', () => {
  it('se niega sin la configuración del cliente (security.mfa_roles) y no toca nada', async () => {
    const saved = await t.system((s) => s.one<{ value: unknown }>(`select value from public.app_settings where key = 'security.mfa_roles'`));
    await t.system((s) => s.query(`delete from public.app_settings where key = 'security.mfa_roles'`));
    const createUser = vi.fn(authOk);
    const r = await run('sinconfig@ejemplo.test', createUser);
    await t.system((s) => s.query(`insert into public.app_settings (key, value) values ('security.mfa_roles', $1::text::jsonb)`, [JSON.stringify(saved!.value)]));
    expect(r).toEqual({ ok: false, message: expect.stringContaining('security.mfa_roles') });
    expect(createUser).not.toHaveBeenCalled();
    expect(await invitations('sinconfig@ejemplo.test')).toEqual([]);
  });

  it('crea la invitación y la persona queda como administrador', async () => {
    expect(await run('Primera@Ejemplo.test', authOk)).toEqual({ ok: true, reused: false });
    expect(await invitations('primera@ejemplo.test')).toEqual([{ roles: ['admin'], accepted: true, revoked: false }]);
    expect(await isAdmin('primera@ejemplo.test')).toBe(true);
  });

  it('si Supabase falla, revoca la invitación de esta corrida y sale con error', async () => {
    const r = await run('falla@ejemplo.test', authFails('User already registered: falla@ejemplo.test'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/^Supabase no creó el usuario: User already registered: \[correo\]\. La invitación de esta corrida quedó revocada\.$/);
    expect(await invitations('falla@ejemplo.test')).toEqual([{ roles: ['admin'], accepted: false, revoked: true }]);
    // Another try does not leave a second pending invitation either.
    expect((await run('falla@ejemplo.test', authFails('otra vez'))).ok).toBe(false);
    expect((await invitations('falla@ejemplo.test')).filter((i) => !i.revoked && !i.accepted)).toEqual([]);
  });

  it('si Supabase lanza un error, también limpia', async () => {
    const r = await run('lanza@ejemplo.test', vi.fn(async () => Promise.reject(new Error('fetch failed'))));
    expect(r).toEqual({ ok: false, message: expect.stringContaining('fetch failed') });
    expect(await invitations('lanza@ejemplo.test')).toEqual([{ roles: ['admin'], accepted: false, revoked: true }]);
  });

  it('usa la invitación de administrador que ya estaba pendiente, sin repetirla', async () => {
    await t.system((s) => s.query(`insert into public.invitations (email, full_name, roles) values ('pendiente@ejemplo.test', 'Ya invitada', '{admin}')`));
    expect(await run('pendiente@ejemplo.test', authOk)).toEqual({ ok: true, reused: true });
    expect(await invitations('pendiente@ejemplo.test')).toEqual([{ roles: ['admin'], accepted: true, revoked: false }]);
    expect(await isAdmin('pendiente@ejemplo.test')).toBe(true);
  });

  it('si falla con una invitación que ya existía, la deja como estaba', async () => {
    await t.system((s) => s.query(`insert into public.invitations (email, roles) values ('espera@ejemplo.test', '{admin}')`));
    expect((await run('espera@ejemplo.test', authFails('no'))).ok).toBe(false);
    expect(await invitations('espera@ejemplo.test')).toEqual([{ roles: ['admin'], accepted: false, revoked: false }]);
  });

  it('una invitación pendiente sin administración no sirve: crea la de administrador', async () => {
    await t.system((s) => s.query(`insert into public.invitations (email, roles) values ('redes@ejemplo.test', '{social}')`));
    expect(await run('redes@ejemplo.test', authOk)).toEqual({ ok: true, reused: false });
    expect(await isAdmin('redes@ejemplo.test')).toBe(true);
  });

  it('dice si el usuario se creó pero no quedó como administrador', async () => {
    // Auth "creates" the user but the invitation was revoked meanwhile: the trigger gives no role.
    const sneaky: CreateAuthUser = async (email, name) => {
      await t.system((s) => s.query(`update public.invitations set revoked_at = now() where lower(email) = $1`, [email]));
      return authOk(email, name);
    };
    const r = await run('sinrol@ejemplo.test', sneaky);
    expect(r).toEqual({ ok: false, message: expect.stringContaining('no quedó como administrador') });
  });

  it('rechaza un correo mal escrito sin tocar la base', async () => {
    const createUser = vi.fn(authOk);
    expect(await run('no-es-correo', createUser)).toEqual({ ok: false, message: 'El correo no es válido.' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('hideEmails tapa cualquier correo de un mensaje', () => {
    expect(hideEmails('A user with email juan.perez+x@correo.example already exists (x@y.co)')).toBe('A user with email [correo] already exists ([correo])');
    expect(hideEmails('sin correo')).toBe('sin correo');
  });
});
