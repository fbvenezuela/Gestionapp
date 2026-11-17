// Everything 360 runs in the database carries app.caller = 'assistant' (R3, D-50, S8; design §8.7): its only way in
// is src/lib/assistant/db.ts (db as the person, system for its own tables), and both mark the transaction first.
// In the code (no file of 360 opens the database any other way) and on the demo database (the mark is there, it stays
// in that transaction, and with it the person reads nothing of Mensajes while the same person, without it, does).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Session } from '@/lib/auth/session';
import { db as personDb } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { ASSISTANT_CALLER, asAssistant, db, system } from '@/lib/assistant/db';

const dir = 'src/lib/assistant';
// Its files and the answers' folder (D-89).
const files = fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f));
const read = (f: string) => fs.readFileSync(f, 'utf8');
// Opening the database: the person's db(), withUser, withSystem, asUser, asSystem or the backend.
const OPENS = /import\s*\{[^}]*\b(db|withUser|withSystem|asUser|asSystem|getBackend)\b[^}]*\}\s*from\s*['"](?:\.\.\/auth\/session|\.\.\/db(?:\/core|\/index)?|@\/lib\/auth\/session|@\/lib\/db(?:\/core|\/index)?)['"]/;

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

describe('en el código: todo db( de 360 pasa por asAssistant', () => {
  it('solo db.ts abre la base; los demás usan su db y su system', () => {
    expect(files.length).toBeGreaterThan(10);
    const bad = files.filter((f) => !f.endsWith('db.ts') && OPENS.test(read(f)));
    expect(bad).toEqual([]);
    const users = files.filter((f) => /\b(db|system)\(/.test(read(f)) && !f.endsWith('db.ts'));
    expect(users.length).toBeGreaterThanOrEqual(5);
    for (const f of users) expect(read(f), f).toMatch(/from '\.\/db'/);
  });

  it('db.ts marca cada transacción antes de entregarla (como la persona y como el sistema)', () => {
    const src = read(path.join(dir, 'db.ts'));
    expect(src).toContain("set_config('app.caller', $1, true)");
    expect(src).toMatch(/personDb\(s, async \(sql\) => fn\(await asAssistant\(sql\)\)\)/);
    expect(src).toMatch(/withSystem\(async \(sql\) => fn\(await asAssistant\(sql\)\)\)/);
    expect(ASSISTANT_CALLER).toBe('assistant');
  });

  it('la ruta de 360 no abre la base; la ventana lee con el db de 360', () => {
    expect(read('src/app/api/asistente/route.ts')).not.toMatch(/\b(db|withUser|withSystem)\(/);
    const mount = read('src/components/assistant/assistant-mount.tsx');
    expect(mount).toContain("import { db } from '@/lib/assistant/db';");
    expect(mount).not.toMatch(/import \{[^}]*\bdb\b[^}]*\} from '@\/lib\/auth\/session'/);
  });
});

describe('en la base de demostración', () => {
  const caller = `select coalesce(current_setting('app.caller', true), '') as c`;

  it('la marca va en cada transacción de 360 y solo en ella', async () => {
    const s = sessionOf('social');
    expect((await db(s, (sql) => sql.one<{ c: string }>(caller)))?.c).toBe('assistant');
    expect((await system((sql) => sql.one<{ c: string }>(caller)))?.c).toBe('assistant');
    // Local to the transaction: the next one (the person's own screens) does not carry it.
    expect((await personDb(s, (sql) => sql.one<{ c: string }>(caller)))?.c).toBe('');
    expect((await withSystem((sql) => sql.one<{ c: string }>(caller)))?.c).toBe('');
    expect((await withSystem(async (sql) => (await asAssistant(sql)).one<{ c: string }>(caller)))?.c).toBe('assistant');
  });

  it('con la marca, la misma persona no lee nada de Mensajes (sin ella, sí)', async () => {
    for (const key of ['social', 'boss'] as const) {
      const s = sessionOf(key);
      const q = `select count(*)::int as n from public.chat_messages`;
      const plain = (await personDb(s, (sql) => sql.one<{ n: number }>(q)))!.n;
      expect(plain, key).toBeGreaterThan(0);
      expect((await db(s, (sql) => sql.one<{ n: number }>(q)))!.n, key).toBe(0);
      expect(await db(s, (sql) => sql.query(`select * from public.chat_people()`)), key).toEqual([]);
    }
  });

  // Atención the same (WF-C, decision 4; 20261117000100_asistente_sin_solicitudes.sql): with the mark nobody reads a
  // case or anything around it, a contact, the figures, the templates or the people of the desk, and no case changes;
  // without it, each one reads what their role reads. (The web and attention roles get no 360: the wall is for the boss
  // and Administración, who do, and for any way in that would carry the mark.)
  const DESK_TABLES = ['requests', 'request_supports', 'request_events', 'request_messages', 'request_attachments', 'attended_publications', 'request_reply_templates'];
  const count = (t: string) => `select count(*)::int as n from public.${t}`;

  it('con la marca, nadie lee nada de Atención: casos, lo que tienen alrededor, plantillas (sin ella, cada quien lo suyo)', async () => {
    for (const key of ['boss', 'admin', 'attention', 'auditView', 'servicesLead', 'complaintsDesk'] as const) {
      const s = sessionOf(key);
      for (const t of DESK_TABLES) expect((await db(s, (sql) => sql.one<{ n: number }>(count(t))))!.n, `${key} ${t}`).toBe(0);
    }
    // Without the mark: the boss reads the cases (no denuncias) and «lo atendido»; the coordinator, all and the templates.
    for (const [key, t] of [['boss', 'requests'], ['boss', 'request_events'], ['boss', 'attended_publications'], ['attention', 'requests'], ['attention', 'request_messages'], ['attention', 'request_reply_templates']] as const)
      expect((await personDb(sessionOf(key), (sql) => sql.one<{ n: number }>(count(t))))!.n, `${key} ${t}`).toBeGreaterThan(0);
  });

  it('con la marca, ni contactos, ni cifras, ni la gente de Atención, y ningún caso cambia', async () => {
    const boss = sessionOf('boss');
    const coord = sessionOf('attention');
    const one = (await personDb(coord, (sql) => sql.one<{ id: string }>(`select id from public.requests where type <> 'denuncia' order by created_at limit 1`)))!.id;
    // The figures: the boss, yes; with the mark, no.
    expect((await personDb(boss, (sql) => sql.one<{ v: { received: number } }>(`select public.request_stats() as v`)))!.v.received).toBeGreaterThan(0);
    await expect(db(boss, (sql) => sql.one(`select public.request_stats() as v`))).rejects.toThrow(/cifras de atención/);
    // A contact: the coordinator, yes; with the mark, no.
    await expect(personDb(coord, (sql) => sql.query(`select * from public.request_contact($1)`, [one]))).resolves.toBeDefined();
    await expect(db(coord, (sql) => sql.query(`select * from public.request_contact($1)`, [one]))).rejects.toThrow(/contacto/);
    // The people of the desk (Administración keeps the areas): without the mark, rows; with it, none.
    for (const key of ['admin', 'attention'] as const) {
      expect((await personDb(sessionOf(key), (sql) => sql.query(`select * from public.attention_staff()`))).length, key).toBeGreaterThan(0);
      expect(await db(sessionOf(key), (sql) => sql.query(`select * from public.attention_staff()`)), key).toEqual([]);
    }
    expect((await personDb(coord, (sql) => sql.one<{ v: boolean }>(`select public.can_answer_requests() as v`)))!.v).toBe(true);
    expect((await db(coord, (sql) => sql.one<{ v: boolean }>(`select public.can_answer_requests() as v`)))!.v).toBe(false);
    // Nothing changes with the mark (each one refuses before it writes).
    for (const [q, p] of [
      [`select public.set_request_priority($1, 'alta', 'prueba') as v`, [one]],
      [`select public.add_request_message($1, 'internal_note', 'Nota de prueba') as v`, [one]],
      [`select public.merge_request($1, $1, 'prueba') as v`, [one]],
      [`select public.publish_attended($1, 'Resumen de prueba para la web') as v`, [one]],
      [`select public.withdraw_attended($1, 'prueba') as v`, [one]],
      [`select public.log_attention_export(1, '{}'::jsonb, false) as v`, []],
    ] as const)
      await expect(db(coord, (sql) => sql.query(q, [...p])), q).rejects.toThrow();
    // (And the case is as it was: the mark changed nothing.)
    const after = (await personDb(coord, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.request_events where request_id = $1 and actor_id = $2 and created_at > now() - interval '1 minute'`, [one, coord.userId])))!.n;
    expect(after).toBe(0);
  });
});
