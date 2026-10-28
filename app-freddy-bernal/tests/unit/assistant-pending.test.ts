// «¿Qué tengo pendiente?» (the assistant's mis_pendientes) says what each person's home says: despacho's Hoy starts
// with «Por ponerle fecha», the boss's Inicio has the overdue community reports and what waits for a date, política's
// Municipios the overdue reports, the IVT's Obras its drafts and what waits for a date. And it sends each one to their
// own home, not to Hoy. Demo database (PGlite, invented data); every read as the person (RLS).
import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { homeFor, type Role } from '@/lib/roles';
import { TOOLS, runTool } from '@/lib/assistant/tools';
import { escalate } from '@/lib/assistant/escalate';
import { toSchedule } from '@/lib/data/events';
import { overdueReports } from '@/lib/data/fichas';
import { today } from '@/lib/time';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null,
  };
}
type Pending = { total: number; pendientes: { que: string; titulo: string }[]; avisos_sin_leer: number };
async function pendingOf(key: DemoUserKey) {
  const r = await runTool('mis_pendientes', {}, TOOLS, { session: sessionOf(key), conversationId: null, escalate });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as unknown as { result: Pending; goTo: string };
}
const asUser = <T,>(key: DemoUserKey, fn: Parameters<typeof withUser<T>>[1]) => withUser(sessionOf(key).claims, fn);
const titles = (p: Pending, que: string) => p.pendientes.filter((x) => x.que === que).map((x) => x.titulo);

describe('mis pendientes = lo que dice el inicio de cada rol', () => {
  it('cada rol va a su propio inicio: el jefe a Inicio, política a Municipios, el IVT a Obras, los demás a Hoy', async () => {
    for (const key of ['admin', 'boss', 'dispatch', 'politics', 'ivt', 'social', 'camera'] as DemoUserKey[]) {
      const r = await pendingOf(key);
      expect(r.goTo, key).toBe(homeFor(sessionOf(key).roles));
    }
    expect((await pendingOf('politics')).goTo).toBe('/municipios');
    expect((await pendingOf('ivt')).goTo).toBe('/obras');
  });

  it('el despacho: «Por ponerle fecha» primero, las mismas fichas que su Hoy (solo el título)', async () => {
    const waiting = await asUser('dispatch', (sql) => toSchedule(sql, 10));
    expect(waiting.length).toBeGreaterThan(0);
    const r = (await pendingOf('dispatch')).result;
    expect(titles(r, 'Por ponerle fecha')).toEqual(waiting.map((w) => w.title));
    expect(r.pendientes[0]!.que).toBe('Por ponerle fecha');
    expect(r.total).toBeGreaterThan(waiting.length);
  });

  it('el jefe: lo vencido y lo que espera fecha, además de lo que aprueba y decide', async () => {
    const t0 = today().toISODate()!;
    const late = await asUser('boss', (sql) => overdueReports(sql, t0, 5));
    const waiting = await asUser('boss', (sql) => toSchedule(sql, 10));
    expect(late.length).toBeGreaterThan(0);
    const r = (await pendingOf('boss')).result;
    expect(titles(r, 'Vencida')).toEqual(late.map((x) => x.title));
    expect(titles(r, 'Por ponerle fecha')).toEqual(waiting.map((w) => w.title).filter((t) => r.pendientes.some((p) => p.titulo === t)));
    // What waits for his approval first (his job), then what is overdue and what waits for a date.
    expect(r.pendientes[0]!.que).toMatch(/^Te toca aprobar/);
    expect(r.total).toBeGreaterThanOrEqual(late.length + waiting.length);
  });

  it('política: sus reportes vencidos (lo que sale arriba en Municipios)', async () => {
    const late = await asUser('politics', (sql) => overdueReports(sql, today().toISODate()!, 5));
    expect(late.length).toBeGreaterThan(0);
    const r = (await pendingOf('politics')).result;
    expect(titles(r, 'Vencida')).toEqual(late.map((x) => x.title));
    expect(titles(r, 'Por ponerle fecha')).toEqual([]);
  });

  it('el IVT: sus fichas en borrador y cuántas esperan fecha (nunca la fecha)', async () => {
    const drafts = await asUser('ivt', (sql) => sql.query<{ name: string }>(`select name from public.obra_fichas where stage = 'draft' and deleted_at is null order by updated_at desc limit 5`));
    const waiting = (await asUser('ivt', (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.obra_fichas where stage = 'to_schedule' and deleted_at is null`)))!.n;
    const r = (await pendingOf('ivt')).result;
    expect(titles(r, 'Ficha de obra en borrador')).toEqual(drafts.map((d) => d.name));
    if (waiting) expect(titles(r, 'Esperan fecha (la ponen el jefe o el despacho)')).toEqual([`${waiting} ${waiting === 1 ? 'obra' : 'obras'} por ponerle fecha`]);
    expect(r.total).toBeGreaterThan(0);
  });

  it('Redes, Grabación y Administración no reciben «Por ponerle fecha» ni lo vencido de los municipios', async () => {
    for (const key of ['social', 'camera', 'admin'] as DemoUserKey[]) {
      const r = (await pendingOf(key)).result;
      expect(titles(r, 'Por ponerle fecha'), key).toEqual([]);
      expect(titles(r, 'Vencida'), key).toEqual([]);
    }
  });
});
