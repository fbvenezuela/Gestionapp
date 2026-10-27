// The assistant's tables: RLS on, no policies, no grants. Nobody with a browser (anon or
// any signed-in role, admin included) can read or write them, nor call their functions.
// Only the server (system connection) touches them.
import { describe, it, expect, beforeAll } from 'vitest';
import { asUser } from '@/lib/db/core';
import { makeTestDb, type TestDb } from './setup';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
  await t.system(async (sql) => {
    const c = await sql.one<{ id: string }>(`insert into public.assistant_conversations (user_id, title) values ($1, 'prueba') returning id`, [t.ids.social]);
    await sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'persona', 'hola, ¿qué tengo pendiente?')`, [c!.id]);
    await sql.query(`insert into public.assistant_heard (role, text) values ('social', 'una pregunta de prueba larga')`);
    await sql.query(`insert into public.assistant_drafts (kind, created_by, summary, body) values ('aviso', $1, 'Aviso de prueba', 'texto')`, [t.ids.admin]);
    await sql.query(`insert into public.assistant_actions (user_id, action) values ($1, 'marcar_avisos_leidos')`, [t.ids.social]);
  });
});

const TABLES = ['assistant_knowledge', 'assistant_scripts', 'assistant_conversations', 'assistant_messages', 'assistant_heard', 'assistant_drafts', 'assistant_actions'];
const WHO = ['admin', 'boss', 'dispatch', 'politics', 'ivt', 'social', 'camera'] as const;

describe('tablas del asistente: solo el servidor', () => {
  it('RLS encendido y sin ninguna política', async () => {
    const r = await t.system((sql) =>
      sql.query<{ relname: string; rls: boolean; policies: number }>(
        `select c.relname, c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
           from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'assistant\\_%' and c.relkind = 'r'`,
      ),
    );
    expect(r.map((x) => x.relname).sort()).toEqual([...TABLES].sort());
    for (const x of r) expect(x, x.relname).toMatchObject({ rls: true, policies: 0 });
  });

  for (const table of TABLES) {
    it(`${table}: ningún rol con sesión puede leer, escribir, cambiar ni borrar`, async () => {
      for (const who of WHO) {
        await expect(t.as(who, (sql) => sql.query(`select * from public.${table} limit 1`)), `${who} select`).rejects.toThrow(/permission denied/i);
        await expect(t.as(who, (sql) => sql.query(`insert into public.${table} default values`)), `${who} insert`).rejects.toThrow(/permission denied/i);
        await expect(t.as(who, (sql) => sql.query(`update public.${table} set created_at = now()`)), `${who} update`).rejects.toThrow(/permission denied/i);
        await expect(t.as(who, (sql) => sql.query(`delete from public.${table}`)), `${who} delete`).rejects.toThrow(/permission denied/i);
      }
    });
  }

  it('anon tampoco', async () => {
    for (const table of TABLES) {
      await expect(
        t.backend.transaction(async (sql) => {
          await sql.query('set local role anon');
          return sql.query(`select * from public.${table} limit 1`);
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('las funciones del asistente no se pueden llamar con sesión', async () => {
    for (const q of [
      `select * from public.assistant_scripts_for('hola', '{admin}', 3, false)`,
      `select public.assistant_refresh()`,
      `select public.assistant_put_auto('auto:x', null, 't', 'b', '{}')`,
    ]) {
      await expect(t.as('admin', (sql) => sql.query(q)), q).rejects.toThrow(/permission denied/i);
    }
  });

  it('tampoco administración sin doble factor (aal1)', async () => {
    await expect(asUser(t.backend, { sub: t.ids.admin, aal: 'aal1' }, (sql) => sql.query(`select * from public.assistant_messages`))).rejects.toThrow(/permission denied/i);
  });

  it('el servidor sí: y lo dicho no se borra ni se cambia', async () => {
    const n = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_messages`));
    expect(n!.n).toBeGreaterThan(0);
    await expect(t.system((sql) => sql.query(`delete from public.assistant_messages`))).rejects.toThrow(/no se borra/);
    await expect(t.system((sql) => sql.query(`update public.assistant_messages set body = 'otra cosa'`))).rejects.toThrow(/no se borra/);
    await expect(t.system((sql) => sql.query(`delete from public.assistant_conversations`))).rejects.toThrow(/no se borra/);
  });

  it('cambiar categorías o fórmulas con sesión de admin sigue funcionando (el disparador no estorba)', async () => {
    await t.as('admin', (sql) => sql.query(`update public.copy_formulas set description = 'Desde el panel.' where code = 'FAB'`));
    const f = await t.system((sql) => sql.one<{ body: string }>(`select body from public.assistant_knowledge where key = 'auto:formula:FAB'`));
    expect(f!.body).toContain('Desde el panel.');
  });
});
