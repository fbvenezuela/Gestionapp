// The live counters of the boss's Inicio and of the Redes hub (src/lib/data/home-counts.ts), tried against the
// database: the boss sees everything (his numbers are the system's), a cancelled event never counts, and someone
// without the right to the agenda gets zeros from the date-based counters (RLS, not the screen). Invented data only.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { bossCounts, redesCounts } from '@/lib/data/home-counts';
import { today } from '@/lib/time';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const day = () => {
  const t0 = today();
  return [t0.toUTC().toISO()!, t0.plus({ days: 1 }).toUTC().toISO()!] as const;
};
const boss = (who: DemoUserKey = 'boss', aal: 'aal1' | 'aal2' = 'aal2') => t.as(who, (sql) => bossCounts(sql, ...day()), aal);
const redes = (who: DemoUserKey) => t.as(who, (sql) => redesCounts(sql));
let n = 0;

describe('los contadores del inicio del jefe y de Redes', () => {
  it('el jefe lo ve todo: sus números son los de la base entera', async () => {
    const all = await t.system((sql) => bossCounts(sql, ...day()));
    expect(await boss()).toEqual(all);
    expect(await redes('boss')).toEqual(await t.system((sql) => redesCounts(sql)));
    // The demo has fichas waiting for a date and obras in several stages: the tiles are not empty.
    expect(all.politics.toSchedule).toBeGreaterThan(0);
    expect(Object.values(all.obras.stages).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(all.obras.municipalities.length).toBeGreaterThan(0);
  });

  it('Redes cuenta lo mismo que la base en sus pantallas (piezas, tweets, publicaciones, resultados y biblioteca)', async () => {
    expect(await redes('social')).toEqual(await t.system((sql) => redesCounts(sql)));
  });

  it('un evento cancelado no cuenta: ni hoy, ni por decidir, ni en la biblioteca', async () => {
    const before = await boss();
    const lib = { boss: (await redes('boss')).library.events, social: (await redes('social')).library.events };
    // The boss adds an event for today (accepted at once) with material; despacho proposes one (waits for the boss).
    const mine = await t.as('boss', async (sql) => {
      const id = (await sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ($1, 'Sitio de prueba (demo)', auth.uid()) returning id`, [
        `Evento de los contadores ${++n} (demo)`,
      ]))!.id;
      await sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')`, [id]);
      return id;
    });
    const proposed = await t.as('dispatch', async (sql) =>
      (await sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ($1, 'Sitio de prueba (demo)', auth.uid()) returning id`, [
        `Propuesta de los contadores ${++n} (demo)`,
      ]))!.id,
    );
    await t.system((sql) =>
      sql.query(`insert into public.media_assets (event_id, kind, storage_path, label, mime, status) values ($1, 'boss', $2, 'Jefe hablando 1', 'video/mp4', 'ready')`, [mine, `${mine}/contadores.mp4`]),
    );
    const during = await boss();
    expect(during.politics.today).toBe(before.politics.today + 1);
    expect(during.politics.pending).toBe(before.politics.pending + 1);
    expect((await redes('boss')).library.events).toBe(lib.boss + 1);
    expect((await redes('social')).library.events).toBe(lib.social + 1);

    await t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = 'Prueba de los contadores (demo)' where id = any($1::uuid[])`, [[mine, proposed]]));
    const after = await boss();
    expect(after.politics).toEqual(before.politics);
    expect((await redes('boss')).library.events).toBe(lib.boss);
    expect((await redes('social')).library.events).toBe(lib.social);
  });

  it('quien no ve la agenda recibe ceros en lo que tiene fecha: la base lo decide, no la pantalla', async () => {
    for (const who of ['social', 'camera2', 'politics'] as const) {
      const c = await boss(who);
      expect(c.politics.today, who).toBe(0);
      if (who !== 'politics') expect(c.politics.toSchedule, who).toBe(0);
      // Redes and Grabación read an obra ficha only through a visit they can see (never one waiting for a date or a
      // draft); política never reads obras.
      if (who === 'politics') expect(c.obras.stages, who).toEqual({});
      expect(c.obras.stages.to_schedule, who).toBeUndefined();
      expect(c.obras.stages.draft, who).toBeUndefined();
      expect(c.obras.municipalities.every((m) => m.to_schedule === 0), who).toBe(true);
    }
    // Without 2FA the boss does not read the schedule either.
    expect((await boss('boss', 'aal1')).politics.today).toBe(0);
  });
});
